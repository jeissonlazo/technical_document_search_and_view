import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private timer?: NodeJS.Timeout;
  private initialTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const interval = this.config.get<number>('outbox.reconcileIntervalMs') ?? 15_000;
    if (interval <= 0) return;

    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();

    // Primera pasada después del arranque para recuperar una caída previa.
    this.initialTimer = setTimeout(() => void this.tick(), 3_000);
    this.initialTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
  }

  async createEvent(documentId: string): Promise<void> {
    await this.prisma.outboxEvent.create({ data: { documentId } });
  }

  async dispatchDocument(documentId: string): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, status: true },
    });

    if (!document || document.status === 'INDEXED' || document.status === 'ERROR') {
      await this.markPublished(documentId);
      return;
    }

    if (await this.queue.hasPendingJob(documentId)) {
      await this.markPublished(documentId);
      return;
    }

    await this.queue.enqueue(documentId, `${documentId}:outbox:${randomUUID()}`);
    await this.markPublished(documentId);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchPending();
      await this.reconcileStuckDocuments();
    } catch (error) {
      this.logger.warn(
        `No se pudo ejecutar el reconciliador de outbox: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private async dispatchPending(): Promise<void> {
    const events = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    for (const event of events) {
      try {
        await this.dispatchDocument(event.documentId);
      } catch (error) {
        const attempts = event.attempts + 1;
        const maxAttempts = this.config.get<number>('outbox.maxAttempts') ?? 10;
        const delayMs = Math.min(60_000, 2_000 * 2 ** Math.min(attempts - 1, 5));

        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts,
            availableAt: new Date(Date.now() + delayMs),
            lastError:
              attempts >= maxAttempts
                ? `Máximo de intentos alcanzado: ${errorMessage(error)}`
                : errorMessage(error),
          },
        });

        this.logger.warn(
          `Outbox ${event.id} (documento ${event.documentId}) falló en el intento ${attempts}: ${errorMessage(error)}`,
        );
      }
    }
  }

  private async reconcileStuckDocuments(): Promise<void> {
    const stuckAfterMs = this.config.get<number>('outbox.stuckAfterMs') ?? 120_000;
    const cutoff = new Date(Date.now() - stuckAfterMs);
    const documents = await this.prisma.document.findMany({
      where: { status: 'PROCESSING', updatedAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });

    for (const document of documents) {
      if (await this.queue.hasPendingJob(document.id)) continue;

      const pending = await this.prisma.outboxEvent.findFirst({
        where: { documentId: document.id, status: 'PENDING' },
        select: { id: true },
      });
      if (!pending) {
        await this.prisma.outboxEvent.create({ data: { documentId: document.id } });
      }

      try {
        await this.dispatchDocument(document.id);
        this.logger.log(`Documento atascado reencolado: ${document.id}`);
      } catch (error) {
        this.logger.warn(
          `No se pudo reencolar el documento ${document.id}: ${errorMessage(error)}`,
        );
      }
    }
  }

  private async markPublished(documentId: string): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { documentId, status: 'PENDING' },
      data: { status: 'PUBLISHED', processedAt: new Date() },
    });
  }
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
