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

export const routes: Route<api.Event>[] = [
  statusRoute,
  docsRoute,
  v1GetMarketsRoute,
  v1GetMarketRoute,
  v1GetLeverageQuotationRoute,
  v1GetDeleverageQuotationRoute,
  v1GetCollateralSwapQuotationRoute,
  v1BuildTransactionRoute,
];
