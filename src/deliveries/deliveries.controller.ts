import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto, UpdateDeliveryDto } from './dto/delivery.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

@ApiTags('deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Post('projects/:projectId/deliveries')
  create(
    @CurrentUser() u: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateDeliveryDto,
  ) {
    return this.deliveries.create(u.id, projectId, dto);
  }

  @Get('projects/:projectId/deliveries')
  list(@CurrentUser() u: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.deliveries.listForProject(u.id, projectId);
  }

  @Get('deliveries/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveries.getOwned(id, u.id);
  }

  @Patch('deliveries/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeliveryDto) {
    return this.deliveries.update(id, u.id, dto);
  }

  @Delete('deliveries/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveries.remove(id, u.id);
  }
}
