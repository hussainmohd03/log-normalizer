import { JobStatus, NormalizeJob } from 'generated/prisma/client';
import { toJobResponse } from '../../src/jobs/dto/job-response.dto';

const BASE: NormalizeJob = {
  id: 'job-uuid-1',
  status: JobStatus.QUEUED,
  rawLog: { sensitive: 'input' },
  source: 'crowdstrike',
  format: 'json',
  idempotencyKey: null,
  parentJobId: null,
  ocsf: null,
  confidence: null,
  decision: null,
  breakdown: null,
  validationErrors: null,
  processingTimeMs: null,
  error: null,
  attempts: 0,
  createdAt: new Date('2026-04-08T10:00:00.000Z'),
  updatedAt: new Date('2026-04-08T10:00:00.000Z'),
  startedAt: null,
  completedAt: null,
};

describe('toJobResponse', () => {
  it('never leaks rawLog, source, format, or attempts', () => {
    const out = toJobResponse(BASE) as unknown as Record<string, unknown>;
    expect(out.rawLog).toBeUndefined();
    expect(out.source).toBeUndefined();
    expect(out.format).toBeUndefined();
    expect(out.attempts).toBeUndefined();
  });

  it('serialises all timestamps as ISO 8601 strings', () => {
    const row: NormalizeJob = {
      ...BASE,
      status: JobStatus.ACTIVE,
      startedAt: new Date('2026-04-08T10:00:05.000Z'),
    };
    const out = toJobResponse(row);
    expect(out.createdAt).toBe('2026-04-08T10:00:00.000Z');
    expect(out.startedAt).toBe('2026-04-08T10:00:05.000Z');
    expect(out.completedAt).toBeNull();
  });

  it('QUEUED → result and error are both null', () => {
    const out = toJobResponse(BASE);
    expect(out.status).toBe(JobStatus.QUEUED);
    expect(out.result).toBeNull();
    expect(out.error).toBeNull();
    expect(out.startedAt).toBeNull();
    expect(out.completedAt).toBeNull();
  });

  it('ACTIVE → startedAt set, result and error still null', () => {
    const row: NormalizeJob = {
      ...BASE,
      status: JobStatus.ACTIVE,
      startedAt: new Date('2026-04-08T10:00:05.000Z'),
    };
    const out = toJobResponse(row);
    expect(out.status).toBe(JobStatus.ACTIVE);
    expect(out.result).toBeNull();
    expect(out.error).toBeNull();
    expect(out.startedAt).not.toBeNull();
  });

  it('COMPLETED → result fully populated, error null', () => {
    const row: NormalizeJob = {
      ...BASE,
      status: JobStatus.COMPLETED,
      startedAt: new Date('2026-04-08T10:00:05.000Z'),
      completedAt: new Date('2026-04-08T10:03:00.000Z'),
      ocsf: { class_uid: 2004 },
      confidence: 0.92,
      decision: 'accept',
      breakdown: { schema: 1.0 },
      validationErrors: [],
      processingTimeMs: 175_000,
    };
    const out = toJobResponse(row);
    expect(out.status).toBe(JobStatus.COMPLETED);
    expect(out.error).toBeNull();
    expect(out.result).toEqual({
      ocsf: { class_uid: 2004 },
      confidence: 0.92,
      decision: 'accept',
      breakdown: { schema: 1.0 },
      validationErrors: [],
      processingTimeMs: 175_000,
    });
  });

  it('parentJobId is forwarded from the row when set', () => {
    const child: NormalizeJob = { ...BASE, parentJobId: 'parent-uuid' };
    const out = toJobResponse(child);
    expect(out.parentJobId).toBe('parent-uuid');
  });

  it('parentJobId is null when the row has no parent', () => {
    const out = toJobResponse(BASE);
    expect(out.parentJobId).toBeNull();
  });

  it('FAILED → error populated, result null', () => {
    const row: NormalizeJob = {
      ...BASE,
      status: JobStatus.FAILED,
      startedAt: new Date('2026-04-08T10:00:05.000Z'),
      completedAt: new Date('2026-04-08T10:00:30.000Z'),
      error: 'inference timeout',
    };
    const out = toJobResponse(row);
    expect(out.status).toBe(JobStatus.FAILED);
    expect(out.result).toBeNull();
    expect(out.error).toBe('inference timeout');
  });
});
