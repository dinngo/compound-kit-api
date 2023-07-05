import * as api from 'src/libs/api';
import { version } from 'package.json';

export const statusRoute: api.Route = {
  method: 'GET',
  path: '/status',
  handler: async () => {
    return api.formatJSONResponse({ version });
  },
};
