import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { Delivery } from '../deliveries/delivery.entity';
import { Receipt } from '../deliveries/receipt.entity';
import { SyncLog } from '../deliveries/sync-log.entity';
import { ErpClient } from './erp/erp-client';
import { HttpErpClient } from './erp/http-erp.client';
import { OdooErpClient } from './erp/odoo-erp.client';
import { StorageModule } from '../storage/storage.module';
import { SyncController } from './sync.controller';
import { SyncProcessor } from './sync.processor';
import { SYNC_QUEUE, SyncService } from './sync.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: { host: cfg.get('REDIS_HOST', 'localhost'), port: Number(cfg.get('REDIS_PORT', 6379)) },
      }),
    }),
    BullModule.registerQueue({ name: SYNC_QUEUE }),
    TypeOrmModule.forFeature([Delivery, Receipt, SyncLog]),
    DeliveriesModule,
    StorageModule,
  ],
  controllers: [SyncController],
  providers: [
    SyncService,
    SyncProcessor,
    HttpErpClient,
    OdooErpClient,
    {
      // ERP_DRIVER=odoo uses real Odoo. Anything else (default) uses the fake ERP.
      provide: ErpClient,
      inject: [ConfigService, HttpErpClient, OdooErpClient],
      useFactory: (cfg: ConfigService, http: HttpErpClient, odoo: OdooErpClient) =>
        cfg.get('ERP_DRIVER', 'mock') === 'odoo' ? odoo : http,
    },
  ],
})
export class SyncModule {}
