export class CompleteNormalizeJobDto {
  ocsf: Record<string, unknown>;
  confidence: number;
  decision: string;
  breakdown: Record<string, unknown>;
  validationErrors: Record<string, unknown> | null;
  processingTimeMs: number;
}
