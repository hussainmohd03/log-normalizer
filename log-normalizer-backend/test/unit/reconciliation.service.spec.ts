import { getQueueToken } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { PrismaService } from 'src/database/prisma.service'
import { NORMALIZE_QUEUE } from 'src/queue/queue-names'
import { ReconciliationService } from 'src/reconciliation/reconciliation.service'

const STUCK_ACTIVE_MINUTES = 15
const STUCK_QUEUED_MINUTES = 60
const IDEMPOTENCY_KEY_RETENTION_HOURS = 24
const BATCH_SIZE = 100

const ENV: Record<string, string> = {
  RECONCILE_STUCK_ACTIVE_MINUTES: String(STUCK_ACTIVE_MINUTES),
  RECONCILE_STUCK_QUEUED_MINUTES: String(STUCK_QUEUED_MINUTES),
  IDEMPOTENCY_KEY_RETENTION_HOURS: String(IDEMPOTENCY_KEY_RETENTION_HOURS),
  RECONCILE_BATCH_SIZE: String(BATCH_SIZE),
}

function makePrismaMock() {
  return {
    normalizeJob: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  }
}

function makeQueueMock() {
  return {
    getJob: jest.fn().mockResolvedValue(null),
  }
}

async function build(prismaMock: ReturnType<typeof makePrismaMock>, queueMock: ReturnType<typeof makeQueueMock>) {
  const module = await Test.createTestingModule({
    providers: [
      ReconciliationService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: ConfigService, useValue: { get: (k: string) => ENV[k] } },
      { provide: getQueueToken(NORMALIZE_QUEUE), useValue: queueMock },
    ],
  }).compile()
  return module.get(ReconciliationService)
}

describe('ReconciliationService — sweepActive', () => {
  let prisma: ReturnType<typeof makePrismaMock>
  let queue: ReturnType<typeof makeQueueMock>
  let service: ReconciliationService

  beforeEach(async () => {
    prisma = makePrismaMock()
    queue = makeQueueMock()
    service = await build(prisma, queue)
  })

  it('issues an UPDATE with status=ACTIVE and startedAt<cutoff', async () => {
    prisma.normalizeJob.updateMany.mockResolvedValueOnce({ count: 3 })

    const fixed = await service.sweepActive()

    expect(fixed).toBe(3)
    expect(prisma.normalizeJob.updateMany).toHaveBeenCalledTimes(1)
    const call = prisma.normalizeJob.updateMany.mock.calls[0][0]
    expect(call.where.status).toBe('ACTIVE')
    expect(call.where.startedAt.lt).toBeInstanceOf(Date)
    expect(call.data.status).toBe('FAILED')
    expect(call.data.error).toBe('reconciliation: worker heartbeat lost')
    expect(call.data.completedAt).toBeInstanceOf(Date)
  })

  it('cutoff is now - STUCK_ACTIVE_MINUTES (within 1s tolerance)', async () => {
    const before = Date.now()
    await service.sweepActive()
    const call = prisma.normalizeJob.updateMany.mock.calls[0][0]
    const cutoffMs = (call.where.startedAt.lt as Date).getTime()

    const expected = before - STUCK_ACTIVE_MINUTES * 60_000
    expect(Math.abs(cutoffMs - expected)).toBeLessThan(1000)
  })

  it('returns 0 and does not throw when the worker won the race (count=0)', async () => {
    prisma.normalizeJob.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(service.sweepActive()).resolves.toBe(0)
  })

  it('does not call queue.getJob — sweep A is DB-only', async () => {
    prisma.normalizeJob.updateMany.mockResolvedValueOnce({ count: 5 })
    await service.sweepActive()
    expect(queue.getJob).not.toHaveBeenCalled()
  })
})

