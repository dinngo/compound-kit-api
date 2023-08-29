import errorLogger from '@middy/error-logger';
import httpErrorHandler from 'src/libs/api/middleware.http-error-handler';
import httpHeaderNormalizer from '@middy/http-header-normalizer';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpRouterHandler from '@middy/http-router';
import httpUrlEncodeBodyParser from '@middy/http-urlencode-body-parser';
import httpUrlEncodePathParser from '@middy/http-urlencode-path-parser';
import inputOutputLogger from '@middy/input-output-logger';
import middy from '@middy/core';
import { routes } from './routes';
import warmup from '@middy/warmup';

export const handler = middy(httpRouterHandler(routes))
  // misc
  .use(inputOutputLogger())
  .use(errorLogger())
  .use(warmup())
  // request transformation
  .use(httpHeaderNormalizer())
  .use(httpUrlEncodePathParser())
  .use(httpUrlEncodeBodyParser())
  .use(httpJsonBodyParser())
  // response transformation
  .use(httpErrorHandler());
