import BigNumberJS from 'bignumber.js';
import {
  EventBody,
  EventPathParameters,
  Route,
  formatJSONResponse,
  newHttpError,
  newInternalServerError,
} from 'src/libs/api';
import { MarketInfo, Service, calcHealthRate, calcNetAPR, calcUtilization } from 'src/libs/compound-v3';
import { QuoteAPIResponseBody, ZapQuotation } from 'src/types';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import { utils } from 'ethers';
import { validateMarket } from 'src/validations';

type GetZapSupplyQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    sourceToken?: common.TokenObject;
    amount?: string;
    targetToken?: common.TokenObject;
    slippage?: number;
  }>;

type GetZapSupplyQuotationResponseBody = QuoteAPIResponseBody<ZapQuotation>;

export const v1GetZapSupplyQuotationRoute: Route<GetZapSupplyQuotationRouteParams> = {
  method: 'POST',
  path: '/v1/markets/{chainId}/{marketId}/zap-supply',
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
    const logics: GetZapSupplyQuotationResponseBody['logics'] = [];
    let approvals: GetZapSupplyQuotationResponseBody['approvals'] = [];
    let permitData: GetZapSupplyQuotationResponseBody['permitData'];
    let targetPosition = currentPosition;
    if (event.body.sourceToken && event.body.targetToken && event.body.amount && Number(event.body.amount) > 0) {
      const { amount, slippage } = event.body;
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
      const sourceToken = common.Token.from(event.body.sourceToken);
      const targetToken = common.Token.from(event.body.targetToken);

      // 1. check supply collateral or base token
      const targetCollateral = collaterals.find(({ asset }) => asset.is(targetToken.unwrapped));
      if (!targetCollateral && !targetToken.unwrapped.is(baseToken)) {
        throw newHttpError(400, { code: '400.5', message: 'target token is not collateral nor base' });
      }

      // 2. new and append swap token logic
      if (sourceToken.is(targetToken)) {
        targetTokenAmount = amount;
      } else {
        const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
          input: { token: sourceToken, amount },
          tokenOut: targetToken.wrapped,
          slippage,
        });
        targetTokenAmount = quotation.output.amount;
        logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));
      }

      // 3. new and append compound v3 supply logic
      if (targetToken.unwrapped.is(baseToken)) {
        if (!new BigNumberJS(borrowUSD).isZero()) {
          throw newHttpError(400, { code: '400.6', message: 'borrow USD is not zero' });
        }
        const cToken = await service.getCToken(marketId);
        const supplyBaseQuotation = await apisdk.protocols.compoundv3.getSupplyBaseQuotation(chainId, {
          marketId,
          input: {
            token: targetToken.wrapped,
            amount: targetTokenAmount,
          },
          tokenOut: cToken,
        });
        logics.push(
          apisdk.protocols.compoundv3.newSupplyBaseLogic({
            ...supplyBaseQuotation,
            balanceBps: common.BPS_BASE,
          })
        );
      } else {
        logics.push(
          apisdk.protocols.compoundv3.newSupplyCollateralLogic({
            marketId,
            input: { token: targetToken.wrapped, amount: targetTokenAmount },
            balanceBps: common.BPS_BASE,
          })
        );
      }

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      approvals = estimateResult.approvals;
      permitData = estimateResult.permitData;

      // 4. calc target position
      let targetSupplyUSD, targetCollateralUSD, targetBorrowCapacityUSD, targetLiquidationLimit;
      if (targetToken.unwrapped.is(baseToken)) {
        const targetUSD = new BigNumberJS(targetTokenAmount).times(baseTokenPrice);
        targetSupplyUSD = new BigNumberJS(supplyUSD).plus(targetUSD);
        targetCollateralUSD = new BigNumberJS(collateralUSD);
        targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD);
        targetLiquidationLimit = new BigNumberJS(liquidationLimit);
      } else {
        const targetUSD = new BigNumberJS(targetTokenAmount).times(targetCollateral!.assetPrice);
        targetSupplyUSD = new BigNumberJS(supplyUSD);
        targetCollateralUSD = new BigNumberJS(collateralUSD).plus(targetUSD);
        targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD).plus(
          targetUSD.times(targetCollateral!.borrowCollateralFactor)
        );
        targetLiquidationLimit = new BigNumberJS(liquidationLimit).plus(
          targetUSD.times(targetCollateral!.liquidateCollateralFactor)
        );
      }
      const targetBorrowUSD = new BigNumberJS(borrowUSD);
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

    const responseBody: GetZapSupplyQuotationResponseBody = {
      quotation: { targetTokenAmount, currentPosition, targetPosition },
      approvals,
      permitData,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
