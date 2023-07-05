import type { APIGatewayProxyEventHeaders, APIGatewayProxyEventQueryStringParameters, Context } from 'aws-lambda';
import { Event } from 'src/libs/api';
import httpErrorHandler from '@middy/http-error-handler';
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
  .use(httpErrorHandler({ logger: false }));
