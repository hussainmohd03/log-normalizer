import { JobStatus, NormalizeJob, Prisma } from 'generated/prisma/client';

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  parentJobId: string | null;
  result: JobResult | null;
  error: string | null;
  fixesApplied: string[];
  hallucinationsStripped: string[];
}

export interface JobResult {
  ocsf: Prisma.JsonValue;
  confidence: number;
  decision: string;
  breakdown: Prisma.JsonValue;
  validationErrors: Prisma.JsonValue;
  processingTimeMs: number;
}

function toStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function toJobResponse(row: NormalizeJob): JobResponse {
  return {
    jobId: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    parentJobId: row.parentJobId,
    result: row.status === JobStatus.COMPLETED ? extractResult(row) : null,
    error: row.status === JobStatus.FAILED ? row.error : null,
    fixesApplied: toStringArray(row.fixesApplied),
    hallucinationsStripped: toStringArray(row.hallucinationsStripped),
  };
}

function extractResult(row: NormalizeJob): JobResult {
  return {
    ocsf: row.ocsf!,
    confidence: row.confidence!,
    decision: row.decision!,
    breakdown: row.breakdown!,
    validationErrors: row.validationErrors!,
    processingTimeMs: row.processingTimeMs!,
  };
}
