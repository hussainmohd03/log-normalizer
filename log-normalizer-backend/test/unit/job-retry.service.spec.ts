import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JobStatus, NormalizeJob } from 'generated/prisma/client'
import { JobRetryService } from 'src/jobs/job-retry.service'
import { PrismaService } from 'src/database/prisma.service'
import { NormalizeProducer } from 'src/queue/normalize.producer'

const SOURCE: NormalizeJob = {
  id: 'source-uuid',
  status: JobStatus.FAILED,
  rawLog: { alert_id: 'src-1' },
  source: 'crowdstrike',
  format: 'json',
  idempotencyKey: 'original-key-do-not-copy',
  parentJobId: null,
  ocsf: null,
  confidence: null,
  decision: null,
  breakdown: null,
  validationErrors: null,
  processingTimeMs: null,
  error: 'circuit open (attempt 3/3)',
  attempts: 3,
  createdAt: new Date('2026-04-08T10:00:00Z'),
  updatedAt: new Date('2026-04-08T10:01:00Z'),
  startedAt: new Date('2026-04-08T10:00:01Z'),
  completedAt: new Date('2026-04-08T10:01:00Z'),
}

function makeChild(overrides: Partial<NormalizeJob> = {}): NormalizeJob {
  return {
    ...SOURCE,
    id: 'child-uuid',
    status: JobStatus.QUEUED,
    parentJobId: SOURCE.id,
    idempotencyKey: null,
    error: null,
    attempts: 0,
    completedAt: null,
    startedAt: null,
    ...overrides,
  }
}

