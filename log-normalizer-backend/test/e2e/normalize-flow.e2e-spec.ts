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
import cookieParser from 'cookie-parser'
import IORedis from 'ioredis'
import request from 'supertest'
import { AppModule } from 'src/app.module'
import { AuthService } from 'src/auth/auth.service'
import { PrismaService } from 'src/database/prisma.service'
import { SQSClientService } from 'src/delivery/sqs-client.service'
import { NORMALIZE_QUEUE } from 'src/queue/queue-names'
import { SLMService } from 'src/slm/slm.service'
import { WorkerModule } from 'src/worker/worker.module'
import { JobStatus, UserRole } from 'generated/prisma/client'
import { SLMResponse } from 'src/common/interfaces/slm-response.interface'
import { cleanDatabase } from 'test/helper/prisma-test'

const TEST_USER_EMAIL = 'flow-analyst@e2e.test'
const TEST_USER_PASSWORD = 'flow-test-pw-1'

const SUCCESS_RESPONSE: SLMResponse = {
  ocsf: {
    class_uid: 2004,
    class_name: 'Detection Finding',
    activity_id: 1,
    severity_id: 3,
    type_uid: 200401,
  },
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
  source: 'crowdstrike',
  format: 'json',
  rawContent: { alert_id: 'e2e-1', severity: 'high' },
}

interface JobResponseShape {
  jobId: string
  status: JobStatus
  parentJobId: string | null
  result: { decision: string; confidence: number } | null
  error: string | null
  fixesApplied: string[]
  hallucinationsStripped: string[]
}

