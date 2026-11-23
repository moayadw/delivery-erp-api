import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from './delivery.entity';
import { CreateDeliveryDto, UpdateDeliveryDto } from './dto/delivery.dto';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectRepository(Delivery) private readonly repo: Repository<Delivery>,
    private readonly projects: ProjectsService,
  ) {}

  async create(userId: string, projectId: string, dto: CreateDeliveryDto) {
    await this.projects.getOwned(projectId, userId); // ownership check
    return this.repo.save(this.repo.create({ ...dto, projectId }));
  }

  async listForProject(userId: string, projectId: string) {
    await this.projects.getOwned(projectId, userId);
    return this.repo.find({ where: { projectId }, order: { createdAt: 'DESC' } });
  }

  async getOwned(id: string, userId: string) {
    const delivery = await this.repo
      .createQueryBuilder('d')
      .innerJoin('d.project', 'p')
      .where('d.id = :id AND p.ownerId = :userId', { id, userId })
      .getOne();
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  async update(id: string, userId: string, dto: UpdateDeliveryDto) {
    const delivery = await this.getOwned(id, userId);
    return this.repo.save(Object.assign(delivery, dto));
  }

  async remove(id: string, userId: string) {
    const delivery = await this.getOwned(id, userId);
    await this.repo.remove(delivery);
    return { success: true };
  }
}
