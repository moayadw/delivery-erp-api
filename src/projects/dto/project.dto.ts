import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ProjectStatus } from '../project.entity';

export class CreateProjectDto {
  @ApiProperty({ example: 'Warehouse Fit-out' }) @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional({ example: 'ACME Co.' }) @IsOptional() @IsString() client?: string;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @ApiPropertyOptional({ enum: ProjectStatus }) @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
}
