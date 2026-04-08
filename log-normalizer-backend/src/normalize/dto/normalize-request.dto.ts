import { IsNotEmpty, IsString } from 'class-validator';

export class NormalizeRequestDto {
  @IsString()
  @IsNotEmpty()
  rawLog: string;

  @IsString()
  @IsNotEmpty()
  source: string;

  @IsString()
  @IsNotEmpty()
  format: string;
}
