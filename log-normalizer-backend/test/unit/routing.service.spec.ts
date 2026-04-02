import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { PRIORITY, STATUS } from 'generated/prisma/enums'
import { PrismaService } from 'src/database/prisma.service'
import { SQSClientService } from 'src/delivery/sqs-client.service'
import { ReviewService } from 'src/review/review.service'
import { RoutingService } from 'src/routing/routing.service'
import { buildRawLog, buildSLMResponse } from 'test/factories'
import { cleanDatabase } from 'test/helper/prisma-test'

describe('RoutingService', () => {
  let routingService: RoutingService
  let prisma: PrismaService
  let mockSQS: { publish: jest.Mock }
  let mockReview: { queue: jest.Mock }

  beforeAll(async () => {
    mockSQS = { publish: jest.fn().mockResolvedValue('msg-id-123') }
    mockReview = { queue: jest.fn() }

    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        RoutingService,
        PrismaService,
        { provide: SQSClientService, useValue: mockSQS },
        { provide: ReviewService , useValue: mockReview },
      ]
    }).compile()

    routingService = module.get(RoutingService)
    prisma = module.get(PrismaService)
  })

  beforeEach(async () => { 
    await cleanDatabase(prisma) 
    mockSQS.publish.mockClear()
    mockReview.queue.mockClear()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('accept path: creates OCSFEvent + calls SQS', async () => {

    const rawLog = await prisma.rawLog.create({ data: buildRawLog() })
    const slmResponse = buildSLMResponse({ decision: 'accept', confidence: 0.92})

    await routingService.route(rawLog, slmResponse)

    const ocsf = await prisma.oCSFEvent.findUnique({ where: { rawLogId: rawLog.id }})
    expect(ocsf).not.toBeNull()
    expect(ocsf!.confidence).toBe(0.92)

    const updated = await prisma.rawLog.findUnique({ where: { id: rawLog.id }})
    expect(updated!.status).toBe(STATUS.PROCESSED)

    expect(mockSQS.publish).toHaveBeenCalledWith(slmResponse.ocsf)
    expect(mockReview.queue).not.toHaveBeenCalled()
  })

  it('review path: creates OCSFEvent + calls Queue, no SQS', async () => {
    const rawLog = await prisma.rawLog.create({ data: buildRawLog() })
    const slmResponse = buildSLMResponse({ decision: 'review', confidence: 0.72})

    await routingService.route(rawLog, slmResponse)

    const ocsf = await prisma.oCSFEvent.findUnique({ where: { rawLogId: rawLog.id }})
    expect(ocsf).not.toBeNull()
    expect(ocsf!.confidence).toBe(0.72)

    expect(mockReview.queue).toHaveBeenCalledWith(rawLog, slmResponse, PRIORITY.NORMAL)

    expect(mockSQS.publish).not.toHaveBeenCalled();
  })

  it('reject path: queues review with HIGH priority, no SQS', async () => {
    const rawLog = await prisma.rawLog.create({ data: buildRawLog() })
    const slmResponse = buildSLMResponse({ decision: 'reject', ocsf: null, confidence: 0.2})

    await routingService.route(rawLog, slmResponse)

    const ocsf = await prisma.oCSFEvent.findUnique({ where: { rawLogId: rawLog.id }})
    expect(ocsf).toBeNull()

    const updated = await prisma.rawLog.findUnique({ where: { id: rawLog.id }})
    expect(updated!.status).toBe(STATUS.FAILED)

    expect(mockReview.queue).toHaveBeenCalledWith(rawLog, slmResponse, PRIORITY.HIGH)

    expect(mockSQS.publish).not.toHaveBeenCalled();
  })

  it('accept path: SQS failure does not break the flow', async () => {
    mockSQS.publish.mockRejectedValueOnce(new Error('SQS down'));

    const rawLog = await prisma.rawLog.create({ data: buildRawLog() })
    const slmResponse = buildSLMResponse({ decision: 'accept' })

    await routingService.route(rawLog, slmResponse)

    // Transaction still succeeded despite SQS failure
    const ocsf = await prisma.oCSFEvent.findUnique({ where: { rawLogId: rawLog.id } })
    expect(ocsf).not.toBeNull();
    expect(ocsf!.publishedToSqs).toBe(false)
  })

  it('reject path: review queue failure propagates', async () => {
    mockReview.queue.mockRejectedValueOnce(new Error('DB down'))

    const rawLog = await prisma.rawLog.create({ data: buildRawLog() })
    const slmResponse = buildSLMResponse({ decision: 'reject', ocsf: null, confidence: 0.2 })

    await expect(routingService.route(rawLog, slmResponse)).rejects.toThrow()
  })

})