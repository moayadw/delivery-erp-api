import { Column, CreateDateColumn, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from '../projects/project.entity';
import { Receipt } from './receipt.entity';

export enum DeliveryStatus {
  DRAFT = 'draft',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  FAILED = 'failed',
}

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() title: string;

  @Column({ type: 'date' }) deliveryDate: string;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.DRAFT }) status: DeliveryStatus;

  // Document number returned by the ERP once synced. Used to keep syncs idempotent.
  @Column({ type: 'varchar', nullable: true }) erpReference: string | null;

  @Index()
  @ManyToOne(() => Project, (p) => p.deliveries, { onDelete: 'CASCADE' })
  project: Project;

  @Column() projectId: string;

  @OneToMany(() => Receipt, (r) => r.delivery) receipts: Receipt[];

  @CreateDateColumn() createdAt: Date;
}
