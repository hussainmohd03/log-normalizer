// src/normalize/normalize.controller.spec.ts
import { Test } from '@nestjs/testing';
import { JobStatus } from 'generated/prisma/client';
import { NormalizeController } from '../../src/normalize/normalize.controller';
import { NormalizeService } from '../../src/normalize/normalize.service';

const STUB_JOB = {
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

describe('NormalizeController', () => {
  let controller: NormalizeController;
  let mockService: { create: jest.Mock };

  beforeEach(async () => {
    mockService = { create: jest.fn().mockResolvedValue(STUB_JOB) };

    const module = await Test.createTestingModule({
      controllers: [NormalizeController],
      providers: [{ provide: NormalizeService, useValue: mockService }],
    })
      .overrideGuard(require('src/common/guards/api-key.guard').ApiGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(NormalizeController);
  });

  it('returns { jobId, status: "queued" }', async () => {
    const dto = { rawLog: '{}', source: 'crowdstrike', format: 'json' };
    const result = await controller.enqueue(dto);

    expect(result).toEqual({ jobId: STUB_JOB.id, status: 'queued' });
  });

  it('passes the DTO straight through to NormalizeService.create', async () => {
    const dto = { rawLog: '{"alert":1}', source: 'splunk', format: 'json' };
    await controller.enqueue(dto);

    expect(mockService.create).toHaveBeenCalledWith(dto);
  });

  it('propagates errors from NormalizeService', async () => {
    mockService.create.mockRejectedValueOnce(new Error('enqueue failed'));
    const dto = { rawLog: '{}', source: 'crowdstrike', format: 'json' };

    await expect(controller.enqueue(dto)).rejects.toThrow('enqueue failed');
  });
});
