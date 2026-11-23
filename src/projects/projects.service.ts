import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(@InjectRepository(Project) private readonly repo: Repository<Project>) {}

  create(ownerId: string, dto: CreateProjectDto) {
    return this.repo.save(this.repo.create({ ...dto, ownerId }));
  }

  list(ownerId: string) {
    return this.repo.find({ where: { ownerId }, order: { createdAt: 'DESC' } });
  }

  // Every lookup is scoped to the owner, so users can never touch each other's data.
  async getOwned(id: string, ownerId: string) {
    const project = await this.repo.findOne({ where: { id, ownerId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(id: string, ownerId: string, dto: UpdateProjectDto) {
    const project = await this.getOwned(id, ownerId);
    return this.repo.save(Object.assign(project, dto));
  }

  async remove(id: string, ownerId: string) {
    const project = await this.getOwned(id, ownerId);
    await this.repo.remove(project);
    return { success: true };
  }
}
