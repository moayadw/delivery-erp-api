import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ReceiptType } from '../../deliveries/receipt.entity';

// One entry per uploaded file, matched by position (metadata[0] describes files[0]).
export class ReceiptMetaDto {
  @IsString() @IsNotEmpty() @MaxLength(100) clientId: string;
  @IsEnum(ReceiptType) type: ReceiptType;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999) amount?: number;
}

export class UpdateReceiptDto {
  @ApiPropertyOptional({ enum: ReceiptType }) @IsOptional() @IsEnum(ReceiptType) type?: ReceiptType;
  @ApiPropertyOptional({ example: 120.5 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
}
