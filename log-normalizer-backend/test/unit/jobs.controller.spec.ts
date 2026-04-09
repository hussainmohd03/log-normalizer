import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JobStatus, NormalizeJob } from 'generated/prisma/client';
import { ApiGuard } from '../../src/common/guards/api-key.guard';
import { JobRetryService } from '../../src/jobs/job-retry.service';
import { JobsEventsService } from '../../src/jobs/jobs-events.service';
import { JobsController } from '../../src/jobs/jobs.controller';
import { JobsService } from '../../src/jobs/jobs.service';

const ROW: NormalizeJob = {
  id: 'a3f1c4e2-1234-4abc-9def-0123456789ab',
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

describe('JobsController', () => {
  let controller: JobsController;
  let mockJobs: { findById: jest.Mock };
  let mockRetry: { retry: jest.Mock };

  beforeEach(async () => {
    mockJobs = { findById: jest.fn() };
    const mockEvents = { streamJob: jest.fn() };
    mockRetry = { retry: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        { provide: JobsService, useValue: mockJobs },
        { provide: JobsEventsService, useValue: mockEvents },
        { provide: JobRetryService, useValue: mockRetry },
      ],
    })
      .overrideGuard(ApiGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(JobsController);
  });

  it('returns the mapped envelope when the row exists', async () => {
    mockJobs.findById.mockResolvedValueOnce(ROW);

    const result = await controller.findOne(ROW.id);

    expect(mockJobs.findById).toHaveBeenCalledTimes(1);
    expect(mockJobs.findById).toHaveBeenCalledWith(ROW.id);
    expect(result.jobId).toBe(ROW.id);
    expect(result.status).toBe(JobStatus.QUEUED);
    // mapper invariants — controller must not leak input back
    expect((result as unknown as Record<string, unknown>).rawLog).toBeUndefined();
  });

  it('throws NotFoundException when the row is missing', async () => {
    mockJobs.findById.mockResolvedValueOnce(null);

    await expect(
      controller.findOne('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates unexpected errors from JobsService', async () => {
    mockJobs.findById.mockRejectedValueOnce(new Error('db down'));

    await expect(controller.findOne(ROW.id)).rejects.toThrow('db down');
  });

  // ── retry endpoint ──────────────────────────────────────────────────────

  describe('POST :id/retry', () => {
    it('returns { jobId, status, parentJobId } from JobRetryService.retry', async () => {
      const child: NormalizeJob = {
        ...ROW,
        id: 'child-uuid',
        parentJobId: ROW.id,
      };
      mockRetry.retry.mockResolvedValueOnce(child);

      const result = await controller.retry(ROW.id);

      expect(mockRetry.retry).toHaveBeenCalledWith(ROW.id);
      expect(result).toEqual({
        jobId: 'child-uuid',
        status: 'queued',
        parentJobId: ROW.id,
      });
    });

    it('propagates NotFoundException from the service', async () => {
      mockRetry.retry.mockRejectedValueOnce(new NotFoundException('Job xxx not found'));
      await expect(controller.retry(ROW.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates ConflictException from the service', async () => {
      mockRetry.retry.mockRejectedValueOnce(new ConflictException('job is still running'));
      await expect(controller.retry(ROW.id)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
