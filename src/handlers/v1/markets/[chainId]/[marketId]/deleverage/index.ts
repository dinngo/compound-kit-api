import BigNumberJS from 'bignumber.js';
import { DeleverageQuotation, QuoteAPIResponseBody } from 'src/types';
import {
  EventBody,
  EventPathParameters,
  Route,
  formatJSONResponse,
  newHttpError,
  newInternalServerError,
} from 'src/libs/api';
import { MarketInfo, Service, calcHealthRate, calcNetAPR, calcUtilization } from 'src/libs/compound-v3';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import { utils } from 'ethers';
import { validateMarket } from 'src/validations';

type GetDeleverageQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{ account?: string; token?: common.TokenObject; amount?: string; slippage?: number }>;

type GetDeleverageQuotationResponseBody = QuoteAPIResponseBody<DeleverageQuotation>;

export const v1GetDeleverageQuotationRoute: Route<GetDeleverageQuotationRouteParams> = {
  method: 'POST',
  path: '/v1/markets/{chainId}/{marketId}/deleverage',
  handler: async (event) => {
    const chainId = Number(event.pathParameters.chainId);
    const marketId = event.pathParameters.marketId.toUpperCase();
    if (!validateMarket(chainId, marketId)) {
      throw newHttpError(400, { code: '400.1', message: 'market does not exist' });
    }

    if (!event.body) {
      throw newHttpError(400, { code: '400.2', message: 'body is invalid' });
    }

    let account = event.body.account;
    if (!account) {
      throw newHttpError(400, { code: '400.3', message: `account can't be blank` });
    }
    try {
      account = utils.getAddress(account);
    } catch {
      throw newHttpError(400, { code: '400.4', message: 'account is invalid' });
    }

    const service = new Service(chainId);

    let marketInfo: MarketInfo;
    try {
      marketInfo = await service.getMarketInfo(marketId, account);
    } catch (err) {
      throw newInternalServerError(err);
    }
    const { utilization, healthRate, liquidationThreshold, borrowUSD, collateralUSD, netAPR } = marketInfo;
    const currentPosition = { utilization, healthRate, liquidationThreshold, borrowUSD, collateralUSD, netAPR };

    const logics: GetDeleverageQuotationResponseBody['logics'] = [];
    let approvals: GetDeleverageQuotationResponseBody['approvals'] = [];
    let targetPosition = currentPosition;
    if (event.body.token && event.body.amount && Number(event.body.amount) > 0) {
      const { token, amount, slippage } = event.body;
      const {
        baseToken,
        baseTokenPrice,
        supplyAPR,
        supplyUSD,
        borrowAPR,
        borrowCapacityUSD,
        liquidationLimit,
        collaterals,
      } = marketInfo;

      const deleverageCollateralToken = common.Token.from(token);
      const deleverageCollateral = collaterals.find(({ asset }) => asset.is(deleverageCollateralToken.unwrapped));
      if (!deleverageCollateral) {
        throw newHttpError(400, { code: '400.5', message: 'deleverage token is not collateral' });
      }
      const deleverageDebtUSD = new BigNumberJS(amount).times(baseTokenPrice);

      // 1. get the quotation for swapping the deleverage token into amount of the base token.
      const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
        tokenIn: deleverageCollateralToken,
        output: { token: baseToken, amount },
        slippage,
      });

      if (
        quotation.input.gt(new common.TokenAmount(deleverageCollateralToken, deleverageCollateral.collateralBalance))
      ) {
        throw newHttpError(400, { code: '400.6', message: 'insufficient collateral for deleverage' });
      }

      const borrowAmount = quotation.input.amount;
      const deleverageCollateralUSD = new BigNumberJS(borrowAmount).times(deleverageCollateral.assetPrice);

      // 2. new balancer flash loan logics and append loan logic
      const [flashLoanLoanLogic, flashLoanRepayLogic] = apisdk.protocols.balancerv2.newFlashLoanLogicPair([
        { token: deleverageCollateralToken, amount: borrowAmount },
      ]);
      logics.push(flashLoanLoanLogic);

      // 3. new and append paraswap swap token logic
      logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));

      // 4. new and append compound v3 repay collateral logic, and use 100% of the balance.
      logics.push(
        apisdk.protocols.compoundv3.newRepayLogic({
          marketId,
          borrower: account,
          input: { token: baseToken, amount },
          balanceBps: common.BPS_BASE,
        })
      );

      // 5. new and append compound v3 withdraw logic
      logics.push(
        apisdk.protocols.compoundv3.newWithdrawCollateralLogic({
          marketId,
          output: { token: deleverageCollateralToken, amount: borrowAmount },
        })
      );

      // 6. append balancer flash loan repay logic
      logics.push(flashLoanRepayLogic);

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      approvals = estimateResult.approvals;

      // 7. calc target position
      const targetBorrowUSD = new BigNumberJS(borrowUSD).gt(deleverageDebtUSD)
        ? new BigNumberJS(borrowUSD).minus(deleverageDebtUSD)
        : new BigNumberJS(0);
      const targetCollateralUSD = new BigNumberJS(collateralUSD).minus(deleverageCollateralUSD);
      const targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD).minus(
        deleverageCollateralUSD.times(deleverageCollateral.borrowCollateralFactor)
      );
      const targetLiquidationLimit = new BigNumberJS(liquidationLimit).minus(
        deleverageCollateralUSD.times(deleverageCollateral.liquidateCollateralFactor)
      );
      const targetLiquidationThreshold = common.formatBigUnit(targetLiquidationLimit.div(targetCollateralUSD), 4);
      targetPosition = {
        utilization: calcUtilization(targetBorrowCapacityUSD, targetBorrowUSD),
        healthRate: calcHealthRate(targetCollateralUSD, targetBorrowUSD, targetLiquidationThreshold),
        liquidationThreshold: targetLiquidationThreshold,
        borrowUSD: common.formatBigUnit(targetBorrowUSD, 2),
        collateralUSD: targetCollateralUSD.toString(),
        netAPR: calcNetAPR(supplyUSD, supplyAPR, targetCollateralUSD, targetBorrowUSD, borrowAPR),
      };
    }

    const responseBody: GetDeleverageQuotationResponseBody = {
      quotation: { currentPosition, targetPosition },
      approvals,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