describe('ReconciliationService — sweepQueued', () => {
  let prisma: ReturnType<typeof makePrismaMock>
  let queue: ReturnType<typeof makeQueueMock>
  let service: ReconciliationService

  beforeEach(async () => {
    prisma = makePrismaMock()
    queue = makeQueueMock()
    service = await build(prisma, queue)
  })

  it('returns 0 with no candidates and never touches the queue', async () => {
    prisma.normalizeJob.findMany.mockResolvedValueOnce([])

    const fixed = await service.sweepQueued()

    expect(fixed).toBe(0)
    expect(queue.getJob).not.toHaveBeenCalled()
    expect(prisma.normalizeJob.updateMany).not.toHaveBeenCalled()
  })

  it('skips a candidate that still has a BullMQ job (does not mark FAILED)', async () => {
    prisma.normalizeJob.findMany.mockResolvedValueOnce([
      { id: 'uuid-a', createdAt: new Date('2026-04-08T08:00:00Z') },
    ])
    queue.getJob.mockResolvedValueOnce({ id: 'uuid-a' })

    const fixed = await service.sweepQueued()

    expect(fixed).toBe(0)
    expect(queue.getJob).toHaveBeenCalledWith('uuid-a')
    expect(prisma.normalizeJob.updateMany).not.toHaveBeenCalled()
  })

  it('marks a candidate FAILED when no BullMQ job exists', async () => {
    prisma.normalizeJob.findMany.mockResolvedValueOnce([
      { id: 'uuid-a', createdAt: new Date('2026-04-08T08:00:00Z') },
    ])
    queue.getJob.mockResolvedValueOnce(null)
    prisma.normalizeJob.updateMany.mockResolvedValueOnce({ count: 1 })

    const fixed = await service.sweepQueued()

    expect(fixed).toBe(1)
    expect(prisma.normalizeJob.updateMany).toHaveBeenCalledTimes(1)
    const call = prisma.normalizeJob.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'uuid-a', status: 'QUEUED' })
    expect(call.data.status).toBe('FAILED')
    expect(call.data.error).toBe('reconciliation: enqueue orphan')
  })

  it('does not increment fixed when updateMany hits the race (count=0)', async () => {
    // The row was already moved out of QUEUED between findMany and updateMany.
    prisma.normalizeJob.findMany.mockResolvedValueOnce([
      { id: 'uuid-race', createdAt: new Date('2026-04-08T08:00:00Z') },
    ])
    queue.getJob.mockResolvedValueOnce(null)
    prisma.normalizeJob.updateMany.mockResolvedValueOnce({ count: 0 })

    const fixed = await service.sweepQueued()

    expect(fixed).toBe(0)
  })

  it('processes a mixed batch — some have BullMQ jobs, some do not', async () => {
    prisma.normalizeJob.findMany.mockResolvedValueOnce([
      { id: 'has-bull', createdAt: new Date('2026-04-08T08:00:00Z') },
      { id: 'orphan-1', createdAt: new Date('2026-04-08T08:00:00Z') },
      { id: 'orphan-2', createdAt: new Date('2026-04-08T08:00:00Z') },
    ])
    queue.getJob
      .mockResolvedValueOnce({ id: 'has-bull' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    prisma.normalizeJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })

    const fixed = await service.sweepQueued()

    expect(fixed).toBe(2)
    expect(queue.getJob).toHaveBeenCalledTimes(3)
    expect(prisma.normalizeJob.updateMany).toHaveBeenCalledTimes(2)
  })

  it('passes RECONCILE_BATCH_SIZE as the take limit', async () => {
    await service.sweepQueued()
    const call = prisma.normalizeJob.findMany.mock.calls[0][0]
    expect(call.take).toBe(BATCH_SIZE)
  })

  it('cutoff is now - STUCK_QUEUED_MINUTES (within 1s tolerance)', async () => {
    const before = Date.now()
    await service.sweepQueued()
    const call = prisma.normalizeJob.findMany.mock.calls[0][0]
    const cutoffMs = (call.where.createdAt.lt as Date).getTime()

    const expected = before - STUCK_QUEUED_MINUTES * 60_000
    expect(Math.abs(cutoffMs - expected)).toBeLessThan(1000)
  })
})

