import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from '../projects/project.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ unique: true }) email: string;

  @Column() name: string;

  @Column() passwordHash: string;

  @Column({ type: 'varchar', nullable: true }) refreshTokenHash: string | null;

  @OneToMany(() => Project, (p) => p.owner) projects: Project[];

  @CreateDateColumn() createdAt: Date;
}
