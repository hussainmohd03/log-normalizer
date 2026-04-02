// test/unit/ingestion.service.spec.ts
import { Test } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from 'src/database/prisma.service'
import { IngestionService } from 'src/ingestion/ingestion.service'
import { NormalizationService } from 'src/normalization/normalization.service'
import { cleanDatabase } from 'test/helper/prisma-test'

describe('IngestionService', () => {
  let ingestionService: IngestionService
  let prisma: PrismaService
  let mockNormalization: { process: jest.Mock }

  beforeAll(async () => {
    mockNormalization = {
      process: jest.fn().mockResolvedValue(null),
    }

    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        IngestionService,
        PrismaService,
        { provide: NormalizationService, useValue: mockNormalization },
      ],
    }).compile()

    ingestionService = module.get(IngestionService)
    prisma = module.get(PrismaService)
  })

  beforeEach(async () => {
    await cleanDatabase(prisma)
    mockNormalization.process.mockClear()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('receiveAlert: stores raw log and returns id', async () => {
    const result = await ingestionService.receiveAlert({
      source: 'crowdstrike',
      rawContent: { alert_id: 'test-123' },
    })

    expect(result.id).toBeDefined()
    expect(result.status).toBe('accepted')

    const stored = await prisma.rawLog.findUnique({ where: { id: result.id } })
    expect(stored).not.toBeNull()
    expect(stored!.source).toBe('crowdstrike')
  })

  it('receiveAlert: fires normalization without awaiting', async () => {
    const result = await ingestionService.receiveAlert({
      source: 'crowdstrike',
      rawContent: { alert_id: 'test-123' },
    })

    // process was called but receiveAlert didn't wait for it
    expect(mockNormalization.process).toHaveBeenCalled()
    expect(result.status).toBe('accepted')
  })

  it('receiveBatch: stores multiple logs and returns count', async () => {
    const result = await ingestionService.receiveBatch({
      source: 'splunk',
      alerts: [
        { alert_id: 'batch-1' },
        { alert_id: 'batch-2' },
        { alert_id: 'batch-3' },
      ],
    })

    expect(result.count).toBe(3)
    expect(result.status).toBe('accepted')

    const stored = await prisma.rawLog.count({ where: { source: 'splunk' } })
    expect(stored).toBe(3)
  })

  it('receiveBatch: fires normalization for each log', async () => {
    await ingestionService.receiveBatch({
      source: 'splunk',
      alerts: [
        { alert_id: 'batch-1' },
        { alert_id: 'batch-2' },
      ],
    })

    expect(mockNormalization.process).toHaveBeenCalledTimes(2)
  })
})