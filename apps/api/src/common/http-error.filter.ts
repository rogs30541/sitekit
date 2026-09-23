import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { HttpError } from '@sitekit/core';

/** core 丟出的 HttpError → 與 Nest HttpException 相同的 JSON 形狀 { message, error, statusCode } */
@Catch(HttpError)
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: HttpError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(exception.status).json(exception.toJSON());
  }
}
