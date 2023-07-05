import { Route } from '@middy/http-router';
import * as api from 'src/libs/api';
import { statusRoute } from 'src/handlers/status';

export const routes: Route<api.Event>[] = [statusRoute];
