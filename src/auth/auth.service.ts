import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      passwordHash: await bcrypt.hash(dto.password, 10),
    });
    return this.issueTokens(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id, user.email);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; email: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.users.findById(payload.sub);
    if (!user?.refreshTokenHash || !(await bcrypt.compare(refreshToken, user.refreshTokenHash))) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    return this.issueTokens(user.id, user.email);
  }

  async logout(userId: string) {
    await this.users.setRefreshHash(userId, null);
    return { success: true };
  }

  async me(userId: string) {
    const u = await this.users.findById(userId);
    if (!u) throw new UnauthorizedException();
    return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
  }

  // Refresh tokens are rotated on every use and only a hash is stored.
  // Simple model: one active session per user.
  private async issueTokens(id: string, email: string) {
    const payload = { sub: id, email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.cfg.get('JWT_ACCESS_TTL', '15m'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.cfg.get('JWT_REFRESH_TTL', '7d'),
    });
    await this.users.setRefreshHash(id, await bcrypt.hash(refreshToken, 10));
    return { accessToken, refreshToken };
  }
}
