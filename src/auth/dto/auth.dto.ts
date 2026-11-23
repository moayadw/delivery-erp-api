import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'moayad@example.com' }) @IsEmail() email: string;
  @ApiProperty({ example: 'Moayad' }) @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ example: 'StrongPass123' }) @IsString() @MinLength(8) password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'moayad@example.com' }) @IsEmail() email: string;
  @ApiProperty({ example: 'StrongPass123' }) @IsString() @IsNotEmpty() password: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() @IsNotEmpty() refreshToken: string;
}
