import { Test } from '@nestjs/testing'
import { JobStatus, Prisma } from 'generated/prisma/client'
import { IngestionService } from 'src/ingestion/ingestion.service'
import { JobsService } from 'src/jobs/jobs.service'
import { NormalizeProducer } from 'src/queue/normalize.producer'

const STUB_ROW = {
  id: 'job-uuid-1',
  status: JobStatus.QUEUED,
  rawLog: { alert_id: 'test-1' },
  source: 'crowdstrike',
  format: 'json',
  idempotencyKey: null,
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
}

function p2002(): Error {
  // Mirror the shape of Prisma's unique-violation error so the
  // service's `instanceof PrismaClientKnownRequestError` check fires.
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  })
}

describe('IngestionService', () => {
  let service: IngestionService
  let mockJobs: {
    create: jest.Mock
    deleteQuietly: jest.Mock
    findByIdempotencyKey: jest.Mock
  }
  let mockProducer: { enqueue: jest.Mock }

  beforeEach(async () => {
    mockJobs = {
      create: jest.fn().mockResolvedValue(STUB_ROW),
      deleteQuietly: jest.fn().mockResolvedValue(undefined),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    }
    mockProducer = { enqueue: jest.fn().mockResolvedValue(undefined) }

    const module = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: JobsService, useValue: mockJobs },
        { provide: NormalizeProducer, useValue: mockProducer },
      ],
    }).compile()

    service = module.get(IngestionService)
  })

  // ── receiveAlert: basics ────────────────────────────────────────────────

  it('receiveAlert: creates a job, enqueues, returns { jobId, status, deduped: false }', async () => {
    const result = await service.receiveAlert({
      source: 'crowdstrike',
      rawContent: { alert_id: 'test-1' },
    })

    expect(mockJobs.create).toHaveBeenCalledTimes(1)
    const createArg = mockJobs.create.mock.calls[0][0]
    expect(createArg.rawLog).toEqual({ alert_id: 'test-1' })
    expect(createArg.source).toBe('crowdstrike')
    expect(createArg.format).toBe('json')
    // Server-generated UUID when no key supplied
    expect(typeof createArg.idempotencyKey).toBe('string')
    expect(createArg.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)

    expect(mockProducer.enqueue).toHaveBeenCalledWith(STUB_ROW.id)
    expect(result).toEqual({ jobId: STUB_ROW.id, status: 'queued', deduped: false })
  })

  it('receiveAlert: defaults format to "json" when omitted', async () => {
    await service.receiveAlert({
      source: 'crowdstrike',
      rawContent: { x: 1 },
    })
    expect(mockJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'json' }),
    )
  })

  it('receiveAlert: passes through an explicit format', async () => {
    await service.receiveAlert({
      source: 'crowdstrike',
      format: 'cef',
      rawContent: { x: 1 },
    })
    expect(mockJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'cef' }),
    )
  })

  // ── receiveAlert: cleanup on enqueue failure ────────────────────────────

  it('receiveAlert: enqueue failure deletes the orphan row and propagates', async () => {
    mockProducer.enqueue.mockRejectedValueOnce(new Error('Redis down'))

    await expect(
      service.receiveAlert({ source: 'crowdstrike', rawContent: { x: 1 } }),
    ).rejects.toThrow('Redis down')

    expect(mockJobs.deleteQuietly).toHaveBeenCalledWith(STUB_ROW.id)
  })

  it('receiveAlert: still propagates the original error if cleanup also throws', async () => {
    mockProducer.enqueue.mockRejectedValueOnce(new Error('Redis down'))
    mockJobs.deleteQuietly.mockRejectedValueOnce(new Error('DB gone'))

    await expect(
      service.receiveAlert({ source: 'crowdstrike', rawContent: { x: 1 } }),
    ).rejects.toThrow('Redis down')
  })

  // ── receiveAlert: idempotency ───────────────────────────────────────────

  it('idempotency: no key supplied → server generates one, no dedup possible', async () => {
    await service.receiveAlert({ source: 'crowdstrike', rawContent: { x: 1 } })

    expect(mockJobs.findByIdempotencyKey).not.toHaveBeenCalled()
    const generatedKey = mockJobs.create.mock.calls[0][0].idempotencyKey
    expect(generatedKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('idempotency: header key, row does not exist → inserts and enqueues', async () => {
    await service.receiveAlert(
      { source: 'crowdstrike', rawContent: { x: 1 } },
      'client-key-X',
    )

    expect(mockJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'client-key-X' }),
    )
    expect(mockProducer.enqueue).toHaveBeenCalledTimes(1)
    expect(mockJobs.findByIdempotencyKey).not.toHaveBeenCalled()
  })

  it('idempotency: header key, row exists → returns existing row, no second enqueue', async () => {
    mockJobs.create.mockRejectedValueOnce(p2002())
    const existing = { ...STUB_ROW, id: 'existing-uuid', idempotencyKey: 'client-key-X', status: JobStatus.ACTIVE }
    mockJobs.findByIdempotencyKey.mockResolvedValueOnce(existing)

    const result = await service.receiveAlert(
      { source: 'crowdstrike', rawContent: { x: 1 } },
      'client-key-X',
    )

    expect(mockJobs.findByIdempotencyKey).toHaveBeenCalledWith('client-key-X')
    expect(mockProducer.enqueue).not.toHaveBeenCalled()
    expect(result).toEqual({ jobId: 'existing-uuid', status: 'queued', deduped: true })
  })

  it('idempotency: dedup hit returns existing row even when it is FAILED', async () => {
    mockJobs.create.mockRejectedValueOnce(p2002())
    const failed = { ...STUB_ROW, id: 'failed-uuid', idempotencyKey: 'client-key-X', status: JobStatus.FAILED, error: 'inference timeout' }
    mockJobs.findByIdempotencyKey.mockResolvedValueOnce(failed)

    const result = await service.receiveAlert(
      { source: 'crowdstrike', rawContent: { x: 1 } },
      'client-key-X',
    )

    expect(result.jobId).toBe('failed-uuid')
    expect(result.deduped).toBe(true)
    expect(mockProducer.enqueue).not.toHaveBeenCalled()
  })

  it('idempotency: P2002 thrown but no key supplied → propagates the error (does not look up)', async () => {
    mockJobs.create.mockRejectedValueOnce(p2002())

    await expect(
      service.receiveAlert({ source: 'crowdstrike', rawContent: { x: 1 } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)

    expect(mockJobs.findByIdempotencyKey).not.toHaveBeenCalled()
  })

  it('idempotency: concurrent creates with same key — exactly one enqueue', async () => {
    // Simulate the loser losing the race: P2002 then a successful lookup.
    let createCalls = 0
    mockJobs.create.mockImplementation(async (input: any) => {
      createCalls++
      if (createCalls === 1) {
        return { ...STUB_ROW, id: 'winner-uuid', idempotencyKey: input.idempotencyKey }
      }
      throw p2002()
    })
    mockJobs.findByIdempotencyKey.mockResolvedValue({
      ...STUB_ROW,
      id: 'winner-uuid',
      idempotencyKey: 'shared-key',
    })

    const [a, b] = await Promise.all([
      service.receiveAlert({ source: 'crowdstrike', rawContent: { x: 1 } }, 'shared-key'),
      service.receiveAlert({ source: 'crowdstrike', rawContent: { x: 1 } }, 'shared-key'),
    ])

    // Both callers see the same jobId.
    expect(a.jobId).toBe('winner-uuid')
    expect(b.jobId).toBe('winner-uuid')

    // Only the winner enqueued.
    expect(mockProducer.enqueue).toHaveBeenCalledTimes(1)
    expect(mockProducer.enqueue).toHaveBeenCalledWith('winner-uuid')

    // Exactly one of them was deduped.
    expect([a.deduped, b.deduped].sort()).toEqual([false, true])
  })

  // ── receiveBatch ────────────────────────────────────────────────────────

  it('receiveBatch: creates one job per item, enqueues each, returns results', async () => {
    const rowA = { ...STUB_ROW, id: 'uuid-a' }
    const rowB = { ...STUB_ROW, id: 'uuid-b' }
    const rowC = { ...STUB_ROW, id: 'uuid-c' }
    mockJobs.create
      .mockResolvedValueOnce(rowA)
      .mockResolvedValueOnce(rowB)
      .mockResolvedValueOnce(rowC)

    const result = await service.receiveBatch({
      items: [
        { source: 'splunk', rawContent: { a: 1 } },
        { source: 'splunk', rawContent: { a: 2 } },
        { source: 'splunk', rawContent: { a: 3 } },
      ],
    })

    expect(result.count).toBe(3)
    expect(result.results.map((r) => r.jobId)).toEqual(['uuid-a', 'uuid-b', 'uuid-c'])
    expect(mockJobs.create).toHaveBeenCalledTimes(3)
    expect(mockProducer.enqueue).toHaveBeenCalledTimes(3)
  })

  it('receiveBatch: per-item idempotencyKey is forwarded to JobsService.create', async () => {
    await service.receiveBatch({
      items: [
        { source: 'splunk', rawContent: { a: 1 }, idempotencyKey: 'k1' },
        { source: 'splunk', rawContent: { a: 2 } },
      ],
    })

    expect(mockJobs.create.mock.calls[0][0].idempotencyKey).toBe('k1')
    // Second item has no key → server-generated UUID
    expect(mockJobs.create.mock.calls[1][0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('receiveBatch: a dedup hit on one item still allows the rest to enqueue', async () => {
    const winning = { ...STUB_ROW, id: 'fresh-uuid' }
    const existing = { ...STUB_ROW, id: 'dedup-uuid', idempotencyKey: 'k-existing' }
    mockJobs.create
      .mockResolvedValueOnce(winning)
      .mockRejectedValueOnce(p2002())
    mockJobs.findByIdempotencyKey.mockResolvedValueOnce(existing)

    const result = await service.receiveBatch({
      items: [
        { source: 'splunk', rawContent: { a: 1 } },
        { source: 'splunk', rawContent: { a: 2 }, idempotencyKey: 'k-existing' },
      ],
    })

    expect(result.results.map((r) => r.jobId)).toEqual(['fresh-uuid', 'dedup-uuid'])
    expect(result.results.map((r) => r.deduped)).toEqual([false, true])
    // Only the fresh item enqueued.
    expect(mockProducer.enqueue).toHaveBeenCalledTimes(1)
  })

  it('receiveBatch: a mid-batch enqueue failure aborts and propagates', async () => {
    const rowA = { ...STUB_ROW, id: 'uuid-a' }
    const rowB = { ...STUB_ROW, id: 'uuid-b' }
    mockJobs.create.mockResolvedValueOnce(rowA).mockResolvedValueOnce(rowB)
    mockProducer.enqueue
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Redis down'))

    await expect(
      service.receiveBatch({
        items: [
          { source: 'splunk', rawContent: { a: 1 } },
          { source: 'splunk', rawContent: { a: 2 } },
          { source: 'splunk', rawContent: { a: 3 } },
        ],
      }),
    ).rejects.toThrow('Redis down')

    expect(mockJobs.deleteQuietly).toHaveBeenCalledWith('uuid-b')
    expect(mockJobs.create).toHaveBeenCalledTimes(2)
  })
})
