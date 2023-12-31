import BigNumberJS from 'bignumber.js';
import {
  EventBody,
  EventPathParameters,
  Route,
  formatJSONResponse,
  newHttpError,
  newInternalServerError,
} from 'src/libs/api';
import { Service, calcHealthRate, calcNetAPR, calcUtilization, transformMarketId } from 'src/libs/compound-v3';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import * as compoundKit from '@protocolink/compound-kit';
import { utils } from 'ethers';

type GetZapBorrowQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    srcAmount?: string;
    destToken?: common.TokenObject;
    slippage?: number;
  }>;

type GetZapBorrowQuotationResponseBody = compoundKit.QuoteAPIResponseBody<compoundKit.ZapBorrowQuotation>;

export const v1GetZapBorrowQuotationRoute: Route<GetZapBorrowQuotationRouteParams> = {
  method: 'POST',
  path: '/v1/markets/{chainId}/{marketId}/zap-borrow',
  handler: async (event) => {
    const chainId = Number(event.pathParameters.chainId);
    const marketId = transformMarketId(chainId, event.pathParameters.marketId);
    if (!marketId) {
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
    const {
      baseBorrowMin,
      utilization,
      healthRate,
      liquidationThreshold,
      supplyUSD,
      borrowBalance,
      borrowUSD,
      collateralUSD,
      netAPR,
    } = marketInfo;
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
    const logics: GetZapBorrowQuotationResponseBody['logics'] = [];
    let fees: GetZapBorrowQuotationResponseBody['fees'] = [];
    let approvals: GetZapBorrowQuotationResponseBody['approvals'] = [];
    let targetPosition = currentPosition;
    if (event.body.srcAmount && event.body.destToken && Number(event.body.srcAmount) > 0) {
      const { srcAmount, slippage } = event.body;
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
      const destToken = common.Token.from(event.body.destToken);

      // 1. check supply USD
      if (!new BigNumberJS(supplyUSD).isZero()) {
        throw newHttpError(400, { code: '400.5', message: 'supply USD is not zero' });
      }

      // 2. check source amount
      if (new BigNumberJS(srcAmount).gt(new BigNumberJS(availableToBorrow))) {
        throw newHttpError(400, { code: '400.6', message: 'source amount is greater than available amount' });
      }

      // 3. check borrow amount with baseBorrowMin
      if (new BigNumberJS(borrowBalance).plus(srcAmount).lt(baseBorrowMin)) {
        throw newHttpError(400, {
          code: '400.7',
          message: `target borrow balance is less than baseBorrowMin: ${baseBorrowMin}`,
        });
      }

      // 4. new and append compound v3 borrow logic
      logics.push(
        apisdk.protocols.compoundv3.newBorrowLogic({
          marketId,
          output: {
            token: destToken.unwrapped.is(baseToken) ? destToken : baseToken.wrapped,
            amount: srcAmount,
          },
        })
      );

      // 5. new and append swap token logic
      if (destToken.unwrapped.is(baseToken)) {
        destAmount = srcAmount;
      } else {
        const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
          input: { token: baseToken.wrapped, amount: srcAmount },
          tokenOut: destToken,
          slippage,
        });
        destAmount = quotation.output.amount;
        logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));
      }

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      fees = estimateResult.fees;
      approvals = estimateResult.approvals;

      // 6. calc target position
      const curBorrowUSD = new BigNumberJS(srcAmount).times(baseTokenPrice);
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

    const responseBody: GetZapBorrowQuotationResponseBody = {
      quotation: { destAmount, currentPosition, targetPosition },
      fees,
      approvals,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
