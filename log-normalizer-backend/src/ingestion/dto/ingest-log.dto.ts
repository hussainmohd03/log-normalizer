import { ArrayNotEmpty, IsArray, IsNotEmpty, IsNotEmptyObject, IsOptional, IsString } from "class-validator";

export class IngestDto {

  @IsNotEmpty()
  @IsString()
  source: string;

  @IsNotEmptyObject()
  rawContent: Record<string, any>

  @IsOptional()
  @IsString()
  format?: string
}
export class IngestBatchDto {

  @IsNotEmpty()
  @IsString()
  source: string;

  @ArrayNotEmpty()
  alerts: Record<string, any>[] 

  @IsOptional()
  @IsString()
  format?: string
}