describe('ReconciliationService — sweepIdempotencyKeys', () => {
  let prisma: ReturnType<typeof makePrismaMock>
  let queue: ReturnType<typeof makeQueueMock>
  let service: ReconciliationService

  beforeEach(async () => {
    prisma = makePrismaMock()
    queue = makeQueueMock()
    service = await build(prisma, queue)
  })

  it('NULLs out idempotencyKey on rows older than the TTL', async () => {
    prisma.normalizeJob.updateMany.mockResolvedValueOnce({ count: 4 })

    const expired = await service.sweepIdempotencyKeys()

    expect(expired).toBe(4)
    const call = prisma.normalizeJob.updateMany.mock.calls[0][0]
    expect(call.where.idempotencyKey).toEqual({ not: null })
    expect(call.where.createdAt.lt).toBeInstanceOf(Date)
    expect(call.data).toEqual({ idempotencyKey: null })
  })

  it('cutoff is now - IDEMPOTENCY_KEY_RETENTION_HOURS (within 1s tolerance)', async () => {
    const before = Date.now()
    await service.sweepIdempotencyKeys()
    const call = prisma.normalizeJob.updateMany.mock.calls[0][0]
    const cutoffMs = (call.where.createdAt.lt as Date).getTime()

    const expected = before - IDEMPOTENCY_KEY_RETENTION_HOURS * 60 * 60_000
    expect(Math.abs(cutoffMs - expected)).toBeLessThan(1000)
  })

  it('returns 0 when no rows match (no log emitted is fine)', async () => {
    prisma.normalizeJob.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(service.sweepIdempotencyKeys()).resolves.toBe(0)
  })

  it('does not touch the queue', async () => {
    await service.sweepIdempotencyKeys()
    expect(queue.getJob).not.toHaveBeenCalled()
  })
})

describe('ReconciliationService — sweep (cron entry point)', () => {
  let prisma: ReturnType<typeof makePrismaMock>
  let queue: ReturnType<typeof makeQueueMock>
  let service: ReconciliationService

  beforeEach(async () => {
    prisma = makePrismaMock()
    queue = makeQueueMock()
    service = await build(prisma, queue)
  })

  it('runs sweepActive then sweepQueued then sweepIdempotencyKeys', async () => {
    const spyA = jest.spyOn(service, 'sweepActive').mockResolvedValueOnce(2)
    const spyQ = jest.spyOn(service, 'sweepQueued').mockResolvedValueOnce(1)
    const spyK = jest.spyOn(service, 'sweepIdempotencyKeys').mockResolvedValueOnce(7)

    await service.sweep()

    expect(spyA).toHaveBeenCalledTimes(1)
    expect(spyQ).toHaveBeenCalledTimes(1)
    expect(spyK).toHaveBeenCalledTimes(1)
    // Order: active → queued → idempotency keys
    expect(spyA.mock.invocationCallOrder[0]).toBeLessThan(
      spyQ.mock.invocationCallOrder[0],
    )
    expect(spyQ.mock.invocationCallOrder[0]).toBeLessThan(
      spyK.mock.invocationCallOrder[0],
    )
  })

  it('concurrency guard: a second sweep() while the first is in flight is a no-op', async () => {
    let releaseFirst!: () => void
    const firstActive = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    jest.spyOn(service, 'sweepActive').mockImplementationOnce(async () => {
      await firstActive
      return 0
    })
    jest.spyOn(service, 'sweepQueued').mockResolvedValue(0)
    jest.spyOn(service, 'sweepIdempotencyKeys').mockResolvedValue(0)

    const first = service.sweep()
    // While the first is suspended inside sweepActive, kick off a second.
    const second = service.sweep()

    // The second short-circuits and resolves immediately, without ever
    // entering sweepActive a second time.
    await second
    expect(service.sweepActive).toHaveBeenCalledTimes(1)

    // Release the first and let it finish.
    releaseFirst()
    await first
  })

  it('does not throw if a sweep method rejects — logs and resets running', async () => {
    jest.spyOn(service, 'sweepActive').mockRejectedValueOnce(new Error('db gone'))

    await expect(service.sweep()).resolves.toBeUndefined()

    // Running flag was reset so the next tick can proceed.
    jest.spyOn(service, 'sweepActive').mockResolvedValueOnce(0)
    jest.spyOn(service, 'sweepQueued').mockResolvedValueOnce(0)
    jest.spyOn(service, 'sweepIdempotencyKeys').mockResolvedValueOnce(0)
    await expect(service.sweep()).resolves.toBeUndefined()
    expect(service.sweepActive).toHaveBeenCalledTimes(2)
  })
})
