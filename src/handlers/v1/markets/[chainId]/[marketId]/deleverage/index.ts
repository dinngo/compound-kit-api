import BigNumberJS from 'bignumber.js';
import {
  EventBody,
  EventPathParameters,
  Route,
  formatJSONResponse,
  newHttpError,
  newInternalServerError,
} from 'src/libs/api';
import { Service, calcHealthRate, calcNetAPR, calcUtilization } from 'src/libs/compound-v3';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import * as compoundKit from '@protocolink/compound-kit';
import { utils } from 'ethers';
import { validateMarket } from 'src/validations';

type GetDeleverageQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{ account?: string; collateralToken?: common.TokenObject; baseAmount?: string; slippage?: number }>;

type GetDeleverageQuotationResponseBody = compoundKit.QuoteAPIResponseBody<compoundKit.DeleverageQuotation>;

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

    let marketInfo: compoundKit.MarketInfo;
    try {
      marketInfo = await service.getMarketInfo(marketId, account);
    } catch (err) {
      throw newInternalServerError(err);
    }
    const { utilization, healthRate, liquidationThreshold, supplyUSD, borrowUSD, collateralUSD, netAPR } = marketInfo;
    const currentPosition: compoundKit.Position = {
      utilization,
      healthRate,
      liquidationThreshold,
      supplyUSD,
      borrowUSD,
      collateralUSD,
      netAPR,
    };

    const logics: GetDeleverageQuotationResponseBody['logics'] = [];
    let fees: GetDeleverageQuotationResponseBody['fees'] = [];
    let approvals: GetDeleverageQuotationResponseBody['approvals'] = [];
    let targetPosition = currentPosition;
    if (event.body.collateralToken && event.body.baseAmount && Number(event.body.baseAmount) > 0) {
      const { collateralToken, baseAmount, slippage } = event.body;
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

      const deleverageCollateralToken = common.Token.from(collateralToken);
      const deleverageCollateral = collaterals.find(({ asset }) => asset.is(deleverageCollateralToken.unwrapped));
      if (!deleverageCollateral) {
        throw newHttpError(400, { code: '400.5', message: 'deleverage token is not collateral' });
      }
      const deleverageDebtUSD = new BigNumberJS(baseAmount).times(baseTokenPrice);

      // 1. get the quotation for swapping the deleverage token into amount of the base token.
      const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
        tokenIn: deleverageCollateralToken.wrapped,
        output: { token: baseToken.wrapped, amount: baseAmount },
        slippage,
      });

      if (
        quotation.input.gt(
          new common.TokenAmount(deleverageCollateralToken.wrapped, deleverageCollateral.collateralBalance)
        )
      ) {
        throw newHttpError(400, { code: '400.6', message: 'insufficient collateral for deleverage' });
      }

      // 2. get flash loan aggregator quotation
      const { protocolId, loans, repays } = await apisdk.protocols.utility.getFlashLoanAggregatorQuotation(chainId, {
        loans: [{ token: deleverageCollateralToken.wrapped, amount: quotation.input.amount }],
      });
      const borrowAmount = repays.at(0).amount;
      const deleverageCollateralUSD = new BigNumberJS(borrowAmount).times(deleverageCollateral.assetPrice);

      // 3. new flash loan aggregator logics and append loan logic
      const [flashLoanLoanLogic, flashLoanRepayLogic] = apisdk.protocols.utility.newFlashLoanAggregatorLogicPair(
        protocolId,
        loans.toArray()
      );
      logics.push(flashLoanLoanLogic);

      // 4. new and append paraswap swap token logic
      logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));

      // 5. new and append compound v3 repay collateral logic, and use 100% of the balance.
      logics.push(
        apisdk.protocols.compoundv3.newRepayLogic({
          marketId,
          borrower: account,
          input: { token: baseToken.wrapped, amount: baseAmount },
          balanceBps: common.BPS_BASE,
        })
      );

      // 6. new and append compound v3 withdraw logic
      logics.push(
        apisdk.protocols.compoundv3.newWithdrawCollateralLogic({
          marketId,
          output: { token: deleverageCollateralToken.wrapped, amount: borrowAmount },
        })
      );

      // 7. append balancer flash loan repay logic
      logics.push(flashLoanRepayLogic);

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      fees = estimateResult.fees;
      approvals = estimateResult.approvals;

      // 8. calc target position
      const targetSupplyUSD = new BigNumberJS(supplyUSD);
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
      const targetPositiveProportion = targetSupplyUSD.times(supplyAPR);
      const targetNegativeProportion = targetBorrowUSD.times(borrowAPR);
      targetPosition = {
        utilization: calcUtilization(targetBorrowCapacityUSD, targetBorrowUSD),
        healthRate: calcHealthRate(targetCollateralUSD, targetBorrowUSD, targetLiquidationThreshold),
        liquidationThreshold: targetLiquidationThreshold,
        supplyUSD: common.formatBigUnit(targetSupplyUSD, 2),
        borrowUSD: common.formatBigUnit(targetBorrowUSD, 2),
        collateralUSD: common.formatBigUnit(targetCollateralUSD, 2),
        netAPR: calcNetAPR(
          targetSupplyUSD,
          targetPositiveProportion,
          targetBorrowUSD,
          targetNegativeProportion,
          targetCollateralUSD
        ),
      };
    }

    const responseBody: GetDeleverageQuotationResponseBody = {
      quotation: { currentPosition, targetPosition },
      fees,
      approvals,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
