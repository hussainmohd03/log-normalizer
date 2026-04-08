import { Test } from '@nestjs/testing'
import { JobStatus } from 'generated/prisma/client'
import { IngestionService } from 'src/ingestion/ingestion.service'
import { JobsService } from 'src/jobs/jobs.service'
import { NormalizeProducer } from 'src/queue/normalize.producer'

const STUB_ROW = {
  id: 'job-uuid-1',
  status: JobStatus.QUEUED,
  rawLog: { alert_id: 'test-1' },
  source: 'crowdstrike',
  format: 'json',
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

describe('IngestionService', () => {
  let service: IngestionService
  let mockJobs: { create: jest.Mock; deleteQuietly: jest.Mock }
  let mockProducer: { enqueue: jest.Mock }

  beforeEach(async () => {
    mockJobs = {
      create: jest.fn().mockResolvedValue(STUB_ROW),
      deleteQuietly: jest.fn().mockResolvedValue(undefined),
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

  // ── receiveAlert ────────────────────────────────────────────────────────

  it('receiveAlert: creates a job, enqueues, returns { jobId, status }', async () => {
    const result = await service.receiveAlert({
      source: 'crowdstrike',
      rawContent: { alert_id: 'test-1' },
    })

    expect(mockJobs.create).toHaveBeenCalledWith({
      rawLog: { alert_id: 'test-1' },
      source: 'crowdstrike',
      format: 'json',
    })
    expect(mockProducer.enqueue).toHaveBeenCalledWith(STUB_ROW.id)
    expect(result).toEqual({ jobId: STUB_ROW.id, status: 'queued' })
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

  it('receiveAlert: enqueue failure deletes the orphan row and propagates the error', async () => {
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

  // ── receiveBatch ────────────────────────────────────────────────────────

  it('receiveBatch: creates one job per alert, enqueues each, returns jobIds', async () => {
    const rowA = { ...STUB_ROW, id: 'uuid-a' }
    const rowB = { ...STUB_ROW, id: 'uuid-b' }
    const rowC = { ...STUB_ROW, id: 'uuid-c' }
    mockJobs.create
      .mockResolvedValueOnce(rowA)
      .mockResolvedValueOnce(rowB)
      .mockResolvedValueOnce(rowC)

    const result = await service.receiveBatch({
      source: 'splunk',
      alerts: [{ a: 1 }, { a: 2 }, { a: 3 }],
    })

    expect(result.count).toBe(3)
    expect(result.status).toBe('queued')
    expect(result.jobIds).toEqual(['uuid-a', 'uuid-b', 'uuid-c'])
    expect(mockJobs.create).toHaveBeenCalledTimes(3)
    expect(mockProducer.enqueue).toHaveBeenCalledTimes(3)
    expect(mockProducer.enqueue).toHaveBeenCalledWith('uuid-a')
    expect(mockProducer.enqueue).toHaveBeenCalledWith('uuid-b')
    expect(mockProducer.enqueue).toHaveBeenCalledWith('uuid-c')
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
        source: 'splunk',
        alerts: [{ a: 1 }, { a: 2 }, { a: 3 }],
      }),
    ).rejects.toThrow('Redis down')

    // First succeeded, second failed → cleanup deletes the second's row.
    // The third was never created.
    expect(mockJobs.deleteQuietly).toHaveBeenCalledWith('uuid-b')
    expect(mockJobs.create).toHaveBeenCalledTimes(2)
  })
})
