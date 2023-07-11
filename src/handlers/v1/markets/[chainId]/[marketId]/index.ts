import {
  EventPathParameters,
  EventQueryStringParameters,
  Route,
  formatJSONResponse,
  newHttpError,
  newInternalServerError,
} from 'src/libs/api';
import { Service } from 'src/libs/compound-v3';
import { utils } from 'ethers';
import { validateMarket } from 'src/validations';

type GetMarketRouteParams = EventPathParameters<{ chainId: string; marketId: string }> &
  EventQueryStringParameters<{ account?: string }>;

export const v1GetMarketRoute: Route<GetMarketRouteParams> = {
  method: 'GET',
  path: '/v1/markets/{chainId}/{marketId}',
  handler: async (event) => {
    const chainId = Number(event.pathParameters.chainId);
    const marketId = event.pathParameters.marketId.toUpperCase();
    if (!validateMarket(chainId, marketId)) {
      throw newHttpError(400, { code: '400.1', message: 'market does not exist' });
    }

    let account = event.queryStringParameters?.account;
    if (account) {
      try {
        account = utils.getAddress(account);
      } catch {
        throw newHttpError(400, { code: '400.2', message: 'account is invalid' });
      }
    }

    try {
      const service = new Service(chainId);
      const marketInfo = await service.getMarketInfo(marketId, account);
      return formatJSONResponse(marketInfo);
    } catch (err) {
      throw newInternalServerError(err);
    }
  },
};
