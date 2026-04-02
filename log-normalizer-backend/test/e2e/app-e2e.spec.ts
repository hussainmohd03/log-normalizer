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
  it('POST /api/logs/ingest with valid body returns 202', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/logs/ingest')
      .set('x-api-key', process.env.API_KEY!)
      .send({ source: 'crowdstrike', rawContent: { alert_id: '123' } })
      .expect(202)

    expect(res.body.id).toBeDefined()
    expect(res.body.status).toBe('accepted')

    const stored = await prisma.rawLog.findUnique({ where: { id: res.body.id } })
    expect(stored).not.toBeNull()
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
        source: 'splunk',
        alerts: [{ alert_id: '1' }, { alert_id: '2' }],
      })
      .expect(202)

    expect(res.body.count).toBe(2)
    expect(res.body.status).toBe('accepted')
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