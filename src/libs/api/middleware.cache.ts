import { Event } from './types';
import NodeCache from 'node-cache';
import middy from '@middy/core';

const cache = new NodeCache();

export function cacheMiddleware(ttl = 0): middy.MiddlewareObj<Event> {
  return {
    before: async (request) => {
      const cached = cache.get(request.event.path);
      if (cached) {
        return { statusCode: 200, body: cached };
      }
      return;
    },
    after: async (request) => {
      if (request.response.statusCode === 200) {
        cache.set(request.event.path, request.response.body, ttl);
      }
    },
  };
}
