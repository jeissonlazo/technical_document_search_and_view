import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  private readonly timeoutMs: number;

  constructor(
    @InjectQueue('documents') private readonly queue: Queue,
    config: ConfigService,
  ) {
    this.timeoutMs = config.get<number>('queue.operationTimeoutMs') ?? 2_000;
  }

  async enqueue(documentId: string, jobId: string = documentId): Promise<void> {
    await withTimeout(
      this.queue.add(
        'process-document',
        { documentId },
        {
          jobId,
          attempts: 4,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      ),
      'encolar el documento',
      this.timeoutMs,
    );
  }

  async hasPendingJob(documentId: string): Promise<boolean> {
    const jobs = await withTimeout(
      this.queue.getJobs(['waiting', 'active', 'delayed'], 0, 500, true),
      'consultar la cola',
      this.timeoutMs,
    );
    return jobs.some((job) => job?.data?.documentId === documentId);
  }
}

function withTimeout<T>(promise: Promise<T>, action: string, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return promise;

  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout al ${action}: Redis/BullMQ no respondió.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
