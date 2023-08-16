import BigNumberJS from 'bignumber.js';
import { CollateralSwapQuotation, QuoteAPIResponseBody } from 'src/types';
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

type GetCollateralSwapQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    withdrawalToken?: common.TokenObject;
    amount?: string;
    targetToken?: common.TokenObject;
    slippage?: number;
  }>;

type GetCollateralSwapQuotationResponseBody = QuoteAPIResponseBody<CollateralSwapQuotation>;

export const v1GetCollateralSwapQuotationRoute: Route<GetCollateralSwapQuotationRouteParams> = {
  method: 'POST',
  path: '/v1/markets/{chainId}/{marketId}/collateral-swap',
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

    let targetTokenAmount = '0';
    const logics: GetCollateralSwapQuotationResponseBody['logics'] = [];
    let fees: GetCollateralSwapQuotationResponseBody['fees'] = [];
    let approvals: GetCollateralSwapQuotationResponseBody['approvals'] = [];
    let targetPosition = currentPosition;
    if (event.body.withdrawalToken && event.body.targetToken && event.body.amount && Number(event.body.amount) > 0) {
      const { amount, slippage } = event.body;
      const { supplyAPR, supplyUSD, borrowAPR, borrowCapacityUSD, liquidationLimit, collaterals } = marketInfo;

      // Verify token input
      const withdrawalToken = common.Token.from(event.body.withdrawalToken);
      const withdrawalCollateral = collaterals.find(({ asset }) => asset.is(withdrawalToken.unwrapped));
      if (!withdrawalCollateral) {
        throw newHttpError(400, { code: '400.5', message: 'withdrawal token is not collateral' });
      }
      const targetToken = common.Token.from(event.body.targetToken);
      const targetCollateral = collaterals.find(({ asset }) => asset.is(targetToken.unwrapped));
      if (!targetCollateral) {
        throw newHttpError(400, { code: '400.6', message: 'target token is not collateral' });
      }

      if (new BigNumberJS(amount).gt(withdrawalCollateral.collateralBalance)) {
        throw newHttpError(400, { code: '400.7', message: 'withdrawal amount is greater than available amount' });
      }

      const withdrawal = { token: withdrawalToken.wrapped, amount };

      // 1. get flash loan aggregator quotation with repays
      const { protocolId, loans } = await apisdk.protocols.utility.getFlashLoanAggregatorQuotation(chainId, {
        repays: [withdrawal],
      });

      // 2. new flash loan aggregator logics and append loan logic
      const [flashLoanLoanLogic, flashLoanRepayLogic] = apisdk.protocols.utility.newFlashLoanAggregatorLogicPair(
        protocolId,
        loans.toArray()
      );
      logics.push(flashLoanLoanLogic);

      // 3. new and append paraswap swap token logic
      const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
        input: loans.at(0),
        tokenOut: targetToken.wrapped,
        slippage,
      });
      logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));

      // 4. new and append compound v3 supply collateral logic
      targetTokenAmount = quotation.output.amount;
      logics.push(
        apisdk.protocols.compoundv3.newSupplyCollateralLogic({
          marketId,
          input: { token: targetToken.wrapped, amount: targetTokenAmount },
          balanceBps: common.BPS_BASE,
        })
      );

      // 5. new and append compound v3 withdraw logic
      logics.push(
        apisdk.protocols.compoundv3.newWithdrawCollateralLogic({
          marketId,
          output: withdrawal,
        })
      );

      // 6. append balancer flash loan replay logic
      logics.push(flashLoanRepayLogic);

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      fees = estimateResult.fees;
      approvals = estimateResult.approvals;

      // 7. calc target position
      const withdrawalUSD = new BigNumberJS(amount).times(withdrawalCollateral.assetPrice);
      const targetUSD = new BigNumberJS(targetTokenAmount).times(targetCollateral.assetPrice);
      const targetSupplyUSD = new BigNumberJS(supplyUSD);
      const targetBorrowUSD = new BigNumberJS(borrowUSD);
      const targetCollateralUSD = new BigNumberJS(collateralUSD).minus(withdrawalUSD).plus(targetUSD);
      const targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD);

      const targetLiquidationLimit = new BigNumberJS(liquidationLimit).minus(
        withdrawalUSD
          .times(withdrawalCollateral.liquidateCollateralFactor)
          .plus(targetUSD.times(targetCollateral.liquidateCollateralFactor))
      );
      const targetLiquidationThreshold = common.formatBigUnit(targetLiquidationLimit.div(targetCollateralUSD), 4);
      const targetPositiveProportion = targetSupplyUSD.times(supplyAPR);
      const targetNegativeProportion = targetBorrowUSD.times(borrowAPR);
      targetPosition = {
        utilization: calcUtilization(targetBorrowCapacityUSD, targetBorrowUSD),
        healthRate: calcHealthRate(targetCollateralUSD, targetBorrowUSD, targetLiquidationThreshold),
        liquidationThreshold: targetLiquidationThreshold,
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

    const responseBody: GetCollateralSwapQuotationResponseBody = {
      quotation: { targetTokenAmount, currentPosition, targetPosition },
      fees,
      approvals,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
