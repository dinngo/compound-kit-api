import { Event } from './types';
import { jsonSafeParse, normalizeHttpResponse } from '@middy/util';
import middy from '@middy/core';

// enhance the middy HTTP error handler by incorporating a condition to forward protocolink errors.
// https://github.com/middyjs/middy/tree/main/packages/http-error-handler
export default function httpErrorHandler(logging = true): middy.MiddlewareObj<Event, any, any> {
  return {
    onError: async (request) => {
      if (request.response !== undefined) return;
      if (logging) console.error(request.error);

      if (request.error.expose === undefined) {
        // forwarding the Protocolink API Axios error
        if (request.error.response) {
          const { status, data } = request.error.response;
          request.error = { statusCode: status, message: JSON.stringify(data), expose: true };
        }
        // the HTTP error from the API itself
        else if (request.error.statusCode) {
          request.error.expose = request.error.statusCode < 500;
        }
        // the invariant error from the API itself
        else if (request.error.message?.includes('Invariant failed:')) {
          request.error = {
            statusCode: 400,
            message: JSON.stringify({ message: request.error.message.replace('Invariant failed: ', '') }),
            expose: true,
          };
        }
      }

      // unknown error
      if (!request.error.statusCode || !request.error.expose) {
        request.error = {
          statusCode: 500,
          message: JSON.stringify({ message: 'Internal Server Error' }),
          expose: true,
        };
      }

      if (request.error.expose) {
        normalizeHttpResponse(request);
        const { statusCode, message, headers } = request.error;

        request.response = {
          ...request.response,
          statusCode,
          body: message,
          headers: {
            ...headers,
            ...request.response.headers,
            'Content-Type': typeof jsonSafeParse(message) === 'string' ? 'text/plain' : 'application/json',
          },
        };
      }
    },
  };
}
