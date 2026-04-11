import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { JobStatus, NormalizeJob } from 'generated/prisma/client';
import { SLMResponse } from '../../src/common/interfaces/slm-response.interface';
import { JobsService } from '../../src/jobs/jobs.service';
import { RoutingService } from '../../src/routing/routing.service';
import { SLMService } from '../../src/slm/slm.service';
import { NormalizeProcessor } from '../../src/worker/normalize.processor';

const ROW: NormalizeJob = {
  id: 'a3f1c4e2-1234-4abc-9def-0123456789ab',
  status: JobStatus.ACTIVE,
  rawLog: { alert: 'x' },
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
  fixesApplied: null,
  hallucinationsStripped: null,
  attempts: 0,
  createdAt: new Date('2026-04-08T10:00:00.000Z'),
  updatedAt: new Date('2026-04-08T10:00:01.000Z'),
  startedAt: new Date('2026-04-08T10:00:01.000Z'),
  completedAt: null,
};

const SUCCESS_RESPONSE: SLMResponse = {
  ocsf: { class_uid: 2004 },
  confidence: 0.92,
  processing_time_ms: 175_000,
  decision: 'accept',
  breakdown: {
    schema_validity: 1,
    field_coverage: 0.95,
    value_consistency: 0.9,
  },
  validation_errors: [],
  error: null,
};

/**
 * Builds a fake BullMQ Job. Defaults to the FIRST attempt of a 3-attempt
 * job. Pass `attemptsMade` to simulate retries: 0=first try, 2=last try
 * (since attemptsMade is the count BEFORE this attempt runs, per BullMQ
 * semantics).
 */
