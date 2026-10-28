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

    if (exception instanceof Error && exception.name === 'MulterError') {
      const multerCode = (exception as Error & { code?: string }).code;

      if (multerCode === 'LIMIT_FILE_SIZE') {
        response.status(413).json({
          code: 'FILE_TOO_LARGE',
          message: 'El archivo supera el tamaño máximo permitido (25 MB por defecto).',
          retryable: false,
          supportRef,
        });
        return;
      }

      if (multerCode === 'LIMIT_FILE_COUNT') {
        response.status(413).json({
          code: 'BATCH_TOO_LARGE',
          message: 'El lote supera la cantidad máxima de archivos permitida.',
          retryable: false,
          supportRef,
        });
        return;
      }

      response.status(400).json({
        code: 'INVALID_MULTIPART',
        message: 'La solicitud multipart no es válida. Revisa los campos y el archivo enviado.',
        retryable: false,
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

      const safeMessage =
        status === 413
          ? 'El archivo o la carga supera el tamaño máximo permitido.'
          : status === 404
            ? 'El recurso solicitado no existe.'
            : message;

      const code =
        status === 400
          ? 'VALIDATION_ERROR'
          : status === 401
            ? 'AUTH_REQUIRED'
            : status === 403
              ? 'FORBIDDEN'
              : status === 404
                ? 'NOT_FOUND'
                : status === 409
                  ? 'CONFLICT'
                  : status === 413
                    ? 'FILE_TOO_LARGE'
                    : status === 429
                      ? 'RATE_LIMITED'
                      : 'HTTP_ERROR';

      response.status(status).json({
        code,
        message: safeMessage,
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
