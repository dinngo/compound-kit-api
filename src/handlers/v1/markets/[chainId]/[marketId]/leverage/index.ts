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

type GetLeverageQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{ account?: string; collateralToken?: common.TokenObject; collateralAmount?: string; slippage?: number }>;

type GetLeverageQuotationResponseBody = compoundKit.QuoteAPIResponseBody<compoundKit.LeverageQuotation>;

export const v1GetLeverageQuotationRoute: Route<GetLeverageQuotationRouteParams> = {
  method: 'POST',
  path: '/v1/markets/{chainId}/{marketId}/leverage',
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

    let leverageTimes = '0';
    const logics: GetLeverageQuotationResponseBody['logics'] = [];
    let fees: GetLeverageQuotationResponseBody['fees'] = [];
    let approvals: GetLeverageQuotationResponseBody['approvals'] = [];
    let targetPosition = currentPosition;
    if (event.body.collateralToken && event.body.collateralAmount && Number(event.body.collateralAmount) > 0) {
      const { collateralToken, collateralAmount, slippage } = event.body;
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

      const leverageToken = common.Token.from(collateralToken);
      const leverageCollateral = collaterals.find(({ asset }) => asset.is(leverageToken.unwrapped));
      if (!leverageCollateral) {
        throw newHttpError(400, { code: '400.5', message: 'leverage token is not collateral' });
      }
      const leverageUSD = new BigNumberJS(collateralAmount).times(leverageCollateral.assetPrice);

      // 1. get the quotation for swapping the base token into amount of leverage token.
      const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
        tokenIn: baseToken.wrapped,
        output: { token: leverageToken.wrapped, amount: collateralAmount },
        slippage,
        excludeDEXS: ['BalancerV2'],
      });

      // 2. get flash loan aggregator quotation
      const { protocolId, loans, repays } = await apisdk.protocols.utility.getFlashLoanAggregatorQuotation(chainId, {
        loans: [{ token: baseToken.wrapped, amount: quotation.input.amount }],
      });
      const borrowAmount = repays.at(0).amount;

      // 3. new flash loan aggregator logics and append loan logic
      const [flashLoanLoanLogic, flashLoanRepayLogic] = apisdk.protocols.utility.newFlashLoanAggregatorLogicPair(
        protocolId,
        loans.toArray()
      );
      logics.push(flashLoanLoanLogic);

      // 4. new and append paraswap swap token logic
      logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));

      // 5. new and append compound v3 supply collateral logic, and use 100% of the balance.
      logics.push(
        apisdk.protocols.compoundv3.newSupplyCollateralLogic({
          marketId,
          input: { token: leverageToken.wrapped, amount: collateralAmount },
          balanceBps: common.BPS_BASE,
        })
      );

      // 5. new and append compound v3 borrow logic
      logics.push(
        apisdk.protocols.compoundv3.newBorrowLogic({
          marketId,
          output: { token: baseToken.wrapped, amount: borrowAmount },
        })
      );

      // 6. append balancer flash loan repay logic
      logics.push(flashLoanRepayLogic);

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      fees = estimateResult.fees;
      approvals = estimateResult.approvals;

      // 7. calc leverage times
      leverageTimes = common.formatBigUnit(leverageUSD.div(borrowCapacityUSD), 2);

      // 8. calc target position
      const targetSupplyUSD = new BigNumberJS(supplyUSD);
      const targetBorrowUSD = new BigNumberJS(borrowUSD).plus(new BigNumberJS(borrowAmount).times(baseTokenPrice));
      const targetCollateralUSD = new BigNumberJS(collateralUSD).plus(leverageUSD);
      const targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD).plus(
        leverageUSD.times(leverageCollateral.borrowCollateralFactor)
      );
      const targetLiquidationLimit = new BigNumberJS(liquidationLimit).plus(
        leverageUSD.times(leverageCollateral.liquidateCollateralFactor)
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

    const responseBody: GetLeverageQuotationResponseBody = {
      quotation: { leverageTimes, currentPosition, targetPosition },
      fees,
      approvals,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
