// test/e2e/normalize-flow.e2e-spec.ts
//
// Full async-pipeline integration test:
//   POST /api/logs/ingest → Postgres → BullMQ/Redis → Worker → Postgres
//
// What is real:
//   - Postgres (via PrismaService)
//   - Redis + BullMQ (real queue, real worker)
//   - HTTP layer via supertest (for the ingest endpoint only)
//
// What is mocked:
//   - SLMService (the only external dependency we don't want in CI)
//   - SQSClientService (so the routing chain doesn't need AWS creds)
//
// Job state is observed by polling Prisma directly — there is no
// HTTP-side jobs endpoint anymore. The worker contract is what we're
// testing, not the (deleted) read API.
//
// PREREQUISITES (must be running before `npm run test:e2e`):
//   - Postgres at DATABASE_URL
//   - Redis    at REDIS_URL
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
import { PrismaService } from 'src/database/prisma.service'
import { SQSClientService } from 'src/delivery/sqs-client.service'
import { NORMALIZE_QUEUE } from 'src/queue/queue-names'
import { SLMService } from 'src/slm/slm.service'
import { WorkerModule } from 'src/worker/worker.module'
import { NormalizeJob } from 'generated/prisma/client'
import { SLMResponse } from 'src/common/interfaces/slm-response.interface'
import { cleanDatabase } from 'test/helper/prisma-test'

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

describe('Normalize async flow E2E', () => {
  let httpApp: INestApplication
  let workerApp: TestingModule
  let prisma: PrismaService
  let queue: Queue
  let slmMock: { normalize: jest.Mock }
  let sqsMock: { publish: jest.Mock }

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

    // - HTTP context (AppModule) -------------------
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

    // - Worker context (WorkerModule) -----------------
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

  // - Helpers -----------------------------

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

  const fetchJob = (jobId: string): Promise<NormalizeJob> =>
    prisma.normalizeJob.findUniqueOrThrow({ where: { id: jobId } })

  const waitForTerminal = async (jobId: string, timeoutMs = 15_000): Promise<NormalizeJob> => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const job = await fetchJob(jobId)
      if (job.status === 'COMPLETED' || job.status === 'FAILED') return job
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`Job ${jobId} did not reach a terminal state within ${timeoutMs}ms`)
  }

  // - Tests ------------------------------

  it('happy path: enqueue → worker processes → row reaches COMPLETED with result', async () => {
    slmMock.normalize.mockResolvedValueOnce(SUCCESS_RESPONSE)

    const jobId = await enqueue()
    const final = await waitForTerminal(jobId)

    expect(final.status).toBe('COMPLETED')
    expect(final.decision).toBe('accept')
    expect(final.confidence).toBeCloseTo(0.92)
    expect(final.error).toBeNull()
    expect(slmMock.normalize).toHaveBeenCalledTimes(1)
    expect(slmMock.normalize).toHaveBeenCalledWith({
      raw_log: SAMPLE_PAYLOAD.rawContent,
      source: SAMPLE_PAYLOAD.source,
      format: SAMPLE_PAYLOAD.format,
    })

    // Routing chain ran: OCSFEvent + ProcessingMetric exist for the job
    const ocsf = await prisma.oCSFEvent.findFirst({ where: { normalizeJobId: jobId } })
    expect(ocsf).not.toBeNull()
    expect(ocsf!.confidence).toBeCloseTo(0.92)

    // SQS publish was triggered for the accept decision (with dedupId = jobId)
    expect(sqsMock.publish).toHaveBeenCalledTimes(1)
    expect(sqsMock.publish).toHaveBeenCalledWith(SUCCESS_RESPONSE.ocsf, jobId)
    expect(ocsf!.publishedToSqs).toBe(true)
    expect(ocsf!.sqsMessageId).toBe('mock-msg-id')
  }, 30_000)

  it('post-processor audit trail survives the full pipeline', async () => {
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
  }, 30_000)

  it('SLM throws on all 3 attempts → worker marks the row FAILED with attempt count', async () => {
    // mockRejectedValue (not Once) — all retries fail with the same error.
    slmMock.normalize.mockRejectedValue(new Error('circuit open'))

    const jobId = await enqueue()
    const final = await waitForTerminal(jobId, 60_000)

    expect(final.status).toBe('FAILED')
    expect(final.decision).toBeNull()
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
    expect(final.decision).toBeNull()
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
    expect(final.decision).toBe('accept')
    expect(slmMock.normalize).toHaveBeenCalledTimes(3)

    // attempts column reflects all 3 claim attempts
    expect(final.attempts).toBe(3)
  }, 90_000)
})
