import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { JobStatus, NormalizeJob } from 'generated/prisma/client';
import { SLMResponse } from '../../src/common/interfaces/slm-response.interface';
import { JobsService } from '../../src/jobs/jobs.service';
import { SLMService } from '../../src/slm/slm.service';
import { NormalizeProcessor } from '../../src/worker/normalize.processor';

const ROW: NormalizeJob = {
  id: 'a3f1c4e2-1234-4abc-9def-0123456789ab',
  status: JobStatus.ACTIVE,
  rawLog: '{"alert":"x"}',
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

function makeJob(jobId: string): Job<{ jobId: string }> {
  return { id: jobId, data: { jobId } } as unknown as Job<{ jobId: string }>;
}

describe('NormalizeProcessor', () => {
  let processor: NormalizeProcessor;
  let mockJobs: {
    markActive: jest.Mock;
    markCompleted: jest.Mock;
    markFailed: jest.Mock;
  };
  let mockSlm: { normalize: jest.Mock };

  beforeEach(async () => {
    mockJobs = {
      markActive: jest.fn().mockResolvedValue(ROW),
      markCompleted: jest.fn().mockResolvedValue(ROW),
      markFailed: jest.fn().mockResolvedValue(ROW),
    };
    mockSlm = { normalize: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        NormalizeProcessor,
        { provide: JobsService, useValue: mockJobs },
        { provide: SLMService, useValue: mockSlm },
      ],
    }).compile();

    processor = module.get(NormalizeProcessor);
  });

  // ── 1. lookup uses bullJob.data.jobId, not bullJob.id ───────────────────

  it('loads the row using bullJob.data.jobId', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);
    const job = { id: 'bull-internal-id', data: { jobId: ROW.id } } as unknown as Job<{ jobId: string }>;

    await processor.process(job);

    expect(mockJobs.markActive).toHaveBeenCalledWith(ROW.id);
    expect(mockJobs.markActive).not.toHaveBeenCalledWith('bull-internal-id');
  });

  // ── 2. markActive is called BEFORE the SLM call ─────────────────────────

  it('calls markActive before invoking the SLM (race-window mitigation)', async () => {
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

  // ── 3. happy path → markCompleted with mapped payload ───────────────────

  it('on SLM success calls markCompleted with the mapped result', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);

    await processor.process(makeJob(ROW.id));

    expect(mockJobs.markCompleted).toHaveBeenCalledTimes(1);
    expect(mockJobs.markCompleted).toHaveBeenCalledWith(ROW.id, {
      ocsf: SUCCESS_RESPONSE.ocsf,
      confidence: 0.92,
      decision: 'accept',
      breakdown: SUCCESS_RESPONSE.breakdown,
      validationErrors: [],
      processingTimeMs: 175_000,
    });
    expect(mockJobs.markFailed).not.toHaveBeenCalled();
  });

  // ── 4. SLM throws → markFailed, no partial result ───────────────────────

  it('on SLM throw calls markFailed with the error message and never markCompleted', async () => {
    mockSlm.normalize.mockRejectedValueOnce(new Error('circuit open'));

    await processor.process(makeJob(ROW.id));

    expect(mockJobs.markFailed).toHaveBeenCalledWith(ROW.id, 'circuit open');
    expect(mockJobs.markCompleted).not.toHaveBeenCalled();
  });

  // ── SLM returns 200 with error populated → treat as failure ─────────────

  it('treats a 200 response with error populated as a failure', async () => {
    mockSlm.normalize.mockResolvedValueOnce({
      ...SUCCESS_RESPONSE,
      ocsf: null,
      error: 'validation rejected all candidates',
    });

    await processor.process(makeJob(ROW.id));

    expect(mockJobs.markFailed).toHaveBeenCalledWith(
      ROW.id,
      'validation rejected all candidates',
    );
    expect(mockJobs.markCompleted).not.toHaveBeenCalled();
  });

  it('treats ocsf=null with no error message as a failure with a default message', async () => {
    mockSlm.normalize.mockResolvedValueOnce({
      ...SUCCESS_RESPONSE,
      ocsf: null,
      error: null,
    });

    await processor.process(makeJob(ROW.id));

    expect(mockJobs.markFailed).toHaveBeenCalledTimes(1);
    expect(mockJobs.markFailed.mock.calls[0][0]).toBe(ROW.id);
    expect(mockJobs.markFailed.mock.calls[0][1]).toMatch(/no OCSF/i);
  });

  // ── 5. row not found / not in QUEUED → log + ack, do not crash ──────────

  it('logs and returns when markActive throws (row missing or not QUEUED)', async () => {
    mockJobs.markActive.mockRejectedValueOnce(
      new Error('markActive: job xxx not found or not in QUEUED state'),
    );

    await expect(processor.process(makeJob(ROW.id))).resolves.toBeUndefined();

    expect(mockSlm.normalize).not.toHaveBeenCalled();
    expect(mockJobs.markCompleted).not.toHaveBeenCalled();
    expect(mockJobs.markFailed).not.toHaveBeenCalled();
  });

  // ── markCompleted/markFailed throwing must not crash the worker ─────────

  it('does not throw when markCompleted itself rejects', async () => {
    mockSlm.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE);
    mockJobs.markCompleted.mockRejectedValueOnce(new Error('row not ACTIVE'));

    await expect(processor.process(makeJob(ROW.id))).resolves.toBeUndefined();
  });

  it('does not throw when markFailed itself rejects after an SLM error', async () => {
    mockSlm.normalize.mockRejectedValueOnce(new Error('boom'));
    mockJobs.markFailed.mockRejectedValueOnce(new Error('db gone'));

    await expect(processor.process(makeJob(ROW.id))).resolves.toBeUndefined();
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
