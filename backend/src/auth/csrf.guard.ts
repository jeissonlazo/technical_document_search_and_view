import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/app-error';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.auth;

    if (!auth || auth.method !== 'cookie') return true;
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;

    const token = request.headers['x-csrf-token'];
    if (typeof token !== 'string' || !auth.csrf || token !== auth.csrf) {
      throw new AppError('CSRF_INVALID', 'La solicitud no incluye un token CSRF válido.', 403, false);
    }

    return true;
  }
}
