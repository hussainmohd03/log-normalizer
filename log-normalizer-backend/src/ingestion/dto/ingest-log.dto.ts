import { ArrayNotEmpty, IsNotEmpty, IsNotEmptyObject, IsOptional, IsString } from "class-validator";

export class IngestDto {

  @IsNotEmpty()
  @IsString()
  source!: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsNotEmptyObject()
  rawContent!: Record<string, any>

}

export class IngestBatchDto {

  @IsNotEmpty()
  @IsString()
  source!: string;

  @IsOptional()
  @IsString()
  format?: string;

  @ArrayNotEmpty()
  alerts!: Record<string, any>[]

}