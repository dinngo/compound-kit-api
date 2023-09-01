import BigNumberJS from 'bignumber.js';
import {
  EventBody,
  EventPathParameters,
  EventQueryStringParameters,
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

type GetZapSupplyQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    srcToken?: common.TokenObject;
    srcAmount?: string;
    destToken?: common.TokenObject;
    slippage?: number;
  }> &
  EventQueryStringParameters<{ permit2Type?: apisdk.Permit2Type }>;

type GetZapSupplyQuotationResponseBody = compoundKit.QuoteAPIResponseBody<compoundKit.ZapSupplyQuotation>;

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
    const logics: GetZapSupplyQuotationResponseBody['logics'] = [];
    let fees: GetZapSupplyQuotationResponseBody['fees'] = [];
    let approvals: GetZapSupplyQuotationResponseBody['approvals'] = [];
    let permitData: GetZapSupplyQuotationResponseBody['permitData'];
    let targetPosition = currentPosition;
    if (event.body.srcToken && event.body.destToken && event.body.srcAmount && Number(event.body.srcAmount) > 0) {
      const { srcAmount, slippage } = event.body;
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
      const srcToken = common.Token.from(event.body.srcToken);
      const destToken = common.Token.from(event.body.destToken);

      // 1. check supply collateral or base token
      const destCollateral = collaterals.find(({ asset }) => asset.is(destToken.unwrapped));
      if (!destCollateral && !destToken.unwrapped.is(baseToken)) {
        throw newHttpError(400, { code: '400.5', message: 'destination token is not collateral nor base' });
      }

      // 2. new and append swap token logic
      let supplyToken: common.Token;
      if (srcToken.wrapped.is(destToken.wrapped)) {
        supplyToken = srcToken;
        destAmount = srcAmount;
      } else {
        supplyToken = destToken.wrapped;
        const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
          input: { token: srcToken, amount: srcAmount },
          tokenOut: supplyToken,
          slippage,
        });
        destAmount = quotation.output.amount;
        logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));
      }

      // 3. new and append compound v3 supply logic
      if (supplyToken.unwrapped.is(baseToken)) {
        if (!new BigNumberJS(borrowUSD).isZero()) {
          throw newHttpError(400, { code: '400.6', message: 'borrow USD is not zero' });
        }
        const cToken = await service.getCToken(marketId);
        const supplyBaseQuotation = await apisdk.protocols.compoundv3.getSupplyBaseQuotation(chainId, {
          marketId,
          input: {
            token: supplyToken,
            amount: destAmount,
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
            input: { token: supplyToken, amount: destAmount },
            balanceBps: common.BPS_BASE,
          })
        );
      }

      const estimateResult = await apisdk.estimateRouterData(
        { chainId, account, logics },
        event.queryStringParameters?.permit2Type
      );
      fees = estimateResult.fees;
      approvals = estimateResult.approvals;
      permitData = estimateResult.permitData;

      // 4. calc target position
      let targetSupplyUSD, targetCollateralUSD, targetBorrowCapacityUSD, targetLiquidationLimit;
      if (supplyToken.unwrapped.is(baseToken)) {
        const targetUSD = new BigNumberJS(destAmount).times(baseTokenPrice);
        targetSupplyUSD = new BigNumberJS(supplyUSD).plus(targetUSD);
        targetCollateralUSD = new BigNumberJS(collateralUSD);
        targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD);
        targetLiquidationLimit = new BigNumberJS(liquidationLimit);
      } else {
        const targetUSD = new BigNumberJS(destAmount).times(destCollateral!.assetPrice);
        targetSupplyUSD = new BigNumberJS(supplyUSD);
        targetCollateralUSD = new BigNumberJS(collateralUSD).plus(targetUSD);
        targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD).plus(
          targetUSD.times(destCollateral!.borrowCollateralFactor)
        );
        targetLiquidationLimit = new BigNumberJS(liquidationLimit).plus(
          targetUSD.times(destCollateral!.liquidateCollateralFactor)
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

    const responseBody: GetZapSupplyQuotationResponseBody = {
      quotation: { destAmount, currentPosition, targetPosition },
      fees,
      approvals,
      permitData,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
