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

type GetZapWithdrawQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    withdrawalToken?: common.TokenObject;
    amount?: string;
    targetToken?: common.TokenObject;
    slippage?: number;
  }>;

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

    let targetTokenAmount = '0';
    const logics: GetZapWithdrawQuotationResponseBody['logics'] = [];
    let fees: GetZapWithdrawQuotationResponseBody['fees'] = [];
    let approvals: GetZapWithdrawQuotationResponseBody['approvals'] = [];
    let permitData: GetZapWithdrawQuotationResponseBody['permitData'];
    let targetPosition = currentPosition;
    if (event.body.withdrawalToken && event.body.amount && event.body.targetToken && Number(event.body.amount) > 0) {
      const { amount, slippage } = event.body;
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

      const withdrawalToken = common.Token.from(event.body.withdrawalToken);
      const targetToken = common.Token.from(event.body.targetToken);

      // 1. check withdraw collateral or base token
      const withdrawalCollateral = collaterals.find(({ asset }) => asset.is(withdrawalToken.unwrapped));
      if (!withdrawalCollateral && !withdrawalToken.unwrapped.is(baseToken)) {
        throw newHttpError(400, { code: '400.5', message: 'withdrawal token is not collateral nor base' });
      }

      // 2. new and append compound v3 withdraw logic
      let realWithdrawalToken: common.Token;
      if (withdrawalToken.unwrapped.is(baseToken)) {
        if (new BigNumberJS(supplyBalance).lt(new BigNumberJS(amount))) {
          throw newHttpError(400, {
            code: '400.6',
            message: 'withdrawal amount is greater than available base amount',
          });
        }
        const cToken = await service.getCToken(marketId);
        realWithdrawalToken = targetToken.wrapped.is(baseToken.wrapped) ? targetToken : withdrawalToken.wrapped;
        const withdrawBaseQuotation = await apisdk.protocols.compoundv3.getWithdrawBaseQuotation(chainId, {
          marketId,
          input: {
            token: cToken,
            amount,
          },
          tokenOut: realWithdrawalToken,
        });
        logics.push(
          apisdk.protocols.compoundv3.newWithdrawBaseLogic({ ...withdrawBaseQuotation, balanceBps: common.BPS_BASE })
        );
      } else {
        if (new BigNumberJS(withdrawalCollateral!.collateralBalance).lt(new BigNumberJS(amount))) {
          throw newHttpError(400, {
            code: '400.7',
            message: 'withdrawal amount is greater than available collateral amount',
          });
        }
        realWithdrawalToken = targetToken.wrapped.is(withdrawalToken.wrapped) ? targetToken : withdrawalToken.wrapped;
        logics.push(
          apisdk.protocols.compoundv3.newWithdrawCollateralLogic({
            marketId,
            output: {
              token: realWithdrawalToken,
              amount,
            },
          })
        );
      }

      // 3. new and append swap token logic
      if (withdrawalToken.wrapped.is(targetToken.wrapped)) {
        targetTokenAmount = amount;
      } else {
        const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
          input: { token: realWithdrawalToken, amount },
          tokenOut: targetToken,
          slippage,
        });
        targetTokenAmount = quotation.output.amount;
        logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));
      }

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      fees = estimateResult.fees;
      approvals = estimateResult.approvals;
      permitData = estimateResult.permitData;

      // 4. calc target position
      let targetSupplyUSD, targetCollateralUSD, targetBorrowCapacityUSD, targetLiquidationLimit;
      if (realWithdrawalToken.unwrapped.is(baseToken)) {
        const withdrawalUSD = new BigNumberJS(targetTokenAmount).times(baseTokenPrice);
        targetSupplyUSD = new BigNumberJS(supplyUSD).minus(withdrawalUSD);
        targetCollateralUSD = new BigNumberJS(collateralUSD);
        targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD);
        targetLiquidationLimit = new BigNumberJS(liquidationLimit);
      } else {
        const withdrawalUSD = new BigNumberJS(targetTokenAmount).times(withdrawalCollateral!.assetPrice);
        targetSupplyUSD = new BigNumberJS(supplyUSD);
        targetCollateralUSD = new BigNumberJS(collateralUSD).minus(withdrawalUSD);
        targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD).minus(
          withdrawalUSD.times(withdrawalCollateral!.borrowCapacity)
        );
        targetLiquidationLimit = new BigNumberJS(liquidationLimit).minus(
          withdrawalUSD.times(withdrawalCollateral!.liquidateCollateralFactor)
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
      quotation: { targetTokenAmount, currentPosition, targetPosition },
      fees,
      approvals,
      permitData,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
