// src/normalize/normalize.service.spec.ts
import { Test } from '@nestjs/testing';
import { JobStatus } from 'generated/prisma/client';
import { JobsService } from 'src/jobs/jobs.service';
import { NormalizeProducer } from 'src/queue/normalize.producer';
import { NormalizeService } from '../../src/normalize/normalize.service';

const STUB_ROW = {
  id: 'job-uuid-1',
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
  createdAt: new Date(),
  updatedAt: new Date(),
  startedAt: null,
  completedAt: null,
};

const DTO = { rawLog: '{}', source: 'crowdstrike', format: 'json' };

describe('NormalizeService', () => {
  let service: NormalizeService;
  let mockJobs: { create: jest.Mock; deleteQuietly: jest.Mock };
  let mockProducer: { enqueue: jest.Mock };

  beforeEach(async () => {
    mockJobs = {
      create: jest.fn().mockResolvedValue(STUB_ROW),
      deleteQuietly: jest.fn().mockResolvedValue(undefined),
    };
    mockProducer = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        NormalizeService,
        { provide: JobsService, useValue: mockJobs },
        { provide: NormalizeProducer, useValue: mockProducer },
      ],
    }).compile();

    service = module.get(NormalizeService);
  });

  // ── Test 1: happy path ────────────────────────────────────────────────────

  it('inserts the row, enqueues, and returns the row with status QUEUED', async () => {
    const result = await service.create(DTO);

    expect(mockJobs.create).toHaveBeenCalledWith(DTO);
    expect(mockProducer.enqueue).toHaveBeenCalledWith(STUB_ROW.id);
    expect(result.id).toBe(STUB_ROW.id);
    expect(result.status).toBe(JobStatus.QUEUED);
  });

  // ── Test 2: enqueue throws, cleanup succeeds ──────────────────────────────

  it('propagates the enqueue error and deletes the orphan row when enqueue fails', async () => {
    const enqueueError = new Error('Redis connection refused');
    mockProducer.enqueue.mockRejectedValueOnce(enqueueError);

    await expect(service.create(DTO)).rejects.toThrow('Redis connection refused');

    expect(mockJobs.deleteQuietly).toHaveBeenCalledWith(STUB_ROW.id);
  });

  // ── Test 3: enqueue throws, cleanup also throws ───────────────────────────
  // deleteQuietly is documented to never throw, but if it ever violates that
  // contract the original enqueue error must still propagate — not the
  // cleanup error.

  it('still propagates the original enqueue error even if deleteQuietly throws', async () => {
    const enqueueError = new Error('Redis connection refused');
    mockProducer.enqueue.mockRejectedValueOnce(enqueueError);
    mockJobs.deleteQuietly.mockRejectedValueOnce(new Error('DB gone'));

    await expect(service.create(DTO)).rejects.toThrow('Redis connection refused');
  });

  // ── Test 4: concurrent creates ───────────────────────────────────────────

  it('concurrent creates with the same payload each call enqueue with their own row id', async () => {
    const rowA = { ...STUB_ROW, id: 'uuid-a' };
    const rowB = { ...STUB_ROW, id: 'uuid-b' };
    mockJobs.create
      .mockResolvedValueOnce(rowA)
      .mockResolvedValueOnce(rowB);

    const [a, b] = await Promise.all([
      service.create(DTO),
      service.create(DTO),
    ]);

    expect(a.id).toBe('uuid-a');
    expect(b.id).toBe('uuid-b');
    expect(mockProducer.enqueue).toHaveBeenCalledWith('uuid-a');
    expect(mockProducer.enqueue).toHaveBeenCalledWith('uuid-b');
    expect(mockProducer.enqueue).toHaveBeenCalledTimes(2);
  });

  // ── deleteQuietly is not called on success ───────────────────────────────

  it('does not call deleteQuietly on the happy path', async () => {
    await service.create(DTO);
    expect(mockJobs.deleteQuietly).not.toHaveBeenCalled();
  });
});
