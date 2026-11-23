import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateDeliveryDto {
  @ApiProperty({ example: 'Delivery #1 - Steel beams' }) @IsString() @IsNotEmpty() title: string;
  @ApiProperty({ example: '2026-12-01' }) @IsDateString() deliveryDate: string;
}

export class UpdateDeliveryDto extends PartialType(CreateDeliveryDto) {}
