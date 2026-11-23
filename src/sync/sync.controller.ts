import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('deliveries/:deliveryId')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('sync') @HttpCode(202)
  start(@CurrentUser() u: AuthUser, @Param('deliveryId', ParseUUIDPipe) id: string) { return this.sync.requestSync(u.id, id); }

  @Get('sync-status')
  status(@CurrentUser() u: AuthUser, @Param('deliveryId', ParseUUIDPipe) id: string) { return this.sync.getStatus(u.id, id); }

  @Get('sync-logs')
  logs(@CurrentUser() u: AuthUser, @Param('deliveryId', ParseUUIDPipe) id: string) { return this.sync.getLogs(u.id, id); }
}
