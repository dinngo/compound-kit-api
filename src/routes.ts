import { Route } from '@middy/http-router';
import * as api from 'src/libs/api';
import { docsRoute } from './handlers/docs';
import { statusRoute } from 'src/handlers/status';
import { v1BuildTransactionRoute } from 'src/handlers/v1/transactions/build';
import { v1GetCollateralSwapQuotationRoute } from 'src/handlers/v1/markets/[chainId]/[marketId]/collateral-swap';
import { v1GetDeleverageQuotationRoute } from 'src/handlers/v1/markets/[chainId]/[marketId]/deleverage';
import { v1GetLeverageQuotationRoute } from 'src/handlers/v1/markets/[chainId]/[marketId]/leverage';
import { v1GetMarketRoute } from 'src/handlers/v1/markets/[chainId]/[marketId]';
import { v1GetMarketsRoute } from 'src/handlers/v1/markets';
import { v1GetZapBorrowQuotationRoute } from 'src/handlers/v1/markets/[chainId]/[marketId]/zap-borrow';
import { v1GetZapRepayQuotationRoute } from 'src/handlers/v1/markets/[chainId]/[marketId]/zap-repay';
import { v1GetZapSupplyQuotationRoute } from 'src/handlers/v1/markets/[chainId]/[marketId]/zap-supply';
import { v1GetZapTokensRoute } from 'src/handlers/v1/markets/[chainId]/zap-tokens';
import { v1GetZapWithdrawQuotationRoute } from 'src/handlers/v1/markets/[chainId]/[marketId]/zap-withdraw';

export const routes: Route<api.Event>[] = [
  statusRoute,
  docsRoute,
  v1GetMarketsRoute,
  v1GetMarketRoute,
  v1GetLeverageQuotationRoute,
  v1GetDeleverageQuotationRoute,
  v1GetCollateralSwapQuotationRoute,
  v1GetZapSupplyQuotationRoute,
  v1GetZapBorrowQuotationRoute,
  v1GetZapWithdrawQuotationRoute,
  v1GetZapRepayQuotationRoute,
  v1GetZapTokensRoute,
  v1BuildTransactionRoute,
];