function makeJob(
  jobId: string,
  attemptsMade = 0,
  attempts = 3,
): Job<{ jobId: string }> {
  return {
    id: jobId,
    data: { jobId },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<{ jobId: string }>;
}

describe('NormalizeProcessor', () => {
  let processor: NormalizeProcessor;
  let mockJobs: {
    markActive: jest.Mock;
    markCompleted: jest.Mock;
    markFailed: jest.Mock;
  };
  let mockSlm: { normalize: jest.Mock };
  let mockRouting: { route: jest.Mock };

  beforeEach(async () => {
    mockJobs = {
      markActive: jest.fn().mockResolvedValue(ROW),
      markCompleted: jest.fn().mockResolvedValue(ROW),
      markFailed: jest.fn().mockResolvedValue(ROW),
    };
    mockSlm = { normalize: jest.fn() };
    mockRouting = { route: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        NormalizeProcessor,
        { provide: JobsService, useValue: mockJobs },
        { provide: SLMService, useValue: mockSlm },
        { provide: RoutingService, useValue: mockRouting },
      ],
    }).compile();

    processor = module.get(NormalizeProcessor);
  });

  // ---- claim path --------------------------------------------------------------------------------------------------------------------

  it('loads the row using bullJob.data.jobId, not bullJob.id', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);
    const job = {
      id: 'bull-internal-id',
      data: { jobId: ROW.id },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job<{ jobId: string }>;

    await processor.process(job);

    expect(mockJobs.markActive).toHaveBeenCalledWith(ROW.id);
    expect(mockJobs.markActive).not.toHaveBeenCalledWith('bull-internal-id');
  });

  it('calls markActive before invoking the SLM', async () => {
    const order: string[] = [];
    mockJobs.markActive.mockImplementationOnce(async () => {
      order.push('markActive');
      return ROW;
    });
    mockSlm.normalize.mockImplementationOnce(async () => {
      order.push('slm');
      return SUCCESS_RESPONSE;
    });

    await processor.process(makeJob(ROW.id));

    expect(order).toEqual(['markActive', 'slm']);
  });

  // ---- happy path --------------------------------------------------------------------------------------------------------------------

  it('on SLM success calls routing.route then markCompleted with the mapped result', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);

    await processor.process(makeJob(ROW.id));

    expect(mockRouting.route).toHaveBeenCalledTimes(1);
    expect(mockRouting.route).toHaveBeenCalledWith(ROW, SUCCESS_RESPONSE);

    expect(mockJobs.markCompleted).toHaveBeenCalledTimes(1);
    expect(mockJobs.markCompleted).toHaveBeenCalledWith(ROW.id, {
      ocsf: SUCCESS_RESPONSE.ocsf,
      confidence: 0.92,
      decision: 'accept',
      breakdown: SUCCESS_RESPONSE.breakdown,
      validationErrors: [],
      processingTimeMs: 175_000,
      fixesApplied: [],
      hallucinationsStripped: [],
    });
    expect(mockJobs.markFailed).not.toHaveBeenCalled();
  });

  it('routing.route runs BEFORE markCompleted (so COMPLETED ⟹ children exist)', async () => {
    const order: string[] = [];
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);
    mockRouting.route.mockImplementationOnce(async () => {
      order.push('routing');
    });
    mockJobs.markCompleted.mockImplementationOnce(async () => {
      order.push('markCompleted');
      return ROW;
    });

    await processor.process(makeJob(ROW.id));

    expect(order).toEqual(['routing', 'markCompleted']);
  });

  it('passes the row.rawLog object straight through to SLMService (not stringified)', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);

    await processor.process(makeJob(ROW.id));

    expect(mockSlm.normalize).toHaveBeenCalledWith({
      raw_log: ROW.rawLog,
      source: ROW.source,
      format: ROW.format,
    });
  });

  // ---- retry semantics: transient failure (not the last attempt) ----------------------

  it('on SLM throw with retries remaining: throws to BullMQ, does NOT markFailed', async () => {
    mockSlm.normalize.mockRejectedValueOnce(new Error('circuit open'));

    await expect(processor.process(makeJob(ROW.id, 0, 3))).rejects.toThrow('circuit open');

    expect(mockJobs.markFailed).not.toHaveBeenCalled();
    expect(mockJobs.markCompleted).not.toHaveBeenCalled();
  });

  it('on SLM 200-with-error and retries remaining: throws, does NOT markFailed', async () => {
    mockSlm.normalize.mockResolvedValueOnce({
      ...SUCCESS_RESPONSE,
      ocsf: null,
      error: 'validation rejected all candidates',
    });

    await expect(processor.process(makeJob(ROW.id, 0, 3))).rejects.toThrow(
      'validation rejected all candidates',
    );

    expect(mockJobs.markFailed).not.toHaveBeenCalled();
  });

  it('on routing.route throwing with retries remaining: throws, does NOT markFailed', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);
    mockRouting.route.mockRejectedValueOnce(new Error('routing exploded'));

    await expect(processor.process(makeJob(ROW.id, 0, 3))).rejects.toThrow('routing exploded');

    expect(mockJobs.markFailed).not.toHaveBeenCalled();
    expect(mockJobs.markCompleted).not.toHaveBeenCalled();
  });

  // ---- retry semantics: final failure (last attempt) ----------------------------------------------

  it('on SLM throw on the FINAL attempt: markFailed with attempt count, then throws', async () => {
    mockSlm.normalize.mockRejectedValueOnce(new Error('circuit open'));

    // attemptsMade=2, attempts=3 → this run is attempt 3 of 3
    await expect(processor.process(makeJob(ROW.id, 2, 3))).rejects.toThrow('circuit open');

    expect(mockJobs.markFailed).toHaveBeenCalledTimes(1);
    const [calledId, calledError] = mockJobs.markFailed.mock.calls[0];
    expect(calledId).toBe(ROW.id);
    expect(calledError).toContain('circuit open');
    expect(calledError).toContain('attempt 3/3');
  });

  it('on SLM 200-with-error on the FINAL attempt: markFailed with attempt count', async () => {
    mockSlm.normalize.mockResolvedValueOnce({
      ...SUCCESS_RESPONSE,
      ocsf: null,
      error: 'validation rejected all candidates',
    });

    await expect(processor.process(makeJob(ROW.id, 2, 3))).rejects.toThrow(
      'validation rejected all candidates',
    );

    expect(mockJobs.markFailed).toHaveBeenCalledTimes(1);
    expect(mockJobs.markFailed.mock.calls[0][1]).toContain('attempt 3/3');
  });

  it('on routing throw on the FINAL attempt: markFailed with attempt count', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);
    mockRouting.route.mockRejectedValueOnce(new Error('routing exploded'));

    await expect(processor.process(makeJob(ROW.id, 2, 3))).rejects.toThrow('routing exploded');

    expect(mockJobs.markFailed).toHaveBeenCalledTimes(1);
    expect(mockJobs.markFailed.mock.calls[0][1]).toContain('attempt 3/3');
    expect(mockJobs.markCompleted).not.toHaveBeenCalled();
  });

  it('on ocsf=null with no error message, final attempt: markFailed with default message + count', async () => {
    mockSlm.normalize.mockResolvedValueOnce({
      ...SUCCESS_RESPONSE,
      ocsf: null,
      error: null,
    });

    await expect(processor.process(makeJob(ROW.id, 2, 3))).rejects.toThrow();

    expect(mockJobs.markFailed).toHaveBeenCalledTimes(1);
    expect(mockJobs.markFailed.mock.calls[0][1]).toMatch(/no OCSF/i);
    expect(mockJobs.markFailed.mock.calls[0][1]).toContain('attempt 3/3');
  });

  // ---- non-actionable claim path --------------------------------------------------------------------------------------

  it('logs and returns when markActive throws (row missing or terminal)', async () => {
    mockJobs.markActive.mockRejectedValueOnce(
      new Error('markActive: job xxx not found or in terminal state'),
    );

    await expect(processor.process(makeJob(ROW.id))).resolves.toBeUndefined();

    expect(mockSlm.normalize).not.toHaveBeenCalled();
    expect(mockJobs.markCompleted).not.toHaveBeenCalled();
    expect(mockJobs.markFailed).not.toHaveBeenCalled();
  });

  // ---- DB write race recovery — final attempt ------------------------------------------------------------

  it('does not crash when markCompleted itself rejects (sweep race)', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);
    mockJobs.markCompleted.mockRejectedValueOnce(new Error('row not ACTIVE'));

    await expect(processor.process(makeJob(ROW.id))).resolves.toBeUndefined();
  });

  it('does not crash when markFailed itself rejects on the final attempt', async () => {
    // Final attempt SLM throw + markFailed itself rejects.
    // The processor should still throw the original SLM error to BullMQ
    // (it wraps in handleFailure but then the call site re-throws).
    mockSlm.normalize.mockRejectedValueOnce(new Error('boom'));
    mockJobs.markFailed.mockRejectedValueOnce(new Error('db gone'));

    await expect(processor.process(makeJob(ROW.id, 2, 3))).rejects.toThrow('boom');
  });
});

