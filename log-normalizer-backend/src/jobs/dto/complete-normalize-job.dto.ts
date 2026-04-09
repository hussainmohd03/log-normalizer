import { Prisma } from 'generated/prisma/client';

export class CompleteNormalizeJobDto {
  ocsf: Prisma.InputJsonValue;
  confidence: number;
  decision: string;
  breakdown: Prisma.InputJsonValue;
  validationErrors: Prisma.InputJsonValue;
  processingTimeMs: number;
  fixesApplied!: Prisma.InputJsonValue;
  hallucinationsStripped!: Prisma.InputJsonValue;
}
