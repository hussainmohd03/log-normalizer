import { Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsNotEmpty,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'

export class IngestDto {
  @IsNotEmpty()
  @IsString()
  source!: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsNotEmptyObject()
  rawContent!: Record<string, any>

  /**
   * Optional per-item idempotency key. For single ingest the canonical
   * place is the `Idempotency-Key` HTTP header — this field exists so
   * the same DTO can be reused inside the batch endpoint where headers
   * cannot vary per item.
   */
  @IsOptional()
  @IsString()
  idempotencyKey?: string
}

export class IngestBatchDto {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => IngestDto)
  items!: IngestDto[]
}
