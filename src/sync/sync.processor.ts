import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SYNC_QUEUE, SyncService } from './sync.service';

// The worker: takes jobs off the queue. If process() throws, BullMQ waits (backoff) and tries again.
@Processor(SYNC_QUEUE)
export class SyncProcessor extends WorkerHost {
  constructor(private readonly sync: SyncService) { super(); }

  async process(job: Job<{ deliveryId: string }>) {
    await this.sync.runDeliverySync(job.data.deliveryId, job.attemptsMade + 1);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ deliveryId: string }> | undefined, err: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.sync.markDeliveryFailed(job.data.deliveryId, err.message);
    }
  }
}
