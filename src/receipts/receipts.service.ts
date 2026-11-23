import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { DeliveryStatus } from '../deliveries/delivery.entity';
import { Receipt } from '../deliveries/receipt.entity';
import { StorageService } from '../storage/storage.service';
import { ReceiptMetaDto, UpdateReceiptDto } from './dto/receipt.dto';

export const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export type BulkResult = {
  index: number;
  clientId: string | null;
  status: 'created' | 'duplicate' | 'failed';
  receipt?: Receipt;
  error?: string;
};

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Receipt) private readonly repo: Repository<Receipt>,
    private readonly deliveries: DeliveriesService,
    private readonly storage: StorageService,
  ) {}

  async bulkCreate(userId: string, deliveryId: string, files: Express.Multer.File[], metadataRaw: string) {
    const delivery = await this.deliveries.getOwned(deliveryId, userId);
    if (delivery.status === DeliveryStatus.SYNCING || delivery.status === DeliveryStatus.SYNCED) {
      throw new ConflictException(`Cannot add receipts while the delivery is ${delivery.status}`);
    }
    if (!files?.length) throw new BadRequestException('No files uploaded (field name: files)');

    const metas = await this.parseMetadata(metadataRaw, files.length);

    const results: BulkResult[] = [];
    // Sequential on purpose: simple, predictable, and 20-30 files is small.
    for (let i = 0; i < files.length; i++) {
      const meta = metas[i];
      const file = files[i];
      try {
        const existing = await this.repo.findOne({ where: { deliveryId, clientId: meta.clientId } });
        if (existing) {
          results.push({ index: i, clientId: meta.clientId, status: 'duplicate', receipt: existing });
          continue;
        }

        const key = await this.storage.save(deliveryId, { buffer: file.buffer, ext: ALLOWED_MIME[file.mimetype] });
        try {
          const receipt = await this.repo.save(
            this.repo.create({
              deliveryId,
              clientId: meta.clientId,
              type: meta.type,
              amount: meta.amount != null ? String(meta.amount) : null,
              fileKey: key,
              originalName: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
            }),
          );
          results.push({ index: i, clientId: meta.clientId, status: 'created', receipt });
        } catch (err) {
          await this.storage.delete(key); // don't leave an orphan file behind
          if ((err as any)?.driverError?.code === '23505') {
            // Two retries raced each other: the unique constraint caught it.
            const dup = await this.repo.findOne({ where: { deliveryId, clientId: meta.clientId } });
            results.push({ index: i, clientId: meta.clientId, status: 'duplicate', receipt: dup ?? undefined });
          } else {
            throw err;
          }
        }
      } catch (err) {
        results.push({
          index: i,
          clientId: meta.clientId,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return {
      summary: {
        total: results.length,
        created: results.filter((r) => r.status === 'created').length,
        duplicates: results.filter((r) => r.status === 'duplicate').length,
        failed: results.filter((r) => r.status === 'failed').length,
      },
      results,
    };
  }

  private async parseMetadata(raw: string, fileCount: number): Promise<ReceiptMetaDto[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('metadata must be a JSON array string');
    }
    if (!Array.isArray(parsed) || parsed.length !== fileCount) {
      throw new BadRequestException(`metadata must be an array with exactly ${fileCount} entries (one per file, same order)`);
    }
    const metas = plainToInstance(ReceiptMetaDto, parsed);
    for (let i = 0; i < metas.length; i++) {
      const errors = await validate(metas[i], { whitelist: true });
      if (errors.length) {
        const msg = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ');
        throw new BadRequestException(`metadata[${i}]: ${msg}`);
      }
    }
    const ids = metas.map((m) => m.clientId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('metadata contains duplicate clientId values');
    return metas;
  }

  async listForDelivery(userId: string, deliveryId: string) {
    await this.deliveries.getOwned(deliveryId, userId);
    return this.repo.find({ where: { deliveryId }, order: { createdAt: 'ASC' } });
  }

  // Ownership is checked through receipt -> delivery -> project -> owner.
  async getOwned(id: string, userId: string) {
    const receipt = await this.repo
      .createQueryBuilder('r')
      .innerJoin('r.delivery', 'd')
      .innerJoin('d.project', 'p')
      .where('r.id = :id AND p.ownerId = :userId', { id, userId })
      .getOne();
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  // Once a delivery is syncing or synced, its receipts are frozen: the ERP already has (or is getting) them.
  private async assertEditable(deliveryId: string, userId: string) {
    const delivery = await this.deliveries.getOwned(deliveryId, userId);
    if (delivery.status === DeliveryStatus.SYNCING || delivery.status === DeliveryStatus.SYNCED) {
      throw new ConflictException(`Receipts cannot be changed while the delivery is ${delivery.status}`);
    }
  }

  async update(id: string, userId: string, dto: UpdateReceiptDto) {
    const receipt = await this.getOwned(id, userId);
    await this.assertEditable(receipt.deliveryId, userId);
    if (dto.type !== undefined) receipt.type = dto.type;
    if (dto.amount !== undefined) receipt.amount = String(dto.amount);
    return this.repo.save(receipt);
  }

  async remove(id: string, userId: string) {
    const receipt = await this.getOwned(id, userId);
    await this.assertEditable(receipt.deliveryId, userId);
    if (receipt.fileKey) await this.storage.delete(receipt.fileKey);
    await this.repo.remove(receipt);
    return { success: true };
  }

  async openFile(id: string, userId: string) {
    const receipt = await this.getOwned(id, userId);
    if (!receipt.fileKey) throw new NotFoundException('This receipt has no file');
    const stream = await this.storage.open(receipt.fileKey);
    return {
      stream,
      mimeType: receipt.mimeType ?? 'application/octet-stream',
      name: receipt.originalName ?? 'receipt',
    };
  }
}
