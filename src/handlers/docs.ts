import * as api from 'src/libs/api';

export const docsRoute: api.Route = {
  method: 'GET',
  path: '/docs',
  handler: async () => {
    return {
      statusCode: 302,
      body: '',
      headers: {
        Location: 'https://app.swaggerhub.com/apis-docs/dinngodev/compound-kit',
      },
    };
  },
};
