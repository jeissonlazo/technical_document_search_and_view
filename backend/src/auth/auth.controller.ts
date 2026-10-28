import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentAuth } from '../common/current-auth.decorator';
import type { AuthContext } from '../common/auth.types';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { LoginDto, RegisterDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto.email, dto.password);
    this.setSessionCookie(res, result.sid);
    return { user: result.user, csrfToken: result.csrf };
  }

  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password);
    this.setSessionCookie(res, result.sid);
    return { user: result.user, csrfToken: result.csrf };
  }

  @Post('logout')
  @UseGuards(AuthGuard, CsrfGuard)
  async logout(@CurrentAuth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    if (auth.sid) await this.auth.destroySession(auth.sid);
    res.clearCookie(this.auth.getCookieName(), { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentAuth() auth: AuthContext) {
    return { user: auth.user, csrfToken: auth.csrf ?? null };
  }

  private setSessionCookie(res: Response, sid: string): void {
    const frontendOrigin = this.config.get<string>('frontendOrigin') ?? '';
    res.cookie(this.auth.getCookieName(), sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: frontendOrigin.startsWith('https://'),
      path: '/',
      maxAge: this.auth.getSessionTtlSeconds() * 1000,
    });
  }
}
