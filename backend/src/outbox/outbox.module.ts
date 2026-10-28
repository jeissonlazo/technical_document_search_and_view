import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { OutboxService } from './outbox.service';

@Module({
  imports: [PrismaModule, QueueModule],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
