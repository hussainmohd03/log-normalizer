import { Prisma } from 'generated/prisma/client';

export class CreateNormalizeJobDto {
  rawLog!: Prisma.InputJsonValue;
  source!: string;
  format!: string;
  idempotencyKey?: string;
}
