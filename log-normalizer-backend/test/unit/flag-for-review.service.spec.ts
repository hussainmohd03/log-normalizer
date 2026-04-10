import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/database/prisma.service';
import { ReviewService } from 'src/review/review.service';
import { SLMService } from 'src/slm/slm.service';
import { buildNormalizeJob } from 'test/factories';
import { cleanDatabase } from 'test/helper/prisma-test';

describe('ReviewService.flagForReview', () => {
  let service: ReviewService;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        PrismaService,
        ReviewService,
        { provide: SLMService, useValue: { validate: jest.fn().mockResolvedValue({ valid: true }) } },
      ],
    }).compile();

    service = module.get(ReviewService);
    prisma = module.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    await prisma.user.deleteMany();
    const user = await prisma.user.create({
      data: { email: 'analyst@test.com', passwordHash: 'hash', role: 'ANALYST' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('flags a COMPLETED accept job → creates HUMAN_FLAGGED ManualReview', async () => {
    const job = await prisma.normalizeJob.create({
      data: buildNormalizeJob({ status: 'COMPLETED', decision: 'accept' }),
    });

    const review = await service.flagForReview(job.id, userId);

    expect(review.normalizeJobId).toBe(job.id);
    expect(review.correctionType).toBe('HUMAN_FLAGGED');
    expect(review.flaggedById).toBe(userId);
    expect(review.reviewedAt).toBeNull();
    expect(review.correctedOCSF).toBeNull();
  });

  it('flags a COMPLETED reject job → creates HUMAN_FLAGGED ManualReview', async () => {
    const job = await prisma.normalizeJob.create({
      data: buildNormalizeJob({ status: 'COMPLETED', decision: 'reject' }),
    });

    const review = await service.flagForReview(job.id, userId);
    expect(review.correctionType).toBe('HUMAN_FLAGGED');
  });

  it('flag a job that already has a ManualReview → 409 Conflict', async () => {
    const job = await prisma.normalizeJob.create({
      data: buildNormalizeJob({ status: 'COMPLETED', decision: 'accept' }),
    });

    await service.flagForReview(job.id, userId);

    await expect(service.flagForReview(job.id, userId)).rejects.toThrow(ConflictException);
  });

  it('flag a job that does not exist → 404', async () => {
    await expect(service.flagForReview('nonexistent-id', userId)).rejects.toThrow(NotFoundException);
  });

  it('flag a job in QUEUED state → 400', async () => {
    const job = await prisma.normalizeJob.create({
      data: buildNormalizeJob({ status: 'QUEUED' }),
    });

    await expect(service.flagForReview(job.id, userId)).rejects.toThrow(BadRequestException);
  });

  it('flag a job in ACTIVE state → 400', async () => {
    const job = await prisma.normalizeJob.create({
      data: buildNormalizeJob({ status: 'ACTIVE' }),
    });

    await expect(service.flagForReview(job.id, userId)).rejects.toThrow(BadRequestException);
  });

  it('flaggedById is sourced from the userId parameter, not from any other field', async () => {
    const job = await prisma.normalizeJob.create({
      data: buildNormalizeJob({ status: 'COMPLETED', decision: 'accept' }),
    });

    const review = await service.flagForReview(job.id, userId, 'looks wrong');
    expect(review.flaggedById).toBe(userId);

    const fromDb = await prisma.manualReview.findUnique({ where: { id: review.id } });
    expect(fromDb!.flaggedById).toBe(userId);
  });
});
