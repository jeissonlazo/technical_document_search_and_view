import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DocumentStatusEvent } from '@docs/shared';
import Redis from 'ioredis';
import { filter, map, Observable, Subject } from 'rxjs';
import { RedisService } from '../redis/redis.service';

const CHANNEL = 'document-events';

export type PublishDocumentEvent = Omit<DocumentStatusEvent, 'timestamp'> & {
  timestamp?: string;
};

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly subject = new Subject<DocumentStatusEvent>();
  private readonly subscriber: Redis;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.subscriber = new Redis(config.getOrThrow<string>('redisUrl'));
  }

  async onModuleInit(): Promise<void> {
    await this.subscriber.subscribe(CHANNEL);
    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        this.subject.next(JSON.parse(message) as DocumentStatusEvent);
      } catch (error) {
        this.logger.warn(`Evento SSE inválido: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.quit();
  }

  async publish(event: PublishDocumentEvent): Promise<void> {
    const payload: DocumentStatusEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    await this.redis.client.publish(CHANNEL, JSON.stringify(payload));
  }

  streamFor(userId: string): Observable<{ data: DocumentStatusEvent }> {
    return this.subject.pipe(
      filter((event) => event.userId === userId),
      map((event) => ({ data: event })),
    );
  }
}
