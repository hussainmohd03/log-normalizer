// test/e2e/app.e2e-spec.ts
import { Test } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from 'src/app.module'
import { PrismaService } from 'src/database/prisma.service'
import { cleanDatabase } from 'test/helper/prisma-test'

describe('App E2E', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }))
    await app.init()

    prisma = module.get(PrismaService)
  })

  beforeEach(async () => {
    await cleanDatabase(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  // -- Health --
  it('GET /api/health returns ok', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)

    expect(res.body.status).toBe('ok')
    expect(res.body.database).toBe('connected')
  })

  // -- Auth --
  it('POST /api/logs/ingest without API key returns 401', async () => {
    await request(app.getHttpServer())
      .post('/api/logs/ingest')
      .send({ source: 'test', rawContent: { alert: 'test' } })
      .expect(401)
  })

  // -- Ingestion --
  it('POST /api/logs/ingest with valid body returns 202 and a queued NormalizeJob', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/logs/ingest')
      .set('x-api-key', process.env.API_KEY!)
      .send({ source: 'crowdstrike', rawContent: { alert_id: '123' } })
      .expect(202)

    expect(res.body.jobId).toBeDefined()
    expect(res.body.status).toBe('queued')

    const stored = await prisma.normalizeJob.findUnique({ where: { id: res.body.jobId } })
    expect(stored).not.toBeNull()
    expect(stored!.source).toBe('crowdstrike')
  })

  // -- Validation --
  it('POST /api/logs/ingest with missing source returns 400', async () => {
    await request(app.getHttpServer())
      .post('/api/logs/ingest')
      .set('x-api-key', process.env.API_KEY!)
      .send({ rawContent: { alert_id: '123' } })
      .expect(400)
  })

  it('POST /api/logs/ingest with empty rawContent returns 400', async () => {
    await request(app.getHttpServer())
      .post('/api/logs/ingest')
      .set('x-api-key', process.env.API_KEY!)
      .send({ source: 'test', rawContent: {} })
      .expect(400)
  })

  it('POST /api/logs/ingest with unknown field returns 400', async () => {
    await request(app.getHttpServer())
      .post('/api/logs/ingest')
      .set('x-api-key', process.env.API_KEY!)
      .send({ source: 'test', rawContent: { alert: 'test' }, hacker: 'me' })
      .expect(400)
  })

  // -- Batch --
  it('POST /api/logs/ingest/batch with valid body returns 202', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/logs/ingest/batch')
      .set('x-api-key', process.env.API_KEY!)
      .send({
        items: [
          { source: 'splunk', rawContent: { alert_id: '1' } },
          { source: 'splunk', rawContent: { alert_id: '2' } },
        ],
      })
      .expect(202)

    expect(res.body.count).toBe(2)
    expect(res.body.status).toBe('queued')
    expect(res.body.jobIds).toHaveLength(2)
    expect(res.body.jobIds[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  // -- Idempotency --
  it('POST /api/logs/ingest with the same Idempotency-Key returns the same jobId', async () => {
    const key = 'e2e-key-' + Date.now()
    const body = { source: 'crowdstrike', rawContent: { alert_id: 'idem-1' } }

    const first = await request(app.getHttpServer())
      .post('/api/logs/ingest')
      .set('x-api-key', process.env.API_KEY!)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(202)

    const second = await request(app.getHttpServer())
      .post('/api/logs/ingest')
      .set('x-api-key', process.env.API_KEY!)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(202)

    expect(first.body.jobId).toBe(second.body.jobId)

    // Exactly one row exists for that key.
    const rows = await prisma.normalizeJob.findMany({
      where: { idempotencyKey: key },
    })
    expect(rows).toHaveLength(1)
  })

  // -- Metrics --
  it('GET /api/metrics/overview returns zeroes on empty DB', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/metrics/overview')
      .set('x-api-key', process.env.API_KEY!)
      .expect(200)

    expect(res.body.totalLogs).toBe(0)
  })
})