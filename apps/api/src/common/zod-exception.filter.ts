import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

/** zod 驗證失敗一律回 400（欄位錯誤攤平），不再以 500 洩漏堆疊。 */
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(400).json({ statusCode: 400, error: 'Bad Request', message: exception.flatten().fieldErrors });
  }
}
