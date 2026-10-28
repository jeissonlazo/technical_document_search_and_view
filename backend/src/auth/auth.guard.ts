import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/app-error';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const startedAt = performance.now();
    request.searchTiming = {
      ...request.searchTiming,
      startedAt: request.searchTiming?.startedAt ?? startedAt,
    };

    try {
      const authorization = request.headers.authorization;

      if (authorization?.startsWith('Bearer ')) {
        const user = await this.auth.validateApiKey(authorization.slice('Bearer '.length).trim());
        if (!user) {
          throw new AppError('AUTH_INVALID', 'La API key no es válida o expiró.', 401, false);
        }
        request.auth = { user, method: 'apiKey', csrf: null };
        return true;
      }

      const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
      const sid = cookies?.[this.auth.getCookieName()];
      if (!sid) {
        throw new AppError('AUTH_REQUIRED', 'Debes iniciar sesión.', 401, false);
      }

      const session = await this.auth.authenticate(sid);
      if (!session) {
        throw new AppError('SESSION_EXPIRED', 'La sesión expiró. Vuelve a iniciar sesión.', 401, false);
      }

      request.auth = {
        user: session.user,
        method: 'cookie',
        csrf: session.csrf,
        sid,
      };
      return true;
    } finally {
      request.searchTiming.authMs = performance.now() - startedAt;
    }
  }
}
