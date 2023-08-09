import BigNumberJS from 'bignumber.js';
import { CollateralInfo, MarketInfo, Service, calcHealthRate, calcNetAPR, calcUtilization } from 'src/libs/compound-v3';
import {
  EventBody,
  EventPathParameters,
  Route,
  formatJSONResponse,
  newHttpError,
  newInternalServerError,
} from 'src/libs/api';
import { QuoteAPIResponseBody, ZapSupplyQuotation } from 'src/types';
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

type GetZapSupplyQuotationResponseBody = QuoteAPIResponseBody<ZapSupplyQuotation>;

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
      const { sourceToken, targetToken, amount, slippage } = event.body;
      const { baseToken, collaterals } = marketInfo;
      const _sourceToken = common.Token.from(sourceToken);
      const _targetToken = common.Token.from(targetToken);

      // 1. check supply collateral or base token
      const targetCollateral = collaterals.find(({ asset }) => asset.is(_targetToken.unwrapped));
      if (!targetCollateral && !_targetToken.is(baseToken)) {
        throw newHttpError(400, { code: '400.5', message: 'target token is not collateral nor base' });
      }

      // 2. new and append swap token logic
      const swapLogic = await newSwapTokenLogic(chainId, _sourceToken, amount, _targetToken, slippage);
      if (swapLogic !== undefined) {
        logics.push(swapLogic);
        targetTokenAmount = swapLogic.fields.output.amount;
      } else {
        targetTokenAmount = amount;
      }

      // 3. new and append compound v3 supply logic
      const supplyLogic = await newSupplyLogic(
        chainId,
        marketId,
        _targetToken,
        targetTokenAmount,
        targetCollateral === undefined,
        new BigNumberJS(borrowUSD)
      );
      logics.push(supplyLogic);

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      approvals = estimateResult.approvals;
      permitData = estimateResult.permitData;

      // 4. calc target position
      targetPosition = calculateTargetPosition(targetCollateral, targetTokenAmount, marketInfo);
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

async function newSwapTokenLogic(
  chainId: number,
  sourceToken: common.Token,
  amount: string,
  targetToken: common.Token,
  slippage?: number
) {
  if (sourceToken.is(targetToken)) {
    return undefined;
  }

  if (sourceToken.is(targetToken.unwrapped)) {
    const wrapQuotation = await apisdk.protocols.utility.getWrappedNativeTokenQuotation(chainId, {
      input: {
        token: sourceToken,
        amount,
      },
      tokenOut: targetToken,
    });
    return apisdk.protocols.utility.newWrappedNativeTokenLogic(wrapQuotation);
  }

  const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
    input: { token: sourceToken, amount },
    tokenOut: targetToken,
    slippage,
  });
  return apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation);
}

async function newSupplyLogic(
  chainId: number,
  marketId: string,
  token: common.Token,
  amount: string,
  isBase: boolean,
  borrorwUSD: BigNumberJS
) {
  if (isBase) {
    if (borrorwUSD.gt(0)) {
      throw newHttpError(400, { code: '400.6', message: 'borrowUSD is not zero' });
    }
    const tokenList = await apisdk.protocols.compoundv3.getSupplyBaseTokenList(chainId);
    const cToken = tokenList[marketId][0][1];
    const supplyBaseQuotation = await apisdk.protocols.compoundv3.getSupplyBaseQuotation(chainId, {
      marketId,
      input: {
        token: token,
        amount: amount,
      },
      tokenOut: cToken,
    });

    return apisdk.protocols.compoundv3.newSupplyBaseLogic({
      input: supplyBaseQuotation.input,
      output: supplyBaseQuotation.output,
      marketId: supplyBaseQuotation.marketId,
      balanceBps: common.BPS_BASE,
    });
  } else {
    return apisdk.protocols.compoundv3.newSupplyCollateralLogic({
      marketId,
      input: { token, amount },
      balanceBps: common.BPS_BASE,
    });
  }
}

function calculateTargetPosition(targetCollateral: CollateralInfo | undefined, amount: string, marketInfo: MarketInfo) {
  let targetUSD;
  let targetSupplyUSD;
  let targetBorrowUSD;
  let targetCollateralUSD;
  let targetBorrowCapacityUSD;
  let targetLiquidationLimit;
  let targetLiquidationThreshold;
  let targetPositiveProportion;
  let targetNegativeProportion;

  const {
    supplyAPR,
    supplyUSD,
    borrowAPR,
    borrowUSD,
    collateralUSD,
    borrowCapacityUSD,
    liquidationLimit,
    baseTokenPrice,
  } = marketInfo;

  if (targetCollateral === undefined) {
    targetUSD = new BigNumberJS(amount).times(baseTokenPrice);
    targetSupplyUSD = new BigNumberJS(supplyUSD).plus(targetUSD);
    targetBorrowUSD = new BigNumberJS(borrowUSD);
    targetCollateralUSD = new BigNumberJS(collateralUSD);
    targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD);
    targetLiquidationLimit = new BigNumberJS(liquidationLimit);

    targetLiquidationThreshold = common.formatBigUnit(targetLiquidationLimit.div(targetCollateralUSD), 4);
    targetPositiveProportion = targetSupplyUSD.times(supplyAPR);
    targetNegativeProportion = targetBorrowUSD.times(borrowAPR);
  } else {
    targetUSD = new BigNumberJS(amount).times(targetCollateral.assetPrice);
    targetSupplyUSD = new BigNumberJS(supplyUSD);
    targetBorrowUSD = new BigNumberJS(borrowUSD);
    targetCollateralUSD = new BigNumberJS(collateralUSD).plus(targetUSD);
    targetBorrowCapacityUSD = new BigNumberJS(borrowCapacityUSD).plus(
      targetUSD.times(targetCollateral.borrowCollateralFactor)
    );
    targetLiquidationLimit = new BigNumberJS(liquidationLimit).plus(
      targetUSD.times(targetCollateral.liquidateCollateralFactor)
    );

    targetLiquidationThreshold = common.formatBigUnit(targetLiquidationLimit.div(targetCollateralUSD), 4);
    targetPositiveProportion = targetSupplyUSD.times(supplyAPR);
    targetNegativeProportion = targetBorrowUSD.times(borrowAPR);
  }

  return {
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
