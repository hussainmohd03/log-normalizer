import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DECISION, PRIORITY } from 'generated/prisma/enums';
import { PrismaService } from 'src/database/prisma.service';
import { ReviewService } from 'src/review/review.service';
import { SLMService } from 'src/slm/slm.service';
import {
  buildCorrectedOcsf,
  buildRawLog,
  buildSLMResponse,
} from 'test/factories';
import { cleanDatabase } from 'test/helper/prisma-test';

describe('ReviewService', () => {
  let reviewService: ReviewService;
  let prisma: PrismaService;
  let mockSLM: { validate: jest.Mock };

  beforeAll(async () => {
    mockSLM = { validate: jest.fn() };

    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        ReviewService,
        PrismaService,
        { provide: SLMService, useValue: mockSLM },
      ],
    }).compile();

    reviewService = module.get(ReviewService);
    prisma = module.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    mockSLM.validate.mockClear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('queue(): Creates ManualReview with correct fields and priority', async () => {
    const rawLog = await prisma.rawLog.create({ data: buildRawLog() });
    const slmResponse = buildSLMResponse({
      decision: 'review',
      confidence: 0.65,
    });

    await reviewService.queue(rawLog, slmResponse, PRIORITY.NORMAL);

    const review = await prisma.manualReview.findFirst({
      where: { rawLogId: rawLog.id },
    });

    expect(review).not.toBeNull();
    expect(review!.source).toBe('crowdstrike');
    expect(review!.confidence).toBe(0.65);
    expect(review!.priority).toBe(PRIORITY.NORMAL);
    expect(review!.reviewedAt).toBeNull();
  });

  it('queue(): Error propagates (BLOCKING - no try/catch)', async () => {
    const fakeRawLog = { id: 'non-existent-id', source: 'test' } as any;
    const slmResponse = buildSLMResponse({ decision: 'review' });

    await expect(
      reviewService.queue(fakeRawLog, slmResponse, PRIORITY.NORMAL),
    ).rejects.toThrow();
  });

  it('getPending(): Returns items ordered by priority DESC then confidence ASC', async () => {
    const rawLog1 = await prisma.rawLog.create({ data: buildRawLog() });
    const rawLog2 = await prisma.rawLog.create({ data: buildRawLog() });
    const rawLog3 = await prisma.rawLog.create({ data: buildRawLog() });

    const low = buildSLMResponse({ decision: 'review', confidence: 0.7 });
    const mid = buildSLMResponse({ decision: 'review', confidence: 0.5 });
    const high = buildSLMResponse({ decision: 'reject', confidence: 0.3 });

    await reviewService.queue(rawLog1, low, PRIORITY.NORMAL); // NORMAL, 0.7
    await reviewService.queue(rawLog2, mid, PRIORITY.NORMAL); // NORMAL, 0.5
    await reviewService.queue(rawLog3, high, PRIORITY.HIGH); // HIGH, 0.3

    const pending = await reviewService.getPending();

    // HIGH priority first, then NORMAL sorted by confidence ASC
    expect(pending[0].priority).toBe(PRIORITY.HIGH);
    expect(pending[1].confidence).toBe(0.5); // lower confidence first
    expect(pending[2].confidence).toBe(0.7);
  });

  it('getPending(): Returns empty array when no pending reviews', async () => {
    const pendings = await reviewService.getPending();

    expect(pendings).toEqual([]);
  });

  it('submitCorrection(): Successful correction - validates, updates ManualReview, upserts OCSFEvent', async () => {
    mockSLM.validate.mockResolvedValue({ valid: true, errors: [] });
    const { rawLog, review } = await createPendingReview(prisma, reviewService);
    const correctedOcsf = buildCorrectedOcsf();

    const updated = await reviewService.submitCorrection(
      review.id,
      correctedOcsf,
      'Hussain',
    );
    expect(updated.correctedOCSF).toEqual(correctedOcsf);
    expect(updated.reviewedBy).toEqual('Hussain');

    const ocsfEvent = await prisma.oCSFEvent.findFirst({
      where: { rawLogId: rawLog.id },
    });
    expect(ocsfEvent).not.toBeNull();
    expect(ocsfEvent!.decision).toEqual(DECISION.CORRECTED);
  });

  it('submitCorrection(): Invalid OCSF - throws BadRequestException', async () => {
    mockSLM.validate.mockResolvedValue({
      valid: false,
      errors: ['type_uid mismatch'],
    });
    const { review } = await createPendingReview(prisma, reviewService);
    const correctedOcsf = buildCorrectedOcsf();

    await expect(
      reviewService.submitCorrection(review.id, correctedOcsf, 'Hussain'),
    ).rejects.toThrow(BadRequestException);
  });

  it('submitCorrection(): Review not found - throws NotFoundException', async () => {
    mockSLM.validate.mockResolvedValue({ valid: true, errors: [] });
    const correctedOcsf = buildCorrectedOcsf();

    await expect(
      reviewService.submitCorrection(
        'non-existent-id',
        correctedOcsf,
        'Hussain',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('submitCorrection(): Already reviewed - throws BadRequestException', async () => {
    mockSLM.validate.mockResolvedValue({ valid: true, errors: [] });
    const { review } = await createPendingReview(prisma, reviewService);
    const correctedOcsf = buildCorrectedOcsf();

    await reviewService.submitCorrection(review.id, correctedOcsf, 'Hussain');
    await expect(
      reviewService.submitCorrection(review.id, correctedOcsf, 'Hussain'),
    ).rejects.toThrow(BadRequestException);
  });

  async function createPendingReview(
    prisma: PrismaService,
    reviewService: ReviewService,
  ) {
    const rawLog = await prisma.rawLog.create({ data: buildRawLog() });
    const slmResponse = buildSLMResponse({
      decision: 'review',
      confidence: 0.65,
    });
    await reviewService.queue(rawLog, slmResponse, PRIORITY.NORMAL);
    const review = await prisma.manualReview.findFirst({
      where: { rawLogId: rawLog.id },
    });
    return { rawLog, review: review! };
  }
});