describe('Normalize async flow E2E', () => {
  let httpApp: INestApplication
  let workerApp: TestingModule
  let prisma: PrismaService
  let queue: Queue
  let slmMock: { normalize: jest.Mock }
  let sqsMock: { publish: jest.Mock }
  let authCookie: string

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
    // Mock SQS so the routing chain's handleAccept doesn't try to load
    // the AWS SDK under Jest's CJS VM (which can't handle the SDK's
    // dynamic ESM imports). Production code is unaffected.
    sqsMock = { publish: jest.fn().mockResolvedValue('mock-msg-id') }

    // ── HTTP context (AppModule) ───────────────────────────────────────
    const httpModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SLMService)
      .useValue(slmMock)
      .overrideProvider(SQSClientService)
      .useValue(sqsMock)
      .compile()

    httpApp = httpModule.createNestApplication()
    httpApp.setGlobalPrefix('api')
    httpApp.use(cookieParser())
    httpApp.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    await httpApp.init()

    prisma = httpModule.get(PrismaService)
    queue = httpModule.get<Queue>(getQueueToken(NORMALIZE_QUEUE))

    // Seed an analyst user and capture an auth cookie for the JWT-only
    // retry endpoint. Idempotent — survives across runs.
    const authService = httpModule.get(AuthService)
    try {
      await authService.createUser({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        role: UserRole.ANALYST,
      })
    } catch {
      /* user already exists from a prior run */
    }
    const loginRes = await request(httpApp.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })
      .expect(200)
    authCookie = loginRes.headers['set-cookie']?.[0] ?? ''
    if (!authCookie) throw new Error('Login did not return an auth cookie')

    // ── Worker context (WorkerModule) ──────────────────────────────────
    // Same SLM mock instance — both contexts see the same controlled
    // behaviour, and per-test mockResolvedValue / mockRejectedValue
    // calls flow through to the worker's processor.
    workerApp = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(SLMService)
      .useValue(slmMock)
      .overrideProvider(SQSClientService)
      .useValue(sqsMock)
      .compile()

    // TestingModule extends NestApplicationContext — init() runs lifecycle
    // hooks, which is what registers the BullMQ Worker via @Processor.
    await workerApp.init()
  }, 30_000)

  beforeEach(async () => {
    slmMock.normalize.mockReset()
    sqsMock.publish.mockReset().mockResolvedValue('mock-msg-id')
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
      .post('/api/logs/ingest')
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
      raw_log: SAMPLE_PAYLOAD.rawContent,
      source: SAMPLE_PAYLOAD.source,
      format: SAMPLE_PAYLOAD.format,
    })

    // Routing chain ran: OCSFEvent + ProcessingMetric exist for the job
    const ocsf = await prisma.oCSFEvent.findUnique({ where: { normalizeJobId: jobId } })
    expect(ocsf).not.toBeNull()
    expect(ocsf!.confidence).toBeCloseTo(0.92)

    // SQS publish was triggered for the accept decision (with dedupId = jobId)
    expect(sqsMock.publish).toHaveBeenCalledTimes(1)
    expect(sqsMock.publish).toHaveBeenCalledWith(SUCCESS_RESPONSE.ocsf, jobId)
    expect(ocsf!.publishedToSqs).toBe(true)
    expect(ocsf!.sqsMessageId).toBe('mock-msg-id')
  }, 30_000)

  it('post-processor audit trail survives the full pipeline and is exposed via GET', async () => {
    slmMock.normalize.mockResolvedValueOnce({
      ...SUCCESS_RESPONSE,
      fixes_applied: [
        'moved finding_info.severity_id to root',
        'forced metadata.version to 1.7.0',
      ],
      hallucinations_stripped: [
        'stripped hallucinated device.hostname (looks like email): user@example.com',
      ],
    })

    const jobId = await enqueue()
    const final = await waitForTerminal(jobId)

    expect(final.status).toBe('COMPLETED')
    expect(final.fixesApplied).toEqual([
      'moved finding_info.severity_id to root',
      'forced metadata.version to 1.7.0',
    ])
    expect(final.hallucinationsStripped).toEqual([
      'stripped hallucinated device.hostname (looks like email): user@example.com',
    ])

    const row = await prisma.normalizeJob.findUniqueOrThrow({ where: { id: jobId } })
    expect(row.fixesApplied).toEqual([
      'moved finding_info.severity_id to root',
      'forced metadata.version to 1.7.0',
    ])
    expect(row.hallucinationsStripped).toEqual([
      'stripped hallucinated device.hostname (looks like email): user@example.com',
    ])
  }, 30_000)

  it('SLM throws on all 3 attempts → worker marks the row FAILED with attempt count', async () => {
    // mockRejectedValue (not Once) — all retries fail with the same error.
    slmMock.normalize.mockRejectedValue(new Error('circuit open'))

    const jobId = await enqueue()
    const final = await waitForTerminal(jobId, 60_000)

    expect(final.status).toBe('FAILED')
    expect(final.result).toBeNull()
    expect(final.error).toContain('circuit open')
    expect(final.error).toContain('attempt 3/3')
    // SLM was actually called 3 times (Week 2 retry policy)
    expect(slmMock.normalize).toHaveBeenCalledTimes(3)
  }, 90_000)

  it('SLM returns 200 with error+null ocsf on all 3 attempts → FAILED with attempt count', async () => {
    slmMock.normalize.mockResolvedValue({
      ...SUCCESS_RESPONSE,
      ocsf: null,
      error: 'validation rejected all candidates',
    })

    const jobId = await enqueue()
    const final = await waitForTerminal(jobId, 60_000)

    expect(final.status).toBe('FAILED')
    expect(final.result).toBeNull()
    expect(final.error).toContain('validation rejected all candidates')
    expect(final.error).toContain('attempt 3/3')
  }, 90_000)

  it('transient SLM failure on first 2 attempts then success → COMPLETED on attempt 3', async () => {
    slmMock.normalize
      .mockRejectedValueOnce(new Error('circuit open'))
      .mockRejectedValueOnce(new Error('circuit open'))
      .mockResolvedValueOnce(SUCCESS_RESPONSE)

    const jobId = await enqueue()
    const final = await waitForTerminal(jobId, 60_000)

    expect(final.status).toBe('COMPLETED')
    expect(final.error).toBeNull()
    expect(final.result?.decision).toBe('accept')
    expect(slmMock.normalize).toHaveBeenCalledTimes(3)

    // attempts column reflects all 3 claim attempts
    const row = await prisma.normalizeJob.findUniqueOrThrow({ where: { id: jobId } })
    expect(row.attempts).toBe(3)
  }, 90_000)

  // ── Retry endpoint ───────────────────────────────────────────────────

  it('full retry flow: original FAILS all 3 attempts, retry runs and COMPLETES', async () => {
    // First job: fail all 3 attempts
    slmMock.normalize.mockRejectedValue(new Error('circuit open'))
    const originalId = await enqueue()
    const originalFinal = await waitForTerminal(originalId, 60_000)
    expect(originalFinal.status).toBe('FAILED')

    // Reset the mock so the retry succeeds
    slmMock.normalize.mockReset()
    slmMock.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE)

    // POST /retry on the failed source — JWT only
    const retryRes = await request(httpApp.getHttpServer())
      .post(`/api/normalize/jobs/${originalId}/retry`)
      .set('Cookie', authCookie)
      .expect(202)

    const childId = retryRes.body.jobId
    expect(childId).toMatch(/^[0-9a-f-]{36}$/)
    expect(childId).not.toBe(originalId)
    expect(retryRes.body.parentJobId).toBe(originalId)

    // Wait for the retry to finish — should succeed
    const childFinal = await waitForTerminal(childId, 60_000)
    expect(childFinal.status).toBe('COMPLETED')
    expect(childFinal.parentJobId).toBe(originalId)
    expect(childFinal.result?.decision).toBe('accept')

    // Both rows exist in the DB with correct statuses
    const [originalRow, childRow] = await Promise.all([
      prisma.normalizeJob.findUniqueOrThrow({ where: { id: originalId } }),
      prisma.normalizeJob.findUniqueOrThrow({ where: { id: childId } }),
    ])
    expect(originalRow.status).toBe('FAILED')
    expect(childRow.status).toBe('COMPLETED')
    expect(childRow.parentJobId).toBe(originalId)
  }, 120_000)

  it('POST /retry on a non-FAILED job returns 409', async () => {
    slmMock.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE)
    const jobId = await enqueue()
    await waitForTerminal(jobId, 60_000) // wait until COMPLETED

    await request(httpApp.getHttpServer())
      .post(`/api/normalize/jobs/${jobId}/retry`)
      .set('Cookie', authCookie)
      .expect(409)
  }, 90_000)

  it('POST /retry on an unknown UUID returns 404', async () => {
    await request(httpApp.getHttpServer())
      .post('/api/normalize/jobs/00000000-0000-4000-8000-000000000000/retry')
      .set('Cookie', authCookie)
      .expect(404)
  })

  it('POST /retry without auth (no cookie, no api key) returns 401', async () => {
    await request(httpApp.getHttpServer())
      .post('/api/normalize/jobs/00000000-0000-4000-8000-000000000000/retry')
      .expect(401)
  })

  it('POST /retry with API key only returns 401 (retry is human-only)', async () => {
    await request(httpApp.getHttpServer())
      .post('/api/normalize/jobs/00000000-0000-4000-8000-000000000000/retry')
      .set('x-api-key', process.env.API_KEY!)
      .expect(401)
  })

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
