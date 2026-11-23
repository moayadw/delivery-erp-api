import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { Receipt, ReceiptSyncStatus } from '../deliveries/receipt.entity';
import { SyncLog } from '../deliveries/sync-log.entity';
import { StorageService } from '../storage/storage.service';
import { ErpClient } from './erp/erp-client';

export const SYNC_QUEUE = 'erp-sync';
export const MAX_ATTEMPTS = 5;

@Injectable()
export class SyncService {
  constructor(
    @InjectQueue(SYNC_QUEUE) private readonly queue: Queue,
    @InjectRepository(Delivery) private readonly deliveryRepo: Repository<Delivery>,
    @InjectRepository(Receipt) private readonly receiptRepo: Repository<Receipt>,
    @InjectRepository(SyncLog) private readonly logRepo: Repository<SyncLog>,
    private readonly deliveries: DeliveriesService,
    private readonly erp: ErpClient,
    private readonly storage: StorageService,
  ) {}

  // Called by the HTTP endpoint: quick, it only queues the work.
  async requestSync(userId: string, deliveryId: string) {
    const delivery = await this.deliveries.getOwned(deliveryId, userId);
    const receiptCount = await this.receiptRepo.count({ where: { deliveryId } });
    if (receiptCount === 0) throw new BadRequestException('Add at least one receipt before syncing');

    // Atomic guard: only one request can move the delivery into "syncing" (double-click safe).
    const moved = await this.deliveryRepo.update(
      { id: deliveryId, status: In([DeliveryStatus.DRAFT, DeliveryStatus.FAILED]) },
      { status: DeliveryStatus.SYNCING },
    );
    if (!moved.affected) throw new ConflictException(`Delivery is already ${delivery.status}`);

    try {
      await this.queue.add('sync-delivery', { deliveryId }, {
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s, 16s
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch {
      await this.deliveryRepo.update(deliveryId, { status: delivery.status });
      throw new ServiceUnavailableException('Sync queue is unavailable, try again shortly');
    }
    return { status: 'queued', deliveryId };
  }

  // Called by the background worker: the real work.
  async runDeliverySync(deliveryId: string, attempt: number) {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId }, relations: { project: true } });
    if (!delivery) return;

    let reference = delivery.erpReference;
    if (!reference) {
      try {
        reference = await this.erp.ensureDelivery({
          externalId: delivery.id,
          title: delivery.title,
          deliveryDate: delivery.deliveryDate,
          projectExternalId: delivery.project.id,
          projectName: delivery.project.name,
        });
        await this.deliveryRepo.update(delivery.id, { erpReference: reference });
        await this.log(delivery.id, null, 'push_delivery', 'success', attempt, `ERP reference ${reference}`);
      } catch (e) {
        await this.log(delivery.id, null, 'push_delivery', 'error', attempt, this.msg(e));
        throw e;
      }
    }

    // Already-synced receipts are skipped, so a retry never re-sends what the ERP already has.
    const receipts = await this.receiptRepo.find({ where: { deliveryId }, order: { createdAt: 'ASC' } });
    let failures = 0;
    for (const r of receipts) {
      if (r.syncStatus === ReceiptSyncStatus.SYNCED) continue;
      try {
        const file = r.fileKey
          ? { mimeType: r.mimeType ?? 'application/octet-stream', content: await this.readFile(r.fileKey) }
          : null;
        const { erpDocumentNumber } = await this.erp.pushReceipt({
          externalId: r.id, deliveryReference: reference, type: r.type, amount: r.amount, fileName: r.originalName, file,
        });
        await this.receiptRepo.update(r.id, { erpDocumentNumber, syncStatus: ReceiptSyncStatus.SYNCED });
        await this.log(delivery.id, r.id, 'push_receipt', 'success', attempt, `ERP document ${erpDocumentNumber}`);
      } catch (e) {
        failures++;
        await this.receiptRepo.update(r.id, { syncStatus: ReceiptSyncStatus.FAILED });
        await this.log(delivery.id, r.id, 'push_receipt', 'error', attempt, this.msg(e));
      }
    }
    if (failures > 0) throw new Error(`${failures} of ${receipts.length} receipts failed to sync`);

    await this.deliveryRepo.update(delivery.id, { status: DeliveryStatus.SYNCED });
    await this.log(delivery.id, null, 'sync_complete', 'success', attempt, `${receipts.length} receipts synced`);
  }

  // Called when BullMQ has used up all attempts.
  async markDeliveryFailed(deliveryId: string, reason: string) {
    await this.deliveryRepo.update(deliveryId, { status: DeliveryStatus.FAILED });
    await this.log(deliveryId, null, 'sync_gave_up', 'error', MAX_ATTEMPTS, reason);
  }

  async getStatus(userId: string, deliveryId: string) {
    const delivery = await this.deliveries.getOwned(deliveryId, userId);
    const rows = await this.receiptRepo.createQueryBuilder('r')
      .select('r.syncStatus', 'status').addSelect('COUNT(*)', 'count')
      .where('r.deliveryId = :deliveryId', { deliveryId }).groupBy('r.syncStatus')
      .getRawMany<{ status: ReceiptSyncStatus; count: string }>();
    const receipts = { pending: 0, synced: 0, failed: 0, total: 0 };
    for (const row of rows) { receipts[row.status] = Number(row.count); receipts.total += Number(row.count); }
    return { deliveryStatus: delivery.status, erpReference: delivery.erpReference, receipts };
  }

  async getLogs(userId: string, deliveryId: string) {
    await this.deliveries.getOwned(deliveryId, userId);
    return this.logRepo.find({ where: { deliveryId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  private async readFile(key: string): Promise<Buffer> {
    const stream = await this.storage.open(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  private log(deliveryId: string, receiptId: string | null, action: string, status: string, attempt: number, message: string) {
    return this.logRepo.save(this.logRepo.create({ deliveryId, receiptId, action, status, attempt, message }));
  }
  private msg(e: unknown) { return e instanceof Error ? e.message : 'Unknown error'; }
}
