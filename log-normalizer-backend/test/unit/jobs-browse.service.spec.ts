import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/database/prisma.service';
import { JobsService } from 'src/jobs/jobs.service';
import { cleanDatabase } from 'test/helper/prisma-test';
import { buildNormalizeJob } from 'test/factories';

describe('JobsService.list', () => {
  let service: JobsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [PrismaService, JobsService],
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

  it('empty DB returns empty array and total 0', async () => {
    const result = await service.list({});
    expect(result.jobs).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('filter by status returns only matching rows', async () => {
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'COMPLETED' }) });
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'FAILED' }) });
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'QUEUED' }) });

    const result = await service.list({ status: ['COMPLETED'] });
    expect(result.jobs).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.jobs[0].status).toBe('COMPLETED');
  });

  it('filter by decision returns only matching rows', async () => {
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'COMPLETED', decision: 'accept' }) });
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'COMPLETED', decision: 'review' }) });
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'COMPLETED', decision: 'reject' }) });

    const result = await service.list({ decision: ['accept', 'reject'] });
    expect(result.jobs).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('filter by source AND status combine correctly (AND, not OR)', async () => {
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ source: 'splunk', status: 'COMPLETED' }) });
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ source: 'splunk', status: 'FAILED' }) });
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ source: 'crowdstrike', status: 'COMPLETED' }) });

    const result = await service.list({ source: ['splunk'], status: ['COMPLETED'] });
    expect(result.jobs).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.jobs[0].source).toBe('splunk');
    expect(result.jobs[0].status).toBe('COMPLETED');
  });

  it('hasReview=true returns only jobs with a ManualReview', async () => {
    const jobWithReview = await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'COMPLETED' }) });
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'COMPLETED' }) });

    await prisma.manualReview.create({
      data: {
        normalizeJobId: jobWithReview.id,
        source: jobWithReview.source,
        slmOcsfOutput: { class_uid: 2004 },
        confidence: 0.5,
      },
    });

    const result = await service.list({ hasReview: true });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].id).toBe(jobWithReview.id);
    expect(result.jobs[0].hasManualReview).toBe(true);
  });

  it('hasReview=false excludes jobs with a ManualReview', async () => {
    const jobWithReview = await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'COMPLETED' }) });
    await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'COMPLETED' }) });

    await prisma.manualReview.create({
      data: {
        normalizeJobId: jobWithReview.id,
        source: jobWithReview.source,
        slmOcsfOutput: { class_uid: 2004 },
        confidence: 0.5,
      },
    });

    const result = await service.list({ hasReview: false });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].hasManualReview).toBe(false);
  });

  it('page/pageSize math is correct (page 2 with pageSize 10 returns rows 11-20)', async () => {
    // Create 15 jobs
    for (let i = 0; i < 15; i++) {
      await prisma.normalizeJob.create({ data: buildNormalizeJob() });
    }

    const result = await service.list({ page: 2, pageSize: 10 });
    expect(result.jobs).toHaveLength(5); // 15 total, page 2 of 10 = 5 remaining
    expect(result.total).toBe(15);
  });

  it('wasSuperseded is true only when the OCSFEvent has a superseding event', async () => {
    const job = await prisma.normalizeJob.create({ data: buildNormalizeJob({ status: 'COMPLETED', decision: 'accept' }) });

    // Create original event
    const original = await prisma.oCSFEvent.create({
      data: {
        normalizeJobId: job.id,
        classUid: 2004,
        className: 'Detection Finding',
        ocsfJson: {},
        confidence: 0.9,
        decision: 'ACCEPT',
        processingTime: 100,
      },
    });

    // Before superseding: wasSuperseded should be false
    let result = await service.list({});
    expect(result.jobs[0].wasSuperseded).toBe(false);

    // Create superseding event
    await prisma.oCSFEvent.create({
      data: {
        normalizeJobId: job.id,
        classUid: 2004,
        className: 'Detection Finding',
        ocsfJson: {},
        confidence: 1.0,
        decision: 'CORRECTED',
        processingTime: 0,
        supersedesEventId: original.id,
      },
    });

    // After superseding: wasSuperseded should be true
    result = await service.list({});
    expect(result.jobs[0].wasSuperseded).toBe(true);
  });
});
