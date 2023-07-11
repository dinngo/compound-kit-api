import { createError } from '@middy/util';

export interface HttpErrorMessage {
  code?: string;
  message: string;
}

export function newHttpError(statusCode: number, message: HttpErrorMessage) {
  return createError(statusCode, JSON.stringify(message));
}

export function newInternalServerError(err?: any) {
  if (err) console.error(err);
  return newHttpError(500, { message: 'Internal Server Error' });
}
