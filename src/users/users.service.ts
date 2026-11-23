import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  create(data: { email: string; name: string; passwordHash: string }) {
    return this.repo.save(this.repo.create({ ...data, email: data.email.toLowerCase() }));
  }

  setRefreshHash(id: string, hash: string | null) {
    return this.repo.update(id, { refreshTokenHash: hash });
  }
}
