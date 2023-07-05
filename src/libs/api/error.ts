import { createError } from '@middy/util';

export interface HttpErrorMessage {
  code?: string;
  message: string;
}

export function newHttpError(statusCode: number, message: HttpErrorMessage) {
  return createError(statusCode, JSON.stringify(message));
}
