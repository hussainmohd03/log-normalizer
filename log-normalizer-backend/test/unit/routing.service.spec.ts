import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { PRIORITY } from 'generated/prisma/enums'
import { PrismaService } from 'src/database/prisma.service'
import { SQSClientService } from 'src/delivery/sqs-client.service'
import { ReviewService } from 'src/review/review.service'
import { RoutingService } from 'src/routing/routing.service'
import { buildNormalizeJob, buildSLMResponse } from 'test/factories'
import { cleanDatabase } from 'test/helper/prisma-test'

describe('RoutingService', () => {
  let routingService: RoutingService;
  let prisma: PrismaService;
  let mockSQS: { publish: jest.Mock };
  let mockReview: { queue: jest.Mock };

  beforeAll(async () => {
    mockSQS = { publish: jest.fn().mockResolvedValue('msg-id-123') };
    mockReview = { queue: jest.fn() };

    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        RoutingService,
        PrismaService,
        { provide: SQSClientService, useValue: mockSQS },
        { provide: ReviewService, useValue: mockReview },
      ],
    }).compile()

    routingService = module.get(RoutingService);
    prisma = module.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma)
    mockSQS.publish.mockClear()
    mockReview.queue.mockClear()
  })

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accept path: creates OCSFEvent + calls SQS', async () => {
    const job = await prisma.normalizeJob.create({ data: buildNormalizeJob() })
    const slmResponse = buildSLMResponse({ decision: 'accept', confidence: 0.92 })

    await routingService.route(job, slmResponse)

    const ocsf = await prisma.oCSFEvent.findFirst({ where: { normalizeJobId: job.id } })
    expect(ocsf).not.toBeNull()
    expect(ocsf!.confidence).toBe(0.92)

    expect(mockSQS.publish).toHaveBeenCalledWith(slmResponse.ocsf, job.id)
    expect(mockReview.queue).not.toHaveBeenCalled()
  })

  it('review path: creates OCSFEvent + calls Queue, no SQS', async () => {
    const job = await prisma.normalizeJob.create({ data: buildNormalizeJob() })
    const slmResponse = buildSLMResponse({ decision: 'review', confidence: 0.72 })

    await routingService.route(job, slmResponse)

    const ocsf = await prisma.oCSFEvent.findFirst({ where: { normalizeJobId: job.id } })
    expect(ocsf).not.toBeNull()
    expect(ocsf!.confidence).toBe(0.72)

    expect(mockReview.queue).toHaveBeenCalledWith(job, slmResponse, PRIORITY.NORMAL)
    expect(mockSQS.publish).not.toHaveBeenCalled()
  })

  it('reject path: queues review with HIGH priority, no SQS, no OCSFEvent', async () => {
    const job = await prisma.normalizeJob.create({ data: buildNormalizeJob() })
    const slmResponse = buildSLMResponse({ decision: 'reject', ocsf: null, confidence: 0.2 })

    await routingService.route(job, slmResponse)

    const ocsf = await prisma.oCSFEvent.findFirst({ where: { normalizeJobId: job.id } })
    expect(ocsf).toBeNull()

    expect(mockReview.queue).toHaveBeenCalledWith(job, slmResponse, PRIORITY.HIGH)
    expect(mockSQS.publish).not.toHaveBeenCalled()
  })

  it('accept path: SQS failure does not break the flow', async () => {
    mockSQS.publish.mockRejectedValueOnce(new Error('SQS down'))

    const job = await prisma.normalizeJob.create({ data: buildNormalizeJob() })
    const slmResponse = buildSLMResponse({ decision: 'accept' })

    await routingService.route(job, slmResponse)

    // Transaction still succeeded despite SQS failure
    const ocsf = await prisma.oCSFEvent.findFirst({ where: { normalizeJobId: job.id } })
    expect(ocsf).not.toBeNull()
    expect(ocsf!.publishedToSqs).toBe(false)
  })

  it('reject path: review queue failure propagates', async () => {
    mockReview.queue.mockRejectedValueOnce(new Error('DB down'));

    const job = await prisma.normalizeJob.create({ data: buildNormalizeJob() })
    const slmResponse = buildSLMResponse({ decision: 'reject', ocsf: null, confidence: 0.2 })

    await expect(routingService.route(job, slmResponse)).rejects.toThrow()
  })

  // -- retry idempotency: route() called twice on the same job ------------

  it('upserts OCSFEvent on retry — second route() call updates instead of duplicating', async () => {
    const job = await prisma.normalizeJob.create({ data: buildNormalizeJob() })
    const first = buildSLMResponse({ decision: 'accept', confidence: 0.5 })
    const second = buildSLMResponse({ decision: 'accept', confidence: 0.95 })

    await routingService.route(job, first)
    await routingService.route(job, second)

    const ocsfRows = await prisma.oCSFEvent.findMany({
      where: { normalizeJobId: job.id },
    })
    expect(ocsfRows).toHaveLength(1)
    expect(ocsfRows[0].confidence).toBe(0.95) // latest attempt wins
  })

  it('upserts ProcessingMetric on retry — exactly one row per logical job', async () => {
    const job = await prisma.normalizeJob.create({ data: buildNormalizeJob() })
    const first = buildSLMResponse({ decision: 'accept', confidence: 0.5 })
    const second = buildSLMResponse({ decision: 'accept', confidence: 0.95 })

    await routingService.route(job, first)
    await routingService.route(job, second)

    const metricRows = await prisma.processingMetric.findMany({
      where: { normalizeJobId: job.id },
    })
    expect(metricRows).toHaveLength(1)
    expect(metricRows[0].confidence).toBe(0.95)
  })

  it('upsert resets publishedToSqs on retry so the new payload re-publishes', async () => {
    const job = await prisma.normalizeJob.create({ data: buildNormalizeJob() })

    // First attempt: publish succeeds, OCSFEvent gets publishedToSqs=true
    await routingService.route(job, buildSLMResponse({ decision: 'accept' }))
    const firstEvent = await prisma.oCSFEvent.findFirst({ where: { normalizeJobId: job.id } })
    await prisma.oCSFEvent.update({
      where: { id: firstEvent!.id },
      data: { publishedToSqs: true, sqsMessageId: 'first-msg-id' },
    })

    // Second attempt (e.g. retry): the upsert update branch must reset
    // publishedToSqs to false so handleAccept tries to publish the new
    // payload.
    await routingService.route(job, buildSLMResponse({ decision: 'accept', confidence: 0.99 }))

    const ocsf = await prisma.oCSFEvent.findFirst({
      where: { normalizeJobId: job.id },
    })
    // handleAccept ran a fresh publish on the second route() call, so
    // publishedToSqs is back to true with the new mock id.
    expect(ocsf!.publishedToSqs).toBe(true)
    expect(ocsf!.sqsMessageId).toBe('msg-id-123')
    expect(ocsf!.confidence).toBe(0.99)
  })
})
