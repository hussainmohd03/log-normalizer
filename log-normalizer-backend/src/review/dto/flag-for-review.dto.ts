import { IsOptional, IsString } from 'class-validator';

export class FlagForReviewDTO {
  @IsOptional()
  @IsString()
  reason?: string;
}
