import { Route, cacheMiddleware, formatJSONResponse } from 'src/libs/api';
import * as apisdk from '@protocolink/compound-kit';
import * as logics from '@protocolink/logics';
import middy from '@middy/core';

export const v1GetMarketsRoute: Route = {
  method: 'GET',
  path: '/v1/markets',
  handler: middy(async () => {
    const marketGroups: apisdk.MarketGroup[] = logics.compoundv3.configs.map(({ chainId, markets }) => ({
      chainId,
      markets: markets.map(({ id }) => ({ id, label: id })),
    }));

    return formatJSONResponse({ marketGroups });
  }).use(cacheMiddleware()),
};
