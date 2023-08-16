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

type GetZapBorrowQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    amount?: string;
    targetToken?: common.TokenObject;
    slippage?: number;
  }>;

type GetZapBorrowQuotationResponseBody = QuoteAPIResponseBody<ZapQuotation>;

export const v1GetZapBorrowQuotationRoute: Route<GetZapBorrowQuotationRouteParams> = {
  method: 'POST',
  path: '/v1/markets/{chainId}/{marketId}/zap-borrow',
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
    const logics: GetZapBorrowQuotationResponseBody['logics'] = [];
    let approvals: GetZapBorrowQuotationResponseBody['approvals'] = [];
    let targetPosition = currentPosition;
    if (event.body.amount && event.body.targetToken && Number(event.body.amount) > 0) {
      const { amount, slippage } = event.body;
      const {
        baseToken,
        supplyAPR,
        supplyUSD,
        borrowAPR,
        borrowCapacityUSD,
        availableToBorrow,
        liquidationLimit,
        baseTokenPrice,
      } = marketInfo;
      const targetToken = common.Token.from(event.body.targetToken);

      // 1. check supply USD
      if (!new BigNumberJS(supplyUSD).isZero()) {
        throw newHttpError(400, { code: '400.5', message: 'supply USD is not zero' });
      }

      // 2. check borrow amount
      if (new BigNumberJS(amount).gt(new BigNumberJS(availableToBorrow))) {
        throw newHttpError(400, { code: '400.6', message: 'borrow amount is greater than available amount' });
      }

      // 3. new and append compound v3 borrow logic
      logics.push(
        apisdk.protocols.compoundv3.newBorrowLogic({
          marketId,
          output: {
            token: targetToken.unwrapped.is(baseToken) ? targetToken : baseToken.wrapped,
            amount,
          },
        })
      );

      // 4. new and append swap token logic
      if (targetToken.unwrapped.is(baseToken)) {
        targetTokenAmount = amount;
      } else {
        const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
          input: { token: baseToken.wrapped, amount },
          tokenOut: targetToken,
          slippage,
        });
        targetTokenAmount = quotation.output.amount;
        logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));
      }

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      approvals = estimateResult.approvals;

      // 5. calc target position
      const curBorrowUSD = new BigNumberJS(targetTokenAmount).times(baseTokenPrice);
      const targetSupplyUSD = new BigNumberJS(supplyUSD);
      const targetBorrowUSD = new BigNumberJS(borrowUSD).plus(curBorrowUSD);
      const targetCollateralUSD = new BigNumberJS(collateralUSD);
      const targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD);
      const targetLiquidationLimit = new BigNumberJS(liquidationLimit);

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

    const responseBody: GetZapBorrowQuotationResponseBody = {
      quotation: { targetTokenAmount, currentPosition, targetPosition },
      approvals,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
