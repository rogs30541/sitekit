/**
 * core 與框架的相容層：core 不依賴 NestJS，但為了讓既有服務碼零改動，提供同名的例外／裝飾器／Logger。
 * - HttpError 家族：殼層（Nest filter／Hono onError）轉成 HTTP 回應，JSON 形狀維持 { message, error, statusCode }
 * - Injectable()：只寫入 `__injectable__` 中繼資料並觸發 TS 產生 design:paramtypes，Nest 可直接把 core class 當 provider；Hono 殼用手動 new
 * - OnModuleInit／OnModuleDestroy：純介面（Nest 依 duck typing 呼叫）
 */
import 'reflect-metadata';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string | Record<string, unknown>,
    public readonly error = 'Error',
  ) {
    super(typeof message === 'string' ? message : JSON.stringify(message));
    this.name = 'HttpError';
    this.payload = message;
  }
  readonly payload: string | Record<string, unknown>;
  getStatus() {
    return this.status;
  }
  toJSON() {
    return { message: this.payload, error: this.error, statusCode: this.status };
  }
}
export class BadRequestException extends HttpError {
  constructor(message: string | Record<string, unknown> = 'Bad Request') {
    super(400, message, 'Bad Request');
  }
}
export class UnauthorizedException extends HttpError {
  constructor(message: string | Record<string, unknown> = 'Unauthorized') {
    super(401, message, 'Unauthorized');
  }
}
export class ForbiddenException extends HttpError {
  constructor(message: string | Record<string, unknown> = 'Forbidden') {
    super(403, message, 'Forbidden');
  }
}
export class NotFoundException extends HttpError {
  constructor(message: string | Record<string, unknown> = 'Not Found') {
    super(404, message, 'Not Found');
  }
}
export class ConflictException extends HttpError {
  constructor(message: string | Record<string, unknown> = 'Conflict') {
    super(409, message, 'Conflict');
  }
}

export function Injectable(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata('__injectable__', true, target);
  };
}
export interface OnModuleInit {
  onModuleInit(): unknown;
}
export interface OnModuleDestroy {
  onModuleDestroy(): unknown;
}

type LogFn = (ctx: string, level: 'log' | 'warn' | 'error' | 'debug', message: string) => void;
let sink: LogFn = (ctx, level, message) => {
  const line = `[${ctx}] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};
/** 殼層可換掉輸出（例如 Nest Logger／Workers console） */
export function setLogSink(fn: LogFn) {
  sink = fn;
}
export class Logger {
  constructor(private readonly ctx = 'core') {}
  log(message: unknown) {
    sink(this.ctx, 'log', String(message));
  }
  warn(message: unknown) {
    sink(this.ctx, 'warn', String(message));
  }
  error(message: unknown) {
    sink(this.ctx, 'error', String(message));
  }
  debug(message: unknown) {
    sink(this.ctx, 'debug', String(message));
  }
}
