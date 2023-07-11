import { Route } from '@middy/http-router';
import * as api from 'src/libs/api';
import { statusRoute } from 'src/handlers/status';
import { v1GetMarketsRoute } from 'src/handlers/v1/markets';

export const routes: Route<api.Event>[] = [statusRoute, v1GetMarketsRoute];
