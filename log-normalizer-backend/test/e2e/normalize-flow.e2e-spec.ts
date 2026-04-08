// test/e2e/normalize-flow.e2e-spec.ts
//
// Full async-pipeline integration test:
//   POST /api/normalize → Postgres → BullMQ/Redis → Worker → Postgres → polling endpoint
//
// What is real:
//   - Postgres (via PrismaService)
//   - Redis + BullMQ (real queue, real worker)
//   - HTTP layer via supertest
//
// What is mocked:
//   - SLMService (the only external dependency we don't want in CI)
//
// PREREQUISITES (must be running before `npm run test:e2e`):
//   - Postgres at DATABASE_URL (default postgresql://postgres:12345678@localhost:5432/lognormalizer_test)
//   - Redis    at REDIS_URL    (default redis://localhost:6379)
//
// If either is unreachable, the suite fails fast in beforeAll with a
// clear message instead of timing out on BullMQ's reconnect loop.
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { Test, TestingModule } from '@nestjs/testing'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import request from 'supertest'
import { AppModule } from 'src/app.module'
import { PrismaService } from 'src/database/prisma.service'
import { NORMALIZE_QUEUE } from 'src/queue/queue-names'
import { SLMService } from 'src/slm/slm.service'
import { WorkerModule } from 'src/worker/worker.module'
import { JobStatus } from 'generated/prisma/client'
import { SLMResponse } from 'src/common/interfaces/slm-response.interface'
import { cleanDatabase } from 'test/helper/prisma-test'

const SUCCESS_RESPONSE: SLMResponse = {
  ocsf: { class_uid: 2004, type_uid: 200401 },
  confidence: 0.92,
  processing_time_ms: 175,
  decision: 'accept',
  breakdown: {
    schema_validity: 1,
    field_coverage: 0.95,
    value_consistency: 0.9,
  },
  validation_errors: [],
  error: null,
}

const SAMPLE_PAYLOAD = {
  rawLog: '{"alert_id":"e2e-1","severity":"high"}',
  source: 'crowdstrike',
  format: 'json',
}

interface JobResponseShape {
  jobId: string
  status: JobStatus
  result: { decision: string; confidence: number } | null
  error: string | null
}

describe('Normalize async flow E2E', () => {
  let httpApp: INestApplication
  let workerApp: TestingModule
  let prisma: PrismaService
  let queue: Queue
  let slmMock: { normalize: jest.Mock }

  beforeAll(async () => {
    // Fail fast if Redis is unreachable so we get a clear error instead
    // of a 30s timeout buried in BullMQ reconnect noise.
    const probe = new IORedis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 1000,
    })
    try {
      await probe.connect()
      await probe.ping()
    } catch (err) {
      throw new Error(
        `Cannot reach Redis at ${process.env.REDIS_URL}. ` +
          `Start Redis (e.g. \`docker run -p 6379:6379 redis\`) before running the e2e suite. ` +
          `Underlying error: ${(err as Error).message}`,
      )
    } finally {
      probe.disconnect()
    }

    slmMock = { normalize: jest.fn() }

    // ── HTTP context (AppModule) ───────────────────────────────────────
    const httpModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SLMService)
      .useValue(slmMock)
      .compile()

    httpApp = httpModule.createNestApplication()
    httpApp.setGlobalPrefix('api')
    httpApp.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    await httpApp.init()

    prisma = httpModule.get(PrismaService)
    queue = httpModule.get<Queue>(getQueueToken(NORMALIZE_QUEUE))

    // ── Worker context (WorkerModule) ──────────────────────────────────
    // Same SLM mock instance — both contexts see the same controlled
    // behaviour, and per-test mockResolvedValue / mockRejectedValue
    // calls flow through to the worker's processor.
    workerApp = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(SLMService)
      .useValue(slmMock)
      .compile()

    // TestingModule extends NestApplicationContext — init() runs lifecycle
    // hooks, which is what registers the BullMQ Worker via @Processor.
    await workerApp.init()
  }, 30_000)

  beforeEach(async () => {
    slmMock.normalize.mockReset()
    await cleanDatabase(prisma)
    await queue.obliterate({ force: true })
  })

  afterAll(async () => {
    if (queue) await queue.obliterate({ force: true }).catch(() => undefined)
    if (workerApp) await workerApp.close()
    if (httpApp) await httpApp.close()
  })

  // ── Helpers ──────────────────────────────────────────────────────────

  const enqueue = async () => {
    const res = await request(httpApp.getHttpServer())
      .post('/api/normalize')
      .set('x-api-key', process.env.API_KEY!)
      .send(SAMPLE_PAYLOAD)
      .expect(202)
    expect(res.body.jobId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.status).toBe('queued')
    return res.body.jobId as string
  }

  const fetchJob = async (jobId: string): Promise<JobResponseShape> => {
    const res = await request(httpApp.getHttpServer())
      .get(`/api/normalize/jobs/${jobId}`)
      .set('x-api-key', process.env.API_KEY!)
      .expect(200)
    return res.body as JobResponseShape
  }

  const waitForTerminal = async (jobId: string, timeoutMs = 15_000): Promise<JobResponseShape> => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const job = await fetchJob(jobId)
      if (job.status === 'COMPLETED' || job.status === 'FAILED') return job
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`Job ${jobId} did not reach a terminal state within ${timeoutMs}ms`)
  }

  // ── Tests ────────────────────────────────────────────────────────────

  it('happy path: enqueue → worker processes → row reaches COMPLETED with result', async () => {
    slmMock.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE)

    const jobId = await enqueue()
    const final = await waitForTerminal(jobId)

    expect(final.status).toBe('COMPLETED')
    expect(final.result).not.toBeNull()
    expect(final.result?.decision).toBe('accept')
    expect(final.result?.confidence).toBeCloseTo(0.92)
    expect(final.error).toBeNull()
    expect(slmMock.normalize).toHaveBeenCalledTimes(1)
    expect(slmMock.normalize).toHaveBeenCalledWith({
      raw_log: SAMPLE_PAYLOAD.rawLog,
      source: SAMPLE_PAYLOAD.source,
      format: SAMPLE_PAYLOAD.format,
    })
  }, 30_000)

  it('SLM throws → worker marks the row FAILED with the error message', async () => {
    slmMock.normalize.mockRejectedValueOnce(new Error('circuit open'))

    const jobId = await enqueue()
    const final = await waitForTerminal(jobId)

    expect(final.status).toBe('FAILED')
    expect(final.result).toBeNull()
    expect(final.error).toBe('circuit open')
  }, 30_000)

  it('SLM returns 200 with error+null ocsf → worker marks the row FAILED', async () => {
    slmMock.normalize.mockResolvedValueOnce({
      ...SUCCESS_RESPONSE,
      ocsf: null,
      error: 'validation rejected all candidates',
    })

    const jobId = await enqueue()
    const final = await waitForTerminal(jobId)

    expect(final.status).toBe('FAILED')
    expect(final.result).toBeNull()
    expect(final.error).toBe('validation rejected all candidates')
  }, 30_000)

  it('GET /api/normalize/jobs/:id with unknown UUID returns 404', async () => {
    await request(httpApp.getHttpServer())
      .get('/api/normalize/jobs/00000000-0000-4000-8000-000000000000')
      .set('x-api-key', process.env.API_KEY!)
      .expect(404)
  })

  it('GET /api/normalize/jobs/:id with malformed id returns 400', async () => {
    await request(httpApp.getHttpServer())
      .get('/api/normalize/jobs/not-a-uuid')
      .set('x-api-key', process.env.API_KEY!)
      .expect(400)
  })
})
