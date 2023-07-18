import { EventBody, Route, formatJSONResponse, newHttpError } from 'src/libs/api';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import { utils } from 'ethers';

type BuildTransactionRouteParams = EventBody<Partial<apisdk.RouterData>>;

export const v1BuildTransactionRoute: Route<BuildTransactionRouteParams> = {
  method: 'POST',
  path: '/v1/transactions',
  handler: async (event) => {
    if (!event.body) {
      throw newHttpError(400, { code: '400.1', message: 'body is invalid' });
    }

    let chainId = event.body.chainId;
    if (!chainId) {
      throw newHttpError(400, { code: '400.2', message: `chainId can't be blank` });
    }
    chainId = Number(chainId);
    if (Number.isNaN(chainId)) {
      throw newHttpError(400, { code: '400.3', message: 'chainId is invalid' });
    }
    if (!common.isSupportedChainId(chainId)) {
      throw newHttpError(400, { code: '400.4', message: 'chainId is not supported' });
    }

    let account = event.body.account;
    if (!account) {
      throw newHttpError(400, { code: '400.5', message: `account can't be blank` });
    }
    try {
      account = utils.getAddress(account);
    } catch {
      throw newHttpError(400, { code: '400.6', message: 'account is invalid' });
    }

    const { logics = [], permitData, permitSig } = event.body;
    if (logics.length === 0) {
      throw newHttpError(400, { code: '400.7', message: `logics can't be blank` });
    }

    const transactionRequest = await apisdk.buildRouterTransactionRequest({
      chainId,
      account,
      logics,
      permitData,
      permitSig,
    });

    return formatJSONResponse(transactionRequest);
  },
};
