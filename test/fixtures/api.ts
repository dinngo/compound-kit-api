import type { APIGatewayProxyEventHeaders, APIGatewayProxyEventQueryStringParameters, Context } from 'aws-lambda';
import { Event } from 'src/libs/api';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import httpErrorHandler from 'src/libs/api/middleware.http-error-handler';
import httpHeaderNormalizer from '@middy/http-header-normalizer';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpRouterHandler, { Method } from '@middy/http-router';
import httpUrlEncodeBodyParser from '@middy/http-urlencode-body-parser';
import httpUrlEncodePathParser from '@middy/http-urlencode-path-parser';
import middy from '@middy/core';
import { routes } from 'src/routes';

export interface NewTestEventOptions {
  headers?: APIGatewayProxyEventHeaders;
  queryStringParameters?: APIGatewayProxyEventQueryStringParameters;
  body?: any;
}

export function newTestEvent(httpMethod: Method, path: string, options: NewTestEventOptions = {}): Event {
  const { headers = {}, queryStringParameters = null, body = null } = options;

  return {
    resource: '/{proxy+}',
    path,
    httpMethod,
    requestContext: {
      resourcePath: '/{proxy+}',
      httpMethod,
      path: `/test/${path}`,
      accountId: '',
      apiId: '',
      authorizer: {},
      protocol: '',
      identity: {
        accessKey: '',
        accountId: '',
        apiKey: '',
        apiKeyId: '',
        caller: '',
        clientCert: null,
        cognitoAuthenticationProvider: '',
        cognitoAuthenticationType: '',
        cognitoIdentityId: '',
        cognitoIdentityPoolId: '',
        principalOrgId: '',
        sourceIp: '',
        user: '',
        userAgent: '',
        userArn: '',
      },
      stage: '',
      requestId: '',
      requestTimeEpoch: 12345567,
      resourceId: '',
    },
    headers,
    rawHeaders: {},
    multiValueHeaders: {},
    queryStringParameters,
    multiValueQueryStringParameters: null,
    pathParameters: {},
    stageVariables: null,
    body,
    isBase64Encoded: false,
  };
}

export const testContext: Context = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: '',
  functionVersion: '',
  invokedFunctionArn: '',
  memoryLimitInMB: '234',
  awsRequestId: '',
  logGroupName: '',
  logStreamName: '',
  getRemainingTimeInMillis: () => 60000,
  done: () => {},
  fail: (_) => {},
  succeed: () => {},
};

export const testHandler = middy(httpRouterHandler(routes))
  // request transformation
  .use(httpHeaderNormalizer())
  .use(httpUrlEncodePathParser())
  .use(httpUrlEncodeBodyParser())
  .use(httpJsonBodyParser())
  // response transformation
  .use(httpErrorHandler(false));

export async function quote<Params = any, ResponseBody = any>(
  chainId: number,
  marketId: string,
  operation: string,
  params: Params,
  permit2Type: apisdk.Permit2Type = 'permit'
): Promise<ResponseBody> {
  const event = newTestEvent('POST', `/v1/markets/${chainId}/${marketId}/${operation}`, {
    body: params,
    queryStringParameters: { permit2Type },
  });
  const resp = await testHandler(event, testContext);
  expect(resp.statusCode).to.eq(200);

  return JSON.parse(resp.body);
}

export async function buildRouterTransactionRequest(routerData: apisdk.RouterData): Promise<common.TransactionRequest> {
  const event = newTestEvent('POST', '/v1/transactions/build', { body: routerData });
  const resp = await testHandler(event, testContext);
  expect(resp.statusCode).to.eq(200);

  return JSON.parse(resp.body);
}
