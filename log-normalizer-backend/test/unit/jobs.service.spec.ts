// src/jobs/jobs.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JobStatus } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { cleanDatabase } from 'test/helper/prisma-test';
import { CompleteNormalizeJobDto } from '../../src/jobs/dto/complete-normalize-job.dto';
import { CreateNormalizeJobDto } from '../../src/jobs/dto/create-normalize-job.dto';
import { JobsService } from '../../src/jobs/jobs.service';

const SAMPLE_DTO: CreateNormalizeJobDto = {
  rawLog: '{"alert_id":"test-1","severity":"high"}',
  source: 'crowdstrike',
  format: 'json',
};

const SAMPLE_RESULT: CompleteNormalizeJobDto = {
  ocsf: { class_uid: 2004, type_uid: 200401 },
  confidence: 0.91,
  decision: 'ACCEPT',
  breakdown: { field_coverage: 0.95 },
  validationErrors: [],
  processingTimeMs: 3200,
  fixesApplied: [],
  hallucinationsStripped: [],
};

describe('JobsService', () => {
  let service: JobsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [JobsService, PrismaService],
    }).compile();

    service = module.get(JobsService);
    prisma = module.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -- create ----------------------------------------------------------------

  describe('create', () => {
    it('inserts a row with status QUEUED and returns it', async () => {
      const job = await service.create(SAMPLE_DTO);

      expect(job.id).toBeDefined();
      expect(job.status).toBe(JobStatus.QUEUED);
      expect(job.rawLog).toBe(SAMPLE_DTO.rawLog);
      expect(job.source).toBe(SAMPLE_DTO.source);
      expect(job.format).toBe(SAMPLE_DTO.format);
      expect(job.ocsf).toBeNull();
      expect(job.startedAt).toBeNull();
      expect(job.completedAt).toBeNull();
    });

    it('persists the row to the database', async () => {
      const job = await service.create(SAMPLE_DTO);

      const stored = await prisma.normalizeJob.findUnique({
        where: { id: job.id },
      });
      expect(stored).not.toBeNull();
      expect(stored!.status).toBe(JobStatus.QUEUED);
    });

    it('concurrent creates with the same payload each get a distinct id', async () => {
      const [a, b] = await Promise.all([
        service.create(SAMPLE_DTO),
        service.create(SAMPLE_DTO),
      ]);

      expect(a.id).not.toBe(b.id);

      const count = await prisma.normalizeJob.count();
      expect(count).toBe(2);
    });
  });

  // ---- findById ----------------------------------------------------------------

  describe('findById', () => {
    it('returns the row when it exists', async () => {
      const job = await service.create(SAMPLE_DTO);

      const found = await service.findById(job.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(job.id);
    });

    it('returns null when the id does not exist', async () => {
      const found = await service.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  // ---- markActive --------------------------------------------------------------

  describe('markActive', () => {
    it('transitions QUEUED → ACTIVE, sets startedAt, sets attempts to 1', async () => {
      const before = new Date();
      const job = await service.create(SAMPLE_DTO);

      const updated = await service.markActive(job.id);

      expect(updated.status).toBe(JobStatus.ACTIVE);
      expect(updated.startedAt).not.toBeNull();
      expect(updated.startedAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(updated.attempts).toBe(1);
    });

    it('persists ACTIVE status to the database', async () => {
      const job = await service.create(SAMPLE_DTO);
      await service.markActive(job.id);

      const stored = await prisma.normalizeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(stored.status).toBe(JobStatus.ACTIVE);
      expect(stored.startedAt).not.toBeNull();
    });

    it('is idempotent across retries: ACTIVE → ACTIVE bumps attempts and startedAt', async () => {
      const job = await service.create(SAMPLE_DTO);
      const first = await service.markActive(job.id);
      expect(first.attempts).toBe(1);

      // Wait a tick so startedAt actually advances
      await new Promise((r) => setTimeout(r, 5));

      const second = await service.markActive(job.id);
      expect(second.status).toBe(JobStatus.ACTIVE);
      expect(second.attempts).toBe(2);
      expect(second.startedAt!.getTime()).toBeGreaterThan(first.startedAt!.getTime());
    });

    it('throws when the job id does not exist', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await expect(service.markActive(id)).rejects.toThrow(
        `markActive: job ${id} not found or in terminal state`,
      );
    });

    it('throws when the job is in a terminal state (COMPLETED)', async () => {
      const job = await service.create(SAMPLE_DTO);
      await service.markActive(job.id);
      await service.markCompleted(job.id, SAMPLE_RESULT);

      await expect(service.markActive(job.id)).rejects.toThrow(
        `markActive: job ${job.id} not found or in terminal state`,
      );
    });
  });

  // ---- markCompleted ----------------------------------------------------------

  describe('markCompleted', () => {
    it('transitions ACTIVE → COMPLETED and writes the result payload', async () => {
      const before = new Date();
      const job = await service.create(SAMPLE_DTO);
      await service.markActive(job.id);

      const updated = await service.markCompleted(job.id, SAMPLE_RESULT);

      expect(updated.status).toBe(JobStatus.COMPLETED);
      expect(updated.completedAt).not.toBeNull();
      expect(updated.completedAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(updated.confidence).toBe(SAMPLE_RESULT.confidence);
      expect(updated.decision).toBe(SAMPLE_RESULT.decision);
      expect(updated.processingTimeMs).toBe(SAMPLE_RESULT.processingTimeMs);
      expect(updated.validationErrors).toEqual([]);
      expect(updated.ocsf).toEqual(SAMPLE_RESULT.ocsf);
    });

    it('persists COMPLETED status and result to the database', async () => {
      const job = await service.create(SAMPLE_DTO);
      await service.markActive(job.id);
      await service.markCompleted(job.id, SAMPLE_RESULT);

      const stored = await prisma.normalizeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(stored.status).toBe(JobStatus.COMPLETED);
      expect(stored.confidence).toBe(SAMPLE_RESULT.confidence);
    });

    it('stores validationErrors when present', async () => {
      const job = await service.create(SAMPLE_DTO);
      await service.markActive(job.id);

      const resultWithErrors: CompleteNormalizeJobDto = {
        ...SAMPLE_RESULT,
        validationErrors: { missing_fields: ['activity_id'] },
      };
      const updated = await service.markCompleted(job.id, resultWithErrors);

      expect(updated.validationErrors).toEqual(
        resultWithErrors.validationErrors,
      );
    });

    it('throws when the job is not in ACTIVE state', async () => {
      const job = await service.create(SAMPLE_DTO);

      await expect(
        service.markCompleted(job.id, SAMPLE_RESULT),
      ).rejects.toThrow(
        `markCompleted: job ${job.id} not found or not in ACTIVE state`,
      );
    });

    it('throws when the job id does not exist', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await expect(
        service.markCompleted(id, SAMPLE_RESULT),
      ).rejects.toThrow(
        `markCompleted: job ${id} not found or not in ACTIVE state`,
      );
    });
  });

  // ---- markFailed --------------------------------------------------------------

  describe('markFailed', () => {
    it('transitions ACTIVE → FAILED and stores the error message', async () => {
      const before = new Date();
      const job = await service.create(SAMPLE_DTO);
      await service.markActive(job.id);

      const updated = await service.markFailed(job.id, 'SLM timeout');

      expect(updated.status).toBe(JobStatus.FAILED);
      expect(updated.error).toBe('SLM timeout');
      expect(updated.completedAt).not.toBeNull();
      expect(updated.completedAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(updated.ocsf).toBeNull();
    });

    it('persists FAILED status to the database', async () => {
      const job = await service.create(SAMPLE_DTO);
      await service.markActive(job.id);
      await service.markFailed(job.id, 'SLM timeout');

      const stored = await prisma.normalizeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(stored.status).toBe(JobStatus.FAILED);
      expect(stored.error).toBe('SLM timeout');
    });

    it('throws when the job is not in ACTIVE state', async () => {
      const job = await service.create(SAMPLE_DTO);

      await expect(service.markFailed(job.id, 'any error')).rejects.toThrow(
        `markFailed: job ${job.id} not found or not in ACTIVE state`,
      );
    });

    it('throws when the job id does not exist', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await expect(service.markFailed(id, 'any error')).rejects.toThrow(
        `markFailed: job ${id} not found or not in ACTIVE state`,
      );
    });
  });

  // ---- deleteQuietly ----------------------------------------------------------

  describe('deleteQuietly', () => {
    it('removes a QUEUED row from the database', async () => {
      const job = await service.create(SAMPLE_DTO);

      await service.deleteQuietly(job.id);

      const stored = await prisma.normalizeJob.findUnique({
        where: { id: job.id },
      });
      expect(stored).toBeNull();
    });

    it('does not throw when the row does not exist', async () => {
      await expect(
        service.deleteQuietly('00000000-0000-0000-0000-000000000000'),
      ).resolves.toBeUndefined();
    });

    it('always returns void (never throws)', async () => {
      const job = await service.create(SAMPLE_DTO);
      // Delete once cleanly, then call again on the now-missing row
      await service.deleteQuietly(job.id);

      await expect(service.deleteQuietly(job.id)).resolves.toBeUndefined();
    });
  });
});
