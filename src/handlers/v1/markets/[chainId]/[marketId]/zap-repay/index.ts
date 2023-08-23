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
import { MarketInfo, Service, calcHealthRate, calcNetAPR, calcUtilization } from 'src/libs/compound-v3';
import { QuoteAPIResponseBody, ZapQuotation } from 'src/types';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import { utils } from 'ethers';
import { validateMarket } from 'src/validations';

type GetZapRepayQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    sourceToken?: common.TokenObject;
    amount?: string;
    slippage?: number;
  }> &
  EventQueryStringParameters<{ permit2Type?: apisdk.Permit2Type }>;

type GetZapRepayQuotationResponseBody = QuoteAPIResponseBody<ZapQuotation>;

export const v1GetZapRepayQuotationRoute: Route<GetZapRepayQuotationRouteParams> = {
  method: 'POST',
  path: '/v1/markets/{chainId}/{marketId}/zap-repay',
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
    const logics: GetZapRepayQuotationResponseBody['logics'] = [];
    let fees: GetZapRepayQuotationResponseBody['fees'] = [];
    let approvals: GetZapRepayQuotationResponseBody['approvals'] = [];
    let permitData: GetZapRepayQuotationResponseBody['permitData'];
    let targetPosition = currentPosition;
    if (event.body.sourceToken && event.body.amount && Number(event.body.amount) > 0) {
      const { amount, slippage } = event.body;
      const { baseToken, supplyAPR, supplyUSD, borrowAPR, borrowCapacityUSD, liquidationLimit, baseTokenPrice } =
        marketInfo;
      const sourceToken = common.Token.from(event.body.sourceToken);

      // 1. check borrow USD
      if (new BigNumberJS(borrowUSD).isZero()) {
        throw newHttpError(400, { code: '400.5', message: 'borrow USD is zero' });
      }

      // 2. new and append swap token logic
      let repayToken: common.Token;
      if (sourceToken.unwrapped.is(baseToken)) {
        repayToken = sourceToken;
        targetTokenAmount = amount;
      } else {
        const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
          input: { token: sourceToken, amount },
          tokenOut: baseToken.wrapped,
          slippage,
        });

        targetTokenAmount = slippage
          ? quotation.output.setWei(common.calcSlippage(quotation.output.amountWei, slippage)).amount
          : quotation.output.amount;
        repayToken = baseToken.wrapped;
        logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));
      }

      // 3. new and append compound v3 repay logic
      const repayBaseQuotation = await apisdk.protocols.compoundv3.getRepayQuotation(chainId, {
        marketId,
        tokenIn: repayToken,
        borrower: account,
      });
      // 3.1 set the actual repay amount
      const debtAmount = repayBaseQuotation.input.amount;
      if (new BigNumberJS(debtAmount).lt(new BigNumberJS(targetTokenAmount))) {
        targetTokenAmount = debtAmount;
      } else {
        repayBaseQuotation.input.set(targetTokenAmount);
      }
      logics.push(apisdk.protocols.compoundv3.newRepayLogic({ ...repayBaseQuotation, balanceBps: common.BPS_BASE }));

      const estimateResult = await apisdk.estimateRouterData(
        { chainId, account, logics },
        event.queryStringParameters?.permit2Type
      );
      fees = estimateResult.fees;
      approvals = estimateResult.approvals;
      permitData = estimateResult.permitData;

      // 4. calc target position
      const repayUSD = new BigNumberJS(targetTokenAmount).times(baseTokenPrice);
      const targetSupplyUSD = new BigNumberJS(supplyUSD);
      const targetBorrowUSD = new BigNumberJS(borrowUSD).minus(repayUSD);
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

    const responseBody: GetZapRepayQuotationResponseBody = {
      quotation: { targetTokenAmount, currentPosition, targetPosition },
      fees,
      approvals,
      permitData,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
