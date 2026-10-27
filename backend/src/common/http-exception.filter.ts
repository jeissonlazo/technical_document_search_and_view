import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { AppError } from './app-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const supportRef = randomUUID();

    if (exception instanceof AppError) {
      response.status(exception.status).json({
        code: exception.code,
        message: exception.message,
        retryable: exception.retryable,
        params: exception.params,
        supportRef,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? ((body as { message: string[] }).message).join('; ')
            : ((body as { message?: string }).message ?? exception.message);

      response.status(status).json({
        code: status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : 'VALIDATION_ERROR',
        message,
        retryable: false,
        supportRef,
      });
      return;
    }

    this.logger.error(`Error no controlado [${supportRef}]`, exception instanceof Error ? exception.stack : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'No se pudo completar la operación por un problema interno.',
      retryable: false,
      supportRef,
    });
  }
}
