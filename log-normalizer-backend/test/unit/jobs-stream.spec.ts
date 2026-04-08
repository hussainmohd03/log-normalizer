import { MessageEvent, NotFoundException } from '@nestjs/common';
import { JobStatus, NormalizeJob } from 'generated/prisma/client';
import { Subject, firstValueFrom, lastValueFrom, toArray } from 'rxjs';
import { JobResponse } from '../../src/jobs/dto/job-response.dto';
import { JobEvent, createJobStream } from '../../src/jobs/jobs-stream';

const JOB_ID = 'a3f1c4e2-1234-4abc-9def-0123456789ab';
const OTHER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function row(overrides: Partial<NormalizeJob> = {}): NormalizeJob {
  return {
    id: JOB_ID,
    status: JobStatus.QUEUED,
    rawLog: '{}',
    source: 'crowdstrike',
    format: 'json',
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
    ...overrides,
  };
}

function dataOf(event: MessageEvent): JobResponse {
  return event.data as JobResponse;
}

describe('createJobStream', () => {
  let events$: Subject<JobEvent>;

  beforeEach(() => {
    events$ = new Subject<JobEvent>();
  });

  // ── 1. late connect: row already terminal at connect time ───────────────

  it('emits the terminal state once and completes immediately when row is already COMPLETED', async () => {
    const completed = row({
      status: JobStatus.COMPLETED,
      ocsf: { class_uid: 2004 },
      confidence: 0.9,
      decision: 'accept',
      breakdown: {},
      validationErrors: [],
      processingTimeMs: 1000,
      startedAt: new Date('2026-04-08T10:00:01.000Z'),
      completedAt: new Date('2026-04-08T10:00:02.000Z'),
    });
    const getRow = jest.fn().mockResolvedValue(completed);

    const out = await lastValueFrom(
      createJobStream(JOB_ID, events$, getRow).pipe(toArray()),
    );

    expect(out).toHaveLength(1);
    expect(dataOf(out[0]).status).toBe(JobStatus.COMPLETED);
    expect(getRow).toHaveBeenCalledTimes(1);
  });

  // ── 2. happy path: QUEUED → ACTIVE → COMPLETED, three emissions, then close

  it('emits initial state, then re-reads on each event, then completes on terminal', async () => {
    const states = [
      row({ status: JobStatus.QUEUED }),
      row({
        status: JobStatus.ACTIVE,
        startedAt: new Date('2026-04-08T10:00:01.000Z'),
      }),
      row({
        status: JobStatus.COMPLETED,
        ocsf: { ok: true },
        confidence: 0.91,
        decision: 'accept',
        breakdown: {},
        validationErrors: [],
        processingTimeMs: 1234,
        startedAt: new Date('2026-04-08T10:00:01.000Z'),
        completedAt: new Date('2026-04-08T10:00:03.000Z'),
      }),
    ];
    const getRow = jest.fn().mockImplementation(async () => states.shift()!);

    const collected = lastValueFrom(
      createJobStream(JOB_ID, events$, async (id) => getRow(id)).pipe(
        toArray(),
      ),
    );

    // Defer the events until after the initial subscription is set up.
    await new Promise((r) => setImmediate(r));
    events$.next({ jobId: JOB_ID, kind: 'active' });
    await new Promise((r) => setImmediate(r));
    events$.next({ jobId: JOB_ID, kind: 'completed' });

    const out = await collected;
    const statuses = out.map((e) => dataOf(e).status);
    expect(statuses).toEqual([
      JobStatus.QUEUED,
      JobStatus.ACTIVE,
      JobStatus.COMPLETED,
    ]);
  });

  // ── 3. terminates on FAILED ────────────────────────────────────────────

  it('completes the stream after a FAILED event', async () => {
    const states = [
      row({ status: JobStatus.QUEUED }),
      row({
        status: JobStatus.FAILED,
        error: 'inference timeout',
        startedAt: new Date('2026-04-08T10:00:01.000Z'),
        completedAt: new Date('2026-04-08T10:00:02.000Z'),
      }),
    ];
    const getRow = jest.fn().mockImplementation(async () => states.shift()!);

    const collected = lastValueFrom(
      createJobStream(JOB_ID, events$, async (id) => getRow(id)).pipe(
        toArray(),
      ),
    );

    await new Promise((r) => setImmediate(r));
    events$.next({ jobId: JOB_ID, kind: 'failed' });

    const out = await collected;
    expect(out.map((e) => dataOf(e).status)).toEqual([
      JobStatus.QUEUED,
      JobStatus.FAILED,
    ]);
    expect(dataOf(out[1]).error).toBe('inference timeout');
  });

  // ── 4. ignores events for other jobIds ─────────────────────────────────

  it('does not re-read or emit when an event for a different jobId arrives', async () => {
    const initial = row({ status: JobStatus.QUEUED });
    const getRow = jest.fn().mockResolvedValue(initial);

    const stream = createJobStream(JOB_ID, events$, getRow);
    const sub = stream.subscribe();

    await new Promise((r) => setImmediate(r));
    expect(getRow).toHaveBeenCalledTimes(1); // initial read only

    events$.next({ jobId: OTHER_ID, kind: 'active' });
    await new Promise((r) => setImmediate(r));
    expect(getRow).toHaveBeenCalledTimes(1); // still 1 — event was filtered out

    sub.unsubscribe();
  });

  // ── 5. row missing at connect → NotFoundException ──────────────────────

  it('throws NotFoundException when the row does not exist at connect time', async () => {
    const getRow = jest.fn().mockResolvedValue(null);

    await expect(
      firstValueFrom(createJobStream(JOB_ID, events$, getRow)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── 6. row deleted between event and re-read → silently dropped ────────

  it('drops null re-reads silently instead of crashing the stream', async () => {
    const reads = [
      row({ status: JobStatus.QUEUED }), // initial
      null, // race: row deleted between event and read
      row({
        status: JobStatus.COMPLETED,
        ocsf: {},
        confidence: 0.5,
        decision: 'accept',
        breakdown: {},
        validationErrors: [],
        processingTimeMs: 100,
        startedAt: new Date(),
        completedAt: new Date(),
      }),
    ];
    const getRow = jest.fn().mockImplementation(async () => reads.shift()!);

    const collected = lastValueFrom(
      createJobStream(JOB_ID, events$, async (id) => getRow(id)).pipe(
        toArray(),
      ),
    );

    await new Promise((r) => setImmediate(r));
    events$.next({ jobId: JOB_ID, kind: 'active' }); // → null (dropped)
    await new Promise((r) => setImmediate(r));
    events$.next({ jobId: JOB_ID, kind: 'completed' }); // → COMPLETED

    const out = await collected;
    expect(out.map((e) => dataOf(e).status)).toEqual([
      JobStatus.QUEUED,
      JobStatus.COMPLETED,
    ]);
  });

  // ── 7. unsubscribe tears down without invoking getRow further ──────────

  it('stops re-reading after the subscriber unsubscribes', async () => {
    const initial = row({ status: JobStatus.QUEUED });
    const getRow = jest.fn().mockResolvedValue(initial);

    const sub = createJobStream(JOB_ID, events$, getRow).subscribe();
    await new Promise((r) => setImmediate(r));

    sub.unsubscribe();
    events$.next({ jobId: JOB_ID, kind: 'active' });
    await new Promise((r) => setImmediate(r));

    expect(getRow).toHaveBeenCalledTimes(1); // never re-read after unsubscribe
  });
});
