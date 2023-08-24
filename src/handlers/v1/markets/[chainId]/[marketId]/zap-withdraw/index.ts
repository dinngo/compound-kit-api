import BigNumberJS from 'bignumber.js';
import { CollateralInfo, MarketInfo, Service, calcHealthRate, calcNetAPR, calcUtilization } from 'src/libs/compound-v3';
import {
  EventBody,
  EventPathParameters,
  EventQueryStringParameters,
  Route,
  formatJSONResponse,
  newHttpError,
  newInternalServerError,
} from 'src/libs/api';
import { QuoteAPIResponseBody, ZapQuotation } from 'src/types';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import { utils } from 'ethers';
import { validateMarket } from 'src/validations';

type GetZapWithdrawQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    srcToken?: common.TokenObject;
    srcAmount?: string;
    destToken?: common.TokenObject;
    slippage?: number;
  }> &
  EventQueryStringParameters<{ permit2Type?: apisdk.Permit2Type }>;

type GetZapWithdrawQuotationResponseBody = QuoteAPIResponseBody<ZapQuotation>;

export const v1GetZapWithdrawQuotationRoute: Route<GetZapWithdrawQuotationRouteParams> = {
  method: 'POST',
  path: '/v1/markets/{chainId}/{marketId}/zap-withdraw',
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

    let destAmount = '0';
    const logics: GetZapWithdrawQuotationResponseBody['logics'] = [];
    let fees: GetZapWithdrawQuotationResponseBody['fees'] = [];
    let approvals: GetZapWithdrawQuotationResponseBody['approvals'] = [];
    let permitData: GetZapWithdrawQuotationResponseBody['permitData'];
    let targetPosition = currentPosition;
    if (event.body.srcToken && event.body.srcAmount && event.body.destToken && Number(event.body.srcAmount) > 0) {
      const { srcAmount, slippage } = event.body;
      const {
        baseToken,
        supplyAPR,
        supplyBalance,
        supplyUSD,
        borrowAPR,
        borrowCapacityUSD,
        liquidationLimit,
        baseTokenPrice,
        collaterals,
      } = marketInfo;

      const srcToken = common.Token.from(event.body.srcToken);
      const destToken = common.Token.from(event.body.destToken);

      // 1. check withdraw collateral or base token
      // 1-1. new and append compound v3 withdraw logic
      let srcCollateral: CollateralInfo | undefined;
      let withdrawalToken: common.Token;
      if (srcToken.unwrapped.is(baseToken)) {
        if (new BigNumberJS(supplyBalance).lt(new BigNumberJS(srcAmount))) {
          throw newHttpError(400, {
            code: '400.5',
            message: 'source amount is greater than available base amount',
          });
        }
        const cToken = await service.getCToken(marketId);
        withdrawalToken = destToken.wrapped.is(baseToken.wrapped) ? destToken : srcToken.wrapped;
        const withdrawBaseQuotation = await apisdk.protocols.compoundv3.getWithdrawBaseQuotation(chainId, {
          marketId,
          input: {
            token: cToken,
            amount: srcAmount,
          },
          tokenOut: withdrawalToken,
        });
        logics.push(
          apisdk.protocols.compoundv3.newWithdrawBaseLogic({ ...withdrawBaseQuotation, balanceBps: common.BPS_BASE })
        );
      } else {
        srcCollateral = collaterals.find(({ asset }) => asset.is(srcToken.unwrapped));
        if (!srcCollateral) {
          throw newHttpError(400, { code: '400.6', message: 'source token is not collateral nor base' });
        }
        if (new BigNumberJS(srcCollateral.collateralBalance).lt(new BigNumberJS(srcAmount))) {
          throw newHttpError(400, {
            code: '400.7',
            message: 'source amount is greater than available collateral amount',
          });
        }
        withdrawalToken = destToken.wrapped.is(srcToken.wrapped) ? destToken : srcToken.wrapped;
        logics.push(
          apisdk.protocols.compoundv3.newWithdrawCollateralLogic({
            marketId,
            output: {
              token: withdrawalToken,
              amount: srcAmount,
            },
          })
        );
      }

      // 2. new and append swap token logic
      if (srcToken.wrapped.is(destToken.wrapped)) {
        destAmount = srcAmount;
      } else {
        const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
          input: { token: withdrawalToken, amount: srcAmount },
          tokenOut: destToken,
          slippage,
        });
        destAmount = quotation.output.amount;
        logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));
      }

      const estimateResult = await apisdk.estimateRouterData(
        { chainId, account, logics },
        event.queryStringParameters?.permit2Type
      );
      fees = estimateResult.fees;
      approvals = estimateResult.approvals;
      permitData = estimateResult.permitData;

      // 3. calc target position
      let targetSupplyUSD, targetCollateralUSD, targetBorrowCapacityUSD, targetLiquidationLimit;
      if (withdrawalToken.unwrapped.is(baseToken)) {
        const withdrawalUSD = new BigNumberJS(srcAmount).times(baseTokenPrice);
        targetSupplyUSD = new BigNumberJS(supplyUSD).minus(withdrawalUSD);
        targetCollateralUSD = new BigNumberJS(collateralUSD);
        targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD);
        targetLiquidationLimit = new BigNumberJS(liquidationLimit);
      } else {
        const withdrawalUSD = new BigNumberJS(srcAmount).times(srcCollateral!.assetPrice);
        targetSupplyUSD = new BigNumberJS(supplyUSD);
        targetCollateralUSD = new BigNumberJS(collateralUSD).minus(withdrawalUSD);
        targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD).minus(
          withdrawalUSD.times(srcCollateral!.borrowCapacity)
        );
        targetLiquidationLimit = new BigNumberJS(liquidationLimit).minus(
          withdrawalUSD.times(srcCollateral!.liquidateCollateralFactor)
        );
      }

      const targetBorrowUSD = new BigNumberJS(borrowUSD);
      const targetLiquidationThreshold = common.formatBigUnit(targetLiquidationLimit.div(targetCollateralUSD), 4);
      const targetPositiveProportion = targetSupplyUSD.times(supplyAPR);
      const targetNegativeProportion = targetBorrowCapacityUSD.times(borrowAPR);
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

    const responseBody: GetZapWithdrawQuotationResponseBody = {
      quotation: { destAmount, currentPosition, targetPosition },
      fees,
      approvals,
      permitData,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
