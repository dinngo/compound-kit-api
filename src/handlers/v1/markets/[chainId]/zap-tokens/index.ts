import { EventPathParameters, Route, formatJSONResponse, newHttpError } from 'src/libs/api';
import * as apisdk from '@protocolink/api';
import { validateChain } from 'src/validations';

type GetZapTokensRouteParams = EventPathParameters<{ chainId: string; marketId: string }>;

export const v1GetZapTokensRoute: Route<GetZapTokensRouteParams> = {
  method: 'GET',
  path: '/v1/{chainId}/zap-tokens',
  handler: async (event) => {
    const chainId = Number(event.pathParameters.chainId);
    if (!validateChain(chainId)) {
      throw newHttpError(400, { code: '400.1', message: 'chain does not exist' });
    }

    // get Paraswap token list
    const tokens = await apisdk.protocols.paraswapv5.getSwapTokenTokenList(chainId);
    return formatJSONResponse({ tokens });
  },
};
