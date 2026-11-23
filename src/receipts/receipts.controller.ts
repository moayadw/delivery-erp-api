import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post,
  StreamableFile, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { UpdateReceiptDto } from './dto/receipt.dto';
import { ALLOWED_MIME, ReceiptsService } from './receipts.service';

const MAX_FILES = 30;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB each; files are held in memory while processing

@ApiTags('receipts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Post('deliveries/:deliveryId/receipts/bulk')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files', 'metadata'],
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        metadata: {
          type: 'string',
          description: 'JSON array, one entry per file in the same order',
          example: '[{"clientId":"r-001","type":"invoice","amount":120.5},{"clientId":"r-002","type":"goods_receipt"}]',
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      limits: { fileSize: MAX_FILE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
        cb(new BadRequestException('Only JPEG, PNG, WebP and PDF files are allowed'), false);
      },
    }),
  )
  bulk(
    @CurrentUser() u: AuthUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('metadata') metadata: string,
  ) {
    return this.receipts.bulkCreate(u.id, deliveryId, files, metadata);
  }

  @Get('deliveries/:deliveryId/receipts')
  list(@CurrentUser() u: AuthUser, @Param('deliveryId', ParseUUIDPipe) deliveryId: string) {
    return this.receipts.listForDelivery(u.id, deliveryId);
  }

  @Get('receipts/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.receipts.getOwned(id, u.id);
  }

  @Patch('receipts/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReceiptDto) {
    return this.receipts.update(id, u.id, dto);
  }

  @Delete('receipts/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.receipts.remove(id, u.id);
  }

  @Get('receipts/:id/file')
  async file(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { stream, mimeType, name } = await this.receipts.openFile(id, u.id);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  }
}
