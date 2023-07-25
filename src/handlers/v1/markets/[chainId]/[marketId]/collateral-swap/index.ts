import BigNumberJS from 'bignumber.js';
import { CollateralSwapQuotation, QuoteAPIResponseBody } from 'src/types';
import {
  EventBody,
  EventPathParameters,
  Route,
  formatJSONResponse,
  newHttpError,
  newInternalServerError,
} from 'src/libs/api';
// TODO: remove this when slippage value is confirmed
// import { LEVERAGE_BORROW_SCALE } from 'src/constants';
import { MarketInfo, Service, calcHealthRate, calcNetApr, calcUtilization } from 'src/libs/compound-v3';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import { utils } from 'ethers';
import { validateMarket } from 'src/validations';

type GetCollateralSwapQuotationRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventBody<{
    account?: string;
    withdrawalToken?: common.TokenObject;
    amount?: string;
    targetToken?: common.TokenObject;
    slippage?: number;
  }>;

type GetCollateralSwapQuotationResponseBody = QuoteAPIResponseBody<CollateralSwapQuotation>;

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

    let marketInfo: MarketInfo;
    try {
      marketInfo = await service.getMarketInfo(marketId, account);
    } catch (err) {
      throw newInternalServerError(err);
    }
    const { utilization, healthRate, netApr, borrowValue } = marketInfo;
    const currentPosition = { utilization, healthRate, netApr, totalDebt: borrowValue };

    let targetAmount = '0';
    const logics: GetCollateralSwapQuotationResponseBody['logics'] = [];
    let approvals: GetCollateralSwapQuotationResponseBody['approvals'] = [];
    let targetPosition = currentPosition;
    if (event.body.withdrawalToken && event.body.targetToken && event.body.amount && Number(event.body.amount) > 0) {
      // TODO: do we need to sanitize slippage value due to 0.5% assumption?
      const { withdrawalToken, targetToken, amount, slippage } = event.body;
      const { supplyApr, supplyValue, borrowApr, collateralValue, borrowCapacityValue, liquidationLimit, collaterals } =
        marketInfo;

      // Verify token input
      const _withdrawalToken = common.Token.from(withdrawalToken);
      const withdrawalCollateral = collaterals.find(({ asset }) => asset.is(_withdrawalToken.unwrapped));
      if (!withdrawalCollateral) {
        throw newHttpError(400, { code: '400.5', message: 'withdrawal token is not collateral' });
      }
      const _targetToken = common.Token.from(targetToken);
      const targetCollateral = collaterals.find(({ asset }) => asset.is(_targetToken.unwrapped));
      if (!targetCollateral) {
        throw newHttpError(400, { code: '400.5', message: 'target token is not collateral' });
      }

      const _withdrawalValue = new BigNumberJS(amount).times(withdrawalCollateral.assetPrice);
      const targetValue = _withdrawalValue.times(0.995); // max slippage = 0.5%
      const targetAmount = targetValue.div(targetCollateral.assetPrice).toString();

      // 1. new balancer flash loan logics and append loan logic
      const [flashLoanLoanLogic, flashLoanRepayLogic] = apisdk.protocols.balancerv2.newFlashLoanLogicPair([
        { token: _targetToken, amount: targetAmount },
      ]);
      logics.push(flashLoanLoanLogic);

      // 2. new and append compound v3 supply collateral logic
      logics.push(
        apisdk.protocols.compoundv3.newSupplyCollateralLogic({
          marketId,
          input: { token: _targetToken, amount: targetAmount },
        })
      );

      // 3. new and append compound v3 withdraw logic
      logics.push(
        apisdk.protocols.compoundv3.newWithdrawCollateralLogic({
          marketId,
          output: { token: _withdrawalToken, amount: amount },
        })
      );

      // 4. new and append paraswap swap token logic
      const quotation = await apisdk.protocols.paraswapv5.getSwapTokenQuotation(chainId, {
        input: { token: _withdrawalToken, amount: amount },
        tokenOut: _targetToken,
        slippage,
      });
      logics.push(apisdk.protocols.paraswapv5.newSwapTokenLogic(quotation));

      // 5. append balancer flash loan replay logic
      logics.push(flashLoanRepayLogic);

      const estimateResult = await apisdk.estimateRouterData({ chainId, account, logics });
      approvals = estimateResult.approvals;

      // 6. calc target position
      const targetBorrowValue = new BigNumberJS(borrowValue);
      const targetCollateralValue = new BigNumberJS(collateralValue).minus(_withdrawalValue).plus(targetValue);
      const targetBorrowCapacityValue = new BigNumberJS(borrowCapacityValue);

      const targetLiquidationLimit = new BigNumberJS(liquidationLimit).minus(
        _withdrawalValue
          .times(withdrawalCollateral.liquidateCollateralFactor)
          .plus(targetValue.times(targetCollateral.liquidateCollateralFactor))
      );
      const targetLiquidationThreshold = common.formatBigUnit(targetLiquidationLimit.div(targetCollateralValue), 4);
      targetPosition = {
        utilization: calcUtilization(targetBorrowCapacityValue, targetBorrowValue),
        healthRate: calcHealthRate(supplyValue, targetCollateralValue, targetBorrowValue, targetLiquidationThreshold),
        netApr: calcNetApr(supplyValue, supplyApr, targetCollateralValue, targetBorrowValue, borrowApr),
        totalDebt: common.formatBigUnit(targetBorrowValue, 2),
      };
    }

    const responseBody: GetCollateralSwapQuotationResponseBody = {
      quotation: { targetTokenAmount: targetAmount, currentPosition, targetPosition },
      approvals,
      logics,
    };

    return formatJSONResponse(responseBody);
  },
};
