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

type GetCollateralSwapQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    srcToken?: common.TokenObject;
    srcAmount?: string;
    destToken?: common.TokenObject;
    slippage?: number;
  }>;

type GetCollateralSwapQuotationResponseBody = compoundKit.QuoteAPIResponseBody<compoundKit.CollateralSwapQuotation>;

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

    let destAmount = '0';
    const logics: GetCollateralSwapQuotationResponseBody['logics'] = [];
    let fees: GetCollateralSwapQuotationResponseBody['fees'] = [];
    let approvals: GetCollateralSwapQuotationResponseBody['approvals'] = [];
    let targetPosition = currentPosition;
    if (event.body.srcToken && event.body.destToken && event.body.srcAmount && Number(event.body.srcAmount) > 0) {
      const { srcAmount, slippage } = event.body;
      const { supplyAPR, supplyUSD, borrowAPR, borrowCapacityUSD, liquidationLimit, collaterals } = marketInfo;

      const srcToken = common.Token.from(event.body.srcToken);
      const srcCollateral = collaterals.find(({ asset }) => asset.is(srcToken.unwrapped));
      if (!srcCollateral) {
        throw newHttpError(400, { code: '400.5', message: 'source token is not collateral' });
      }

      if (new BigNumberJS(srcAmount).gt(srcCollateral.collateralBalance)) {
        throw newHttpError(400, { code: '400.6', message: 'source amount is greater than available amount' });
      }

      const destToken = common.Token.from(event.body.destToken);
      const destCollateral = collaterals.find(({ asset }) => asset.is(destToken.unwrapped));
      if (!destCollateral) {
        throw newHttpError(400, { code: '400.7', message: 'destination token is not collateral' });
      }

      const withdrawal = { token: srcToken.wrapped, amount: srcAmount };

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
        tokenOut: destToken.wrapped,
        slippage,
      });
      logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));

      // 4. new and append compound v3 supply collateral logic
      destAmount = quotation.output.amount;
      logics.push(
        apisdk.protocols.compoundv3.newSupplyCollateralLogic({
          marketId,
          input: { token: destToken.wrapped, amount: destAmount },
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
      const withdrawalUSD = new BigNumberJS(srcAmount).times(srcCollateral.assetPrice);
      const targetUSD = new BigNumberJS(destAmount).times(destCollateral.assetPrice);
      const targetSupplyUSD = new BigNumberJS(supplyUSD);
      const targetBorrowUSD = new BigNumberJS(borrowUSD);
      const targetCollateralUSD = new BigNumberJS(collateralUSD).minus(withdrawalUSD).plus(targetUSD);
      const targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD);

      const targetLiquidationLimit = new BigNumberJS(liquidationLimit)
        .minus(withdrawalUSD.times(srcCollateral.liquidateCollateralFactor))
        .plus(targetUSD.times(destCollateral.liquidateCollateralFactor));
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

    const responseBody: GetCollateralSwapQuotationResponseBody = {
      quotation: { destAmount, currentPosition, targetPosition },
      fees,
      approvals,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
