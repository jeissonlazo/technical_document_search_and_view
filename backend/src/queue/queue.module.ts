import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(config.getOrThrow<string>('redisUrl'));
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            username: redisUrl.username || undefined,
            password: redisUrl.password || undefined,
            db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
            ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
          },
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: 'documents' }),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
