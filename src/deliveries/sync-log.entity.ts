import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Audit trail of everything the ERP sync does: who/what/when, attempts, errors.
@Entity('sync_logs')
export class SyncLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column() deliveryId: string;

  @Column({ type: 'varchar', nullable: true }) receiptId: string | null;

  @Column() action: string; // e.g. 'push_receipt', 'webhook_received'

  @Column() status: string; // 'success' | 'error'

  @Column({ type: 'int', default: 1 }) attempt: number;

  @Column({ type: 'text', nullable: true }) message: string | null;

  @CreateDateColumn() createdAt: Date;
}