describe('JobRetryService', () => {
  let service: JobRetryService
  let mockPrisma: {
    normalizeJob: {
      findUnique: jest.Mock
      create: jest.Mock
      delete: jest.Mock
    }
  }
  let mockProducer: { enqueue: jest.Mock }

  beforeEach(async () => {
    mockPrisma = {
      normalizeJob: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    }
    mockProducer = { enqueue: jest.fn().mockResolvedValue(undefined) }

    const module = await Test.createTestingModule({
      providers: [
        JobRetryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NormalizeProducer, useValue: mockProducer },
      ],
    }).compile()

    service = module.get(JobRetryService)
  })

  // ── happy path ──────────────────────────────────────────────────────────

  it('retries a FAILED job: creates new row with parentJobId, enqueues, returns it', async () => {
    mockPrisma.normalizeJob.findUnique.mockResolvedValueOnce(SOURCE)
    mockPrisma.normalizeJob.create.mockResolvedValueOnce(makeChild())

    const child = await service.retry(SOURCE.id)

    expect(child.id).toBe('child-uuid')
    expect(child.parentJobId).toBe(SOURCE.id)
    expect(mockProducer.enqueue).toHaveBeenCalledWith('child-uuid')
  })

  it('copies rawLog, source, format from the source — does NOT copy idempotencyKey, error, attempts', async () => {
    mockPrisma.normalizeJob.findUnique.mockResolvedValueOnce(SOURCE)
    mockPrisma.normalizeJob.create.mockResolvedValueOnce(makeChild())

    await service.retry(SOURCE.id)

    const createArg = mockPrisma.normalizeJob.create.mock.calls[0][0]
    expect(createArg.data.rawLog).toEqual(SOURCE.rawLog)
    expect(createArg.data.source).toBe(SOURCE.source)
    expect(createArg.data.format).toBe(SOURCE.format)
    expect(createArg.data.parentJobId).toBe(SOURCE.id)
    expect(createArg.data.idempotencyKey).toBeUndefined()
    expect(createArg.data.error).toBeUndefined()
    expect(createArg.data.attempts).toBeUndefined()
  })

  it('inserts the new row BEFORE enqueueing', async () => {
    const order: string[] = []
    mockPrisma.normalizeJob.findUnique.mockResolvedValueOnce(SOURCE)
    mockPrisma.normalizeJob.create.mockImplementationOnce(async () => {
      order.push('create')
      return makeChild()
    })
    mockProducer.enqueue.mockImplementationOnce(async () => {
      order.push('enqueue')
    })

    await service.retry(SOURCE.id)

    expect(order).toEqual(['create', 'enqueue'])
  })

  // ── 409 paths ───────────────────────────────────────────────────────────

  it('throws ConflictException with "still queued" when source is QUEUED', async () => {
    mockPrisma.normalizeJob.findUnique.mockResolvedValue({
      ...SOURCE,
      status: JobStatus.QUEUED,
    })

    await expect(service.retry(SOURCE.id)).rejects.toThrow(ConflictException)
    await expect(service.retry(SOURCE.id)).rejects.toThrow(/still queued/)
    expect(mockPrisma.normalizeJob.create).not.toHaveBeenCalled()
  })

  it('throws ConflictException with "still running" when source is ACTIVE', async () => {
    mockPrisma.normalizeJob.findUnique.mockResolvedValue({
      ...SOURCE,
      status: JobStatus.ACTIVE,
    })

    await expect(service.retry(SOURCE.id)).rejects.toThrow(/still running/)
    expect(mockPrisma.normalizeJob.create).not.toHaveBeenCalled()
  })

  it('throws ConflictException with "already completed" when source is COMPLETED', async () => {
    mockPrisma.normalizeJob.findUnique.mockResolvedValue({
      ...SOURCE,
      status: JobStatus.COMPLETED,
    })

    await expect(service.retry(SOURCE.id)).rejects.toThrow(/already completed/)
    expect(mockPrisma.normalizeJob.create).not.toHaveBeenCalled()
  })

  // ── 404 ─────────────────────────────────────────────────────────────────

  it('throws NotFoundException when the source does not exist', async () => {
    mockPrisma.normalizeJob.findUnique.mockResolvedValueOnce(null)

    await expect(service.retry('missing-id')).rejects.toThrow(NotFoundException)
    expect(mockPrisma.normalizeJob.create).not.toHaveBeenCalled()
    expect(mockProducer.enqueue).not.toHaveBeenCalled()
  })

  // ── enqueue failure cleanup ─────────────────────────────────────────────

  it('on enqueue failure, deletes the orphan child and propagates', async () => {
    mockPrisma.normalizeJob.findUnique.mockResolvedValueOnce(SOURCE)
    mockPrisma.normalizeJob.create.mockResolvedValueOnce(makeChild())
    mockProducer.enqueue.mockRejectedValueOnce(new Error('Redis down'))

    await expect(service.retry(SOURCE.id)).rejects.toThrow('Redis down')

    expect(mockPrisma.normalizeJob.delete).toHaveBeenCalledWith({
      where: { id: 'child-uuid' },
    })
  })

  it('still propagates the original enqueue error if cleanup also throws', async () => {
    mockPrisma.normalizeJob.findUnique.mockResolvedValueOnce(SOURCE)
    mockPrisma.normalizeJob.create.mockResolvedValueOnce(makeChild())
    mockProducer.enqueue.mockRejectedValueOnce(new Error('Redis down'))
    mockPrisma.normalizeJob.delete.mockRejectedValueOnce(new Error('DB gone'))

    await expect(service.retry(SOURCE.id)).rejects.toThrow('Redis down')
  })

  // ── chained retries (retry of a retry) ──────────────────────────────────

  it('retrying a retry: child.parentJobId points at the middle row, not the original', async () => {
    const middle: NormalizeJob = {
      ...makeChild({ id: 'middle-uuid', parentJobId: 'original-uuid' }),
      status: JobStatus.FAILED,
      error: 'circuit open (attempt 3/3)',
    }
    mockPrisma.normalizeJob.findUnique.mockResolvedValueOnce(middle)
    mockPrisma.normalizeJob.create.mockResolvedValueOnce(
      makeChild({ id: 'grandchild-uuid', parentJobId: 'middle-uuid' }),
    )

    const grandchild = await service.retry('middle-uuid')

    expect(grandchild.parentJobId).toBe('middle-uuid')
    const createArg = mockPrisma.normalizeJob.create.mock.calls[0][0]
    expect(createArg.data.parentJobId).toBe('middle-uuid')
  })
})

// ── pure helper ──────────────────────────────────────────────────────────

describe('JobRetryService.assertRetryable', () => {
  it('returns void for FAILED', () => {
    expect(() => JobRetryService.assertRetryable({ ...SOURCE, status: JobStatus.FAILED })).not.toThrow()
  })

  it.each([
    [JobStatus.QUEUED, /still queued/],
    [JobStatus.ACTIVE, /still running/],
    [JobStatus.COMPLETED, /already completed/],
  ])('throws ConflictException for %s', (status, msg) => {
    expect(() => JobRetryService.assertRetryable({ ...SOURCE, status })).toThrow(msg)
  })
})
