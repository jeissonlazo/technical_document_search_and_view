import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import type { AuthUser } from '@docs/shared';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const SESSION_COOKIE = 'sid';
const SESSION_PREFIX = 'session:';
const USER_CACHE_PREFIX = 'auth:user:';

interface SessionPayload {
  userId: string;
  csrf: string;
}

export interface SessionResult {
  user: AuthUser;
  sid: string;
  csrf: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  getCookieName(): string {
    return SESSION_COOKIE;
  }

  getSessionTtlSeconds(): number {
    return this.config.getOrThrow<number>('sessionTtlSeconds');
  }

  async register(email: string, password: string): Promise<SessionResult> {
    const normalized = email.trim().toLowerCase();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    let user;
    try {
      user = await this.prisma.user.create({
        data: { email: normalized, passwordHash },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new AppError('EMAIL_TAKEN', 'Ya existe una cuenta con ese email.', 409, false);
      }
      throw error;
    }

    const session = await this.createSession(user.id);
    return { ...session, user: toAuthUser(user) };
  }

  async login(email: string, password: string): Promise<SessionResult> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user || user.disabledAt) {
      throw new AppError('INVALID_CREDENTIALS', 'Email o contraseña incorrectos.', 401, false);
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new AppError('INVALID_CREDENTIALS', 'Email o contraseña incorrectos.', 401, false);
    }

    const session = await this.createSession(user.id);
    return { ...session, user: toAuthUser(user) };
  }

  async createSession(userId: string): Promise<{ sid: string; csrf: string }> {
    const sid = randomBytes(32).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    await this.redis.client.set(
      `${SESSION_PREFIX}${sid}`,
      JSON.stringify({ userId, csrf } satisfies SessionPayload),
      'EX',
      this.getSessionTtlSeconds(),
    );
    return { sid, csrf };
  }

  async getSession(sid: string): Promise<SessionPayload | null> {
    const raw = await this.redis.client.get(`${SESSION_PREFIX}${sid}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionPayload;
    } catch {
      return null;
    }
  }

  async authenticate(sid: string): Promise<{ user: AuthUser; csrf: string } | null> {
    const session = await this.getSession(sid);
    if (!session) return null;
    const user = await this.getUser(session.userId);
    if (!user) return null;
    return { user, csrf: session.csrf };
  }

  async getUser(userId: string): Promise<AuthUser | null> {
    const cacheKey = `${USER_CACHE_PREFIX}${userId}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      try {
        const user = JSON.parse(cached) as AuthUser & { disabledAt?: string | null };
        if (user.disabledAt) return null;
        return {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        };
      } catch {
        await this.redis.client.del(cacheKey);
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.disabledAt) return null;

    const authUser = toAuthUser(user);
    const ttl = this.config.get<number>('authUserCacheTtlSeconds') ?? 30;
    await this.redis.client.set(
      cacheKey,
      JSON.stringify({ ...authUser, disabledAt: null }),
      'EX',
      ttl,
    );
    return authUser;
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.redis.client.del(`${USER_CACHE_PREFIX}${userId}`);
  }

  async destroySession(sid: string): Promise<void> {
    await this.redis.client.del(`${SESSION_PREFIX}${sid}`);
  }

  async validateApiKey(rawKey: string): Promise<AuthUser | null> {
    const keyHash = hashApiKey(rawKey);
    const record = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!record || record.revokedAt || record.user.disabledAt) return null;
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;

    await this.prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });

    return toAuthUser(record.user);
  }

  async createApiKey(userId: string, name: string, expiresAt?: string) {
    const rawKey = `tdk_${randomBytes(32).toString('base64url')}`;
    const prefix = rawKey.slice(0, 12);
    const record = await this.prisma.apiKey.create({
      data: {
        userId,
        name: name.trim(),
        prefix,
        keyHash: hashApiKey(rawKey),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return { key: rawKey, apiKey: record };
  }

  async listApiKeys(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async revokeApiKey(userId: string, id: string): Promise<void> {
    const result = await this.prisma.apiKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new AppError('API_KEY_NOT_FOUND', 'La API key no existe o ya fue revocada.', 404, false);
    }
  }
}

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function toAuthUser(user: { id: string; email: string; createdAt: Date }): AuthUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}