describe('NormalizeProcessor.isSlmFailure', () => {
  it('returns false for a fully populated success response', () => {
    expect(NormalizeProcessor.isSlmFailure(SUCCESS_RESPONSE)).toBe(false);
  });

  it('returns true when ocsf is null', () => {
    expect(
      NormalizeProcessor.isSlmFailure({ ...SUCCESS_RESPONSE, ocsf: null }),
    ).toBe(true);
  });

  it('returns true when error is set', () => {
    expect(
      NormalizeProcessor.isSlmFailure({ ...SUCCESS_RESPONSE, error: 'x' }),
    ).toBe(true);
  });
});

describe('NormalizeProcessor passes post-process audit trail', () => {
  let processor: NormalizeProcessor;
  let mockJobs: { markActive: jest.Mock; markCompleted: jest.Mock; markFailed: jest.Mock };
  let mockSlm: { normalize: jest.Mock };
  let mockRouting: { route: jest.Mock };

  beforeEach(async () => {
    mockJobs = {
      markActive: jest.fn().mockResolvedValue(ROW),
      markCompleted: jest.fn().mockResolvedValue(ROW),
      markFailed: jest.fn().mockResolvedValue(ROW),
    };
    mockSlm = { normalize: jest.fn() };
    mockRouting = { route: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        NormalizeProcessor,
        { provide: JobsService, useValue: mockJobs },
        { provide: SLMService, useValue: mockSlm },
        { provide: RoutingService, useValue: mockRouting },
      ],
    }).compile();

    processor = module.get(NormalizeProcessor);
  });

  it('forwards fixes_applied and hallucinations_stripped from SLM to markCompleted', async () => {
    mockSlm.normalize.mockResolvedValueOnce({
      ...SUCCESS_RESPONSE,
      fixes_applied: ['moved finding_info.severity_id to root', 'forced metadata.version to 1.7.0'],
      hallucinations_stripped: ['stripped hallucinated device.hostname (looks like email): x@y.z'],
    });

    await processor.process(makeJob(ROW.id));

    const arg = mockJobs.markCompleted.mock.calls[0][1];
    expect(arg.fixesApplied).toEqual([
      'moved finding_info.severity_id to root',
      'forced metadata.version to 1.7.0',
    ]);
    expect(arg.hallucinationsStripped).toEqual([
      'stripped hallucinated device.hostname (looks like email): x@y.z',
    ]);
  });

  it('defaults to empty arrays when SLM omits the post-process fields', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);

    await processor.process(makeJob(ROW.id));

    const arg = mockJobs.markCompleted.mock.calls[0][1];
    expect(arg.fixesApplied).toEqual([]);
    expect(arg.hallucinationsStripped).toEqual([]);
  });
});

describe('NormalizeProcessor.toCompleteDto', () => {
  it('coerces null breakdown to empty object', () => {
    const dto = NormalizeProcessor.toCompleteDto({
      ...SUCCESS_RESPONSE,
      breakdown: null,
    });
    expect(dto.breakdown).toEqual({});
  });

  it('coerces null validation_errors to empty array', () => {
    const dto = NormalizeProcessor.toCompleteDto({
      ...SUCCESS_RESPONSE,
      validation_errors: null,
    });
    expect(dto.validationErrors).toEqual([]);
  });
});
