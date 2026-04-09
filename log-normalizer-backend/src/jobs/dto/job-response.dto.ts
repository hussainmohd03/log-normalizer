import { JobStatus, NormalizeJob, Prisma } from 'generated/prisma/client';

/**
 * Wire shape returned by the polling and SSE endpoints.
 *
 * Deliberately omits `rawLog`, `source`, `format`, and `attempts`:
 *  - `rawLog` is user-supplied input we never need to echo back per poll
 *  - `source`/`format` are known to the submitter
 *  - `attempts` is an internal retry counter (Week 2)
 *
 * `result` and `error` are mutually exclusive — present only in the
 * terminal states they belong to. The frontend can treat this as a
 * discriminated union on `status`.
 */
export interface JobResponse {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Set when this job was created via the retry endpoint. References the source job. */
  parentJobId: string | null;
  result: JobResult | null;
  error: string | null;
}

export interface JobResult {
  ocsf: Prisma.JsonValue;
  confidence: number;
  decision: string;
  breakdown: Prisma.JsonValue;
  validationErrors: Prisma.JsonValue;
  processingTimeMs: number;
}

/**
 * Pure mapper — no I/O, no clock reads. Kept pure so it can be
 * unit-tested in isolation and reused by the SSE endpoint in Step 9.
 */
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
  };
}

function extractResult(row: NormalizeJob): JobResult {
  // These are non-null by the time a row reaches COMPLETED — markCompleted
  // writes them in the same UPDATE as the status transition. The non-null
  // assertions document that invariant rather than guess defaults.
  return {
    ocsf: row.ocsf!,
    confidence: row.confidence!,
    decision: row.decision!,
    breakdown: row.breakdown!,
    validationErrors: row.validationErrors!,
    processingTimeMs: row.processingTimeMs!,
  };
}
