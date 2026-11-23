import { Column, CreateDateColumn, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';

export enum ProjectStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() name: string;

  @Column({ type: 'varchar', nullable: true }) client: string | null;

  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.ACTIVE }) status: ProjectStatus;

  @Index()
  @ManyToOne(() => User, (u) => u.projects, { onDelete: 'CASCADE' })
  owner: User;

  @Column() ownerId: string;

  @OneToMany(() => Delivery, (d) => d.project) deliveries: Delivery[];

  @CreateDateColumn() createdAt: Date;
}
