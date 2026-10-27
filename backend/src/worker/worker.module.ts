import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '../config/configuration';
import { validateEnv } from '../config/env.validation';
import { EventsModule } from '../events/events.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { RedisModule } from '../redis/redis.module';
import { SearchModule } from '../search/search.module';
import { StorageModule } from '../storage/storage.module';
import { DocumentProcessor } from './document.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    QueueModule,
    ExtractionModule,
    SearchModule,
    EventsModule,
  ],
  providers: [DocumentProcessor],
})
export class WorkerModule {}
