import { MarketGroup, getMarketLabel } from 'src/libs/compound-v3';
import { Route, cacheMiddleware, formatJSONResponse } from 'src/libs/api';
import * as logics from '@protocolink/logics';
import middy from '@middy/core';

export const v1GetMarketsRoute: Route = {
  method: 'GET',
  path: '/v1/markets',
  handler: middy(async () => {
    const marketGroups = logics.compoundv3.configs.reduce((accumulator, config) => {
      const { chainId } = config;
      const marketGroup: MarketGroup = { chainId, markets: [] };
      for (const { id } of config.markets) {
        marketGroup.markets.push({ id, label: getMarketLabel(chainId, id) });
      }
      accumulator.push(marketGroup);

      return accumulator;
    }, [] as MarketGroup[]);

    return formatJSONResponse({ marketGroups });
  }).use(cacheMiddleware()),
};
