import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { SearchService } from './search/search.service';
import { OBJECT_STORAGE, type ObjectStorage } from './storage/storage.types';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly search: SearchService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Get()
  async check() {
    const [database, redis, elasticsearch, r2] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.client.ping().then((value) => value === 'PONG').catch(() => false),
      this.search.ping(),
      this.storage.health(),
    ]);

    return {
      status: database && redis && elasticsearch && r2 ? 'ok' : 'degraded',
      services: { database, redis, elasticsearch, r2 },
      timestamp: new Date().toISOString(),
    };
  }
}
