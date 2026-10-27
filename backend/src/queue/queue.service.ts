import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  constructor(@InjectQueue('documents') private readonly queue: Queue) {}

  async enqueue(documentId: string, jobId: string = documentId): Promise<void> {
    await this.queue.add(
      'process-document',
      { documentId },
      {
        jobId,
        attempts: 4,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }
}
