# log-normalizer-backend

NestJS backend. Runs as **two separate Node processes from the same built image**: the HTTP API and the BullMQ worker.

This README assumes you've read the [root README](../README.md) for context on the overall architecture. Here we go deep on the backend specifically.

---

## Two-process architecture

This is the most important thing to understand about this service.

```
                 ┌──────────────────────────┐
                 │   NestJS AppModule       │
                 │   (HTTP process)         │
                 │                          │
                 │   - REST endpoints       │
                 │   - JWT auth + cookies   │
                 │   - SSE endpoint         │
                 │   - BullMQ QueueEvents   │ ◄── Redis pub/sub
                 │     listener             │
                 │   - Reconciliation cron  │
                 └──────────────────────────┘
                              ▲
                              │
                    ┌─────────┴──────────┐
                    │  Same built image  │
                    │  Different CMD     │
                    └─────────┬──────────┘
                              ▼
                 ┌──────────────────────────┐
                 │   NestJS WorkerModule    │
                 │   (worker process)       │
                 │                          │
                 │   - NormalizeProcessor   │
                 │   - SLM HTTP client      │
                 │   - concurrency: 1       │
                 │   - No HTTP server       │
                 └──────────────────────────┘
                              ▲
                              │
                              ▼
                 ┌──────────────────────────┐
                 │   Redis (BullMQ jobs)    │
                 └──────────────────────────┘
```

The HTTP process handles requests and publishes jobs to the queue. The worker process pulls jobs from the queue and runs them. They communicate about job state transitions via **Redis pub/sub**, not in-memory events - they are separate Node processes with separate memory spaces.

The practical consequence: if you're debugging a "job was enqueued but never ran" issue, check **both** process logs. The HTTP process owns the enqueue step; the worker process owns everything after.

In dev, `npm run dev` uses `concurrently` to run both processes side-by-side in the same terminal with different-colored output. In production (Docker Compose), they run as separate containers from the same image with different `CMD` overrides:

- HTTP: `node dist/src/main` (the default)
- Worker: `node dist/src/worker`
- Migrations: `npx prisma migrate deploy` (dedicated one-shot service)

---

## Module layout

```
src/
├── main.ts                         # HTTP entrypoint (AppModule bootstrap)
├── worker.ts                       # Worker entrypoint (WorkerModule bootstrap)
├── app.module.ts                   # HTTP app composition
├── worker.module.ts                # Worker app composition (minimal)
│
├── auth/                           # JWT + API key + roles
│   ├── auth.module.ts
│   ├── auth.service.ts             # argon2 hashing, token signing, user resolution
│   ├── auth.controller.ts          # login, logout, me
│   ├── strategies/
│   │   ├── jwt.strategy.ts         # Reads cookie first, then Bearer header
│   │   └── api-key.strategy.ts     # passport-headerapikey
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── api-key-auth.guard.ts
│   │   ├── jwt-or-api-key-auth.guard.ts
│   │   └── roles.guard.ts
│   └── decorators/
│       ├── roles.decorator.ts
│       └── current-user.decorator.ts
│
├── users/                          # Admin-only user management
│   ├── users.module.ts
│   ├── users.controller.ts         # list, create, delete
│   └── users.service.ts            # includes self-delete + last-admin guards
│
├── jobs/                           # Job state, SSE, browse
│   ├── jobs.module.ts
│   ├── jobs.service.ts             # Prisma CRUD on NormalizeJob
│   ├── jobs.controller.ts          # GET /jobs, GET /jobs/:id, SSE at /jobs/:id/events
│   ├── jobs-browse.service.ts      # filtering and pagination for /jobs
│   ├── jobs-events.service.ts      # QueueEvents listener (cross-process state sync)
│   └── job-response.mapper.ts      # DB row → API DTO
│
├── ingestion/                      # POST /logs/ingest + idempotency
│   ├── ingestion.module.ts
│   ├── ingestion.controller.ts
│   └── ingestion.service.ts        # idempotency-key dedup, enqueue
│
├── queue/                          # BullMQ producer
│   ├── queue.module.ts
│   ├── queue-names.ts              # enum of queue names
│   └── normalize.producer.ts       # queue.add() with jobId === row.id
│
├── worker/                         # BullMQ consumer (loaded only by worker process)
│   ├── worker.module.ts
│   └── normalize.processor.ts      # the heart of the async path
│
├── normalize/                      # SLM HTTP client
│   └── slm.service.ts              # opossum circuit breaker, HTTP to Python
│
├── routing/                        # Decision: accept / review / reject
│   ├── routing.module.ts
│   └── routing.service.ts          # creates OCSFEvent, ProcessingMetric, ManualReview
│
├── review/                         # Manual review queue + corrections
│   ├── review.module.ts
│   ├── review.controller.ts        # incl. POST /jobs/:id/flag-for-review
│   └── review.service.ts           # submitCorrection: republish via supersedes chain
│
├── reconciliation/                 # Scheduled orphan sweep
│   ├── reconciliation.module.ts
│   └── reconciliation.service.ts   # @Cron, three sweeps
│
├── training-data/                  # Admin training export loop
│   ├── training-data.module.ts
│   ├── training-data.controller.ts
│   ├── training-data.service.ts
│   └── training-prompt.constant.ts # EXACT copy of SLM system prompt
│
├── sqs/                            # Downstream publish to the SOC platform
│   └── sqs-client.service.ts       # publish() supports custom message attributes
│
├── metrics/                        # Dashboard metrics
│   ├── metrics.module.ts
│   └── metrics.service.ts
│
├── health/                         # /health + SLM health passthrough
│   └── health.controller.ts
│
└── prisma/
    ├── prisma.module.ts
    └── prisma.service.ts
```

---

## Prisma schema

The source of truth is `prisma/schema.prisma`. Key models:

### `NormalizeJob` (central entity)

Represents one raw alert being normalized through the pipeline.

```prisma
model NormalizeJob {
  id                      String     @id @default(uuid())
  status                  JobStatus  @default(QUEUED)

  // Input
  rawLog                  Json       // not String - machine clients push objects
  source                  String     // vendor identifier (splunk, crowdstrike, ...)
  format                  String

  // Deduplication
  idempotencyKey          String?    @unique

  // Retry chain
  parentJobId             String?
  parent                  NormalizeJob?  @relation("JobRetries", fields: [parentJobId], references: [id])
  retries                 NormalizeJob[] @relation("JobRetries")
  attempts                Int        @default(0)

  // Results (null until completed)
  ocsf                    Json?
  confidence              Float?
  decision                String?    // 'accept' | 'review' | 'reject'
  breakdown               Json?      // { schema_score, coverage_score, consistency_score, post_process_penalty }
  validationErrors        Json?
  processingTimeMs        Int?
  error                   String?

  // Post-processor audit trail
  fixesApplied            Json?      // string[] - rule messages for fixes
  hallucinationsStripped  Json?      // string[] - rule messages for stripped hallucinations

  // Timing
  createdAt               DateTime   @default(now())
  updatedAt               DateTime   @updatedAt
  startedAt               DateTime?
  completedAt             DateTime?

  // Relations
  ocsfEvents              OCSFEvent[]   // multiple - see supersedes chain below
  processingMetric        ProcessingMetric?
  manualReview            ManualReview?

  @@index([status])
  @@index([createdAt])
  @@index([idempotencyKey])
}

enum JobStatus {
  QUEUED
  ACTIVE
  COMPLETED
  FAILED
}
```

Notes:

- **`id` is the BullMQ job ID.** There is no separate `bullJobId` column. One identity, not two. `NormalizeProducer` passes the row UUID as the BullMQ job ID explicitly via the options parameter.
- **`rawLog` is `Json`, not `String`.** Machine clients POST JSON objects directly without stringifying.
- **`fixesApplied` and `hallucinationsStripped` are `Json?`** but in practice always arrays of strings. The `JobResponse` mapper has a defensive test that drops non-string entries.
- **Retries create new rows**, not updates. `parentJobId` threads the retry chain for audit.
- **`ocsfEvents` is a list, not a 1:1.** A job can have multiple OCSF events when corrections create superseding rows. See `OCSFEvent` below.

### `User`

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  role         UserRole @default(ANALYST)
  createdAt    DateTime @default(now())
  lastLoginAt  DateTime?

  trainingExports TrainingExport[] @relation("ExportedBy")
  flaggedReviews  ManualReview[]   @relation("FlaggedBy")
}

enum UserRole {
  ANALYST
  ADMIN
}
```

### `ManualReview`

1:1 with `NormalizeJob`. Created when `RoutingService` routes a job to review (auto-flagged) OR when an analyst clicks "Flag for review" on the jobs browse page (human-flagged).

```prisma
model ManualReview {
  id                 String         @id @default(uuid())
  normalizeJobId     String         @unique
  normalizeJob       NormalizeJob   @relation(fields: [normalizeJobId], references: [id], onDelete: Cascade)

  correctionType     CorrectionType @default(AUTO_FLAGGED)
  flaggedById        String?        // User who flagged (null for AUTO_FLAGGED)
  flaggedBy          User?          @relation("FlaggedBy", fields: [flaggedById], references: [id])
  reason             String?        // optional analyst note when human-flagging

  correctedOcsf      Json?          // null until analyst submits
  reviewerEmail      String?        // sourced from JWT at submit time
  submittedAt        DateTime?
  createdAt          DateTime       @default(now())

  // Training export marker
  trainingExportId   String?
  trainingExport     TrainingExport? @relation(fields: [trainingExportId], references: [id], onDelete: SetNull)
}

enum CorrectionType {
  AUTO_FLAGGED
  HUMAN_FLAGGED
}
```

### `OCSFEvent`

**Multiple rows per job are normal.** A job's first accepted output creates one `OCSFEvent` row. Each subsequent correction creates a NEW `OCSFEvent` that supersedes the previous one. The supersedes chain is a forward-and-back doubly linked list.

```prisma
model OCSFEvent {
  id                 String     @id @default(uuid())
  normalizeJobId     String     // NOT @unique - multiple events per job
  normalizeJob       NormalizeJob @relation(fields: [normalizeJobId], references: [id], onDelete: Cascade)

  data               Json       // the OCSF payload
  createdAt          DateTime   @default(now())

  // Supersedes chain (self-relation)
  supersedesEventId  String?
  supersedes         OCSFEvent? @relation("Supersedes", fields: [supersedesEventId], references: [id], onDelete: SetNull)
  supersededBy       OCSFEvent? @relation("Supersedes")

  @@index([normalizeJobId])
}
```

The "current" OCSF event for a job is the row where `supersededById IS NULL`. Query pattern:

```ts
const current = await prisma.oCSFEvent.findFirst({
  where: { normalizeJobId, supersededById: null },
});
```

### `ProcessingMetric`

1:1 with `NormalizeJob` (`@unique` on `normalizeJobId`). Represents the original model run. **Corrections do not create new metric rows** - the metric is about the model's performance, not the corrected output.

### `TrainingExport`

Audit row for each training data export.

```prisma
model TrainingExport {
  id           String         @id @default(uuid())
  exportedAt   DateTime       @default(now())
  exportedById String
  exportedBy   User           @relation("ExportedBy", fields: [exportedById], references: [id])
  recordCount  Int
  reviews      ManualReview[]

  @@index([exportedAt])
}
```

---

## Auth deep dive

### The route matrix

| Route | Guard | Roles | Notes |
|---|---|---|---|
| `POST /auth/login` | none | - | public |
| `GET /auth/me` | `JwtAuthGuard` | any | returns the current user |
| `POST /auth/logout` | `JwtAuthGuard` | any | clears the cookie |
| `POST /logs/ingest` | `ApiKeyAuthGuard` | - | machine ingestion only |
| `POST /logs/ingest/batch` | `ApiKeyAuthGuard` | - | machine ingestion only |
| `GET /jobs` | `JwtAuthGuard` | any | browse with filters and pagination |
| `GET /jobs/:id` | `JwtOrApiKeyAuthGuard` | any | single job detail |
| `GET /jobs/:id/events` | `JwtOrApiKeyAuthGuard` | any | SSE stream |
| `POST /jobs/:id/flag-for-review` | `JwtAuthGuard` | `ANALYST` or `ADMIN` | human-initiated flag |
| `POST /normalize/jobs/:id/retry` | `JwtAuthGuard` | any | clone failed job for retry |
| `GET /review/*` | `JwtAuthGuard` | `ANALYST` or `ADMIN` | review queue and details |
| `POST /review/:id/correct` | `JwtAuthGuard` | `ANALYST` or `ADMIN` | reviewer from `req.user.email`, republishes via supersedes |
| `GET /metrics/*` | `JwtAuthGuard` | any | dashboard metrics |
| `GET /users` | `JwtAuthGuard` + `RolesGuard` | `ADMIN` | |
| `POST /users` | `JwtAuthGuard` + `RolesGuard` | `ADMIN` | |
| `DELETE /users/:id` | `JwtAuthGuard` + `RolesGuard` | `ADMIN` | self-delete + last-admin guards |
| `GET /admin/training-data/stats` | `JwtAuthGuard` + `RolesGuard` | `ADMIN` | |
| `POST /admin/training-data/export` | `JwtAuthGuard` + `RolesGuard` | `ADMIN` | atomic export, returns JSONL |
| `GET /health` | none | - | load balancer probe |

### Bootstrap admin

On `OnModuleInit`, `AuthService` checks for an existing admin with `BOOTSTRAP_ADMIN_EMAIL`. If none exists, it creates one with the bootstrapped password. Idempotent - running it twice does nothing.

### Password hashing

argon2id with OWASP 2024 parameters. See `auth.service.ts` for the exact cost settings.

### Anti-enumeration

`AuthService.validateLogin` always runs argon2 verify, even when the user doesn't exist. For missing users it verifies against a constant-time dummy hash. This prevents timing attacks from revealing whether an email is registered.

### Reviewer identity

`POST /review/:id/correct` reads the reviewer email from `req.user.email` set by the JWT strategy, never from the request body. **Do not change this.** Trusting any request body field for identity is an impersonation vulnerability.

---

## Queue + worker flow

The exact sequence when a job lands:

```
HTTP PROCESS                                  REDIS                                         WORKER PROCESS
────────────                                  ─────                                         ──────────────
IngestionService.create
  INSERT NormalizeJob (status=QUEUED)
  NormalizeProducer.enqueue(row.id) ──────► queue.add({jobId: row.id}, {jobId: row.id})
return 202
                                                                                            BullMQ pulls job
                                                                                            NormalizeProcessor.process(bullJob)
                                                                                              ├── markActive (updateMany WHERE status IN (QUEUED, ACTIVE))
                                                                                              │   ◄── emits 'active' event ──► QueueEvents listener
                                                                                              │                                 (HTTP process)
                                                                                              │                                 reloads row, emits SSE
                                                                                              ├── SLMService.normalize()
                                                                                              │   HTTP to Python service
                                                                                              │   
                                                                                              ├── RoutingService.route()
                                                                                              │   create OCSFEvent + ProcessingMetric OR
                                                                                              │   create ManualReview
                                                                                              │   publish to SQS if decision=accept
                                                                                              └── markCompleted
                                                                                                  updateMany with all fields
                                                                                                  ◄── emits 'completed' event ──► QueueEvents listener
                                                                                                                                    reloads row, emits SSE,
                                                                                                                                    closes connection
```

The contract worth memorizing: **`RoutingService.route()` runs BEFORE `markCompleted`.** Any consumer observing `status === COMPLETED` can always join to downstream rows without racing.

### Retries

BullMQ is configured with `attempts: 3, backoff: { type: 'exponential', delay: 5000 }` (~5s, ~25s, ~125s). The processor is retry-safe because:

- `markActive` is idempotent (`WHERE status IN (QUEUED, ACTIVE)`).
- `OCSFEvent` is created once per accepted run; retries on a previously-failed job that never reached the accept path simply create the row on the next successful attempt.
- `ProcessingMetric` and `ManualReview` use `upsert` keyed on `normalizeJobId` uniqueness.
- SQS publish uses a deduplication ID derived from `normalizeJobId` on FIFO queues. On standard queues (current deployment), duplicates are possible - a startup warning is logged.
- `markFailed` is called ONLY on the final attempt (tracked via `job.attemptsMade` vs `job.opts.attempts`). Intermediate failures throw, letting BullMQ retry.

### Reconciliation sweep

`ReconciliationService` runs a `@Cron` every 5 minutes (`@nestjs/schedule`). It runs three sweeps sequentially guarded by a `running` flag to prevent overlap:

1. **Stuck `ACTIVE` rows older than 15 minutes.** These mean the worker crashed mid-job. Marked `FAILED` with `error = "reconciliation: worker heartbeat lost"`.
2. **Stuck `QUEUED` rows older than 1 hour with no matching BullMQ entry.** This is the edge case where `queue.add()` threw AND the cleanup delete also threw. Marked `FAILED` with `error = "reconciliation: enqueue orphan"`.
3. **Expired idempotency keys (TTL: 24 hours).** The key is cleared so a future retry with the same key will produce a fresh job.

All three sweeps use atomic `updateMany` with `WHERE status` guards so they cannot race against the worker completing a job.

---

## Correction and republish flow

`ReviewService.submitCorrection` runs in a single Postgres transaction:

1. Find the existing OCSF event for this `normalizeJobId` where `supersededById IS NULL` (the "current" one). May be null if the job was originally rejected or routed to review without ever being published.
2. Insert a new `OCSFEvent` row with the corrected payload, `supersedesEventId` set to the old event's id (or null if none).
3. If the old event existed, update its `supersededById` to the new event's id.
4. Update the `ManualReview` row with `correctedOcsf`, `reviewerEmail` (from JWT), and `submittedAt`.

After the transaction commits, the new event is published to SQS via `SqsClientService.publish` with message attributes:

- `IsCorrection: "true"`
- `SupersedesEventId: <old event id, or empty string>`
- `ManualReviewId: <review row id>`

SQS publish failures are logged but do not roll back the DB transaction. The database is the source of truth.

**Idempotency:** `ReviewService.submitCorrection` rejects a second submit on the same review with 409 Conflict. The `submittedAt` field is the guard.

---

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Yes |
| `REDIS_URL` | Redis connection for BullMQ + QueueEvents | Yes |
| `SLM_API` | URL of the Python SLM service (e.g., `http://slm:8000`) | Yes |
| `TIMEOUT` | Opossum circuit breaker timeout in ms. Must exceed realistic SLM latency. Default: `860000` (~14 min) | Yes |
| `ERROR_THRESHOLD_PERCENTAGE` | Opossum: open circuit after this % failures | Yes |
| `RESET_TIMEOUT` | Opossum: retry after this many ms when open | Yes |
| `VOLUME_THRESHOLD` | Opossum: minimum request count before considering failures | Yes |
| `JWT_SECRET` | Signing secret. **Set this.** | Yes |
| `API_KEY` | Shared API key for machine ingestion. **Set this.** | Yes |
| `BOOTSTRAP_ADMIN_EMAIL` | First admin created on startup | Yes |
| `BOOTSTRAP_ADMIN_PASSWORD` | First admin's password | Yes |
| `SQS_QUEUE_URL` | AWS SQS queue URL for OCSF publish | No |
| `AWS_REGION` | AWS region | If SQS set |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS credentials | If SQS set |
| `PORT` | HTTP API port. Default: `3000` | No |
| `RECONCILE_BATCH_SIZE` | Max rows per reconciliation sweep iteration. Default: `100`  | No |

---

## Development

```bash
# Install
npm install

# Database (applies migrations to the DB at DATABASE_URL)
npx prisma migrate dev

# Generate Prisma client (usually automatic after migrate dev)
npx prisma generate

# Run HTTP + worker in parallel (uses concurrently)
npm run dev

# Or run them separately in two terminals:
npm run dev:http       
npm run dev:worker    

# Build
npm run build          # produces dist/ for both entrypoints

# Lint
npm run lint

# Typecheck only
npx tsc -b
```

### Prisma workflow

- `npx prisma migrate dev --name <snake_case_description>` - creates a new migration file and applies it to dev.
- `npx prisma migrate deploy` - applies pending migrations in prod. Called by the dedicated `migrate` service in compose.
- `npx prisma studio` - GUI for the dev database. Useful for one-off fixes but not for routine ops - use the admin UI.
- **Never edit an existing migration file.** Create a new one that corrects the previous.

---

## Testing

Test layout:

```
test/
├── unit/                     # pure unit (mocked deps)
│   ├── auth.service.spec.ts
│   ├── users.service.spec.ts
│   ├── jobs.service.spec.ts
│   ├── jobs-browse.service.spec.ts
│   ├── ingestion.service.spec.ts
│   ├── normalize.processor.spec.ts
│   ├── normalize.producer.spec.ts
│   ├── reconciliation.service.spec.ts
│   ├── routing.service.spec.ts
│   ├── review.service.spec.ts
│   ├── training-data.service.spec.ts
│   ├── job-response.mapper.spec.ts
│   ├── slm-client.service.spec.ts
│   ├── sqs-client.service.spec.ts
│   └── ...
└── e2e/
    └── app-e2e.spec.ts       # real Postgres + Redis + BullMQ + mocked SLM/SQS
```

Commands:

```bash
npm test                 # unit suites (fast, mocked)
npm run test:e2e         # end-to-end (slow, real infra)
npm run test:watch
```

### Why the e2e suite matters

Unit tests use `Test.createTestingModule({ providers: [...] })`, which bypasses the module graph entirely. Module wiring bugs - a forgotten import, a `ConfigModule` registered as a class instead of `ConfigModule.forRoot()`, a provider missing from a module's `providers` array - only surface when the actual `AppModule` and `WorkerModule` boot end-to-end. These are the kinds of bugs that 404 every route or refuse to start the worker.

**Run both layers before every release.** Unit tests verify logic; e2e tests verify wiring. They are not redundant.

### Running the e2e suite locally

It needs real Postgres and real Redis. The fastest setup is `docker compose up postgres redis` and then `npm run test:e2e` from the backend directory with the appropriate `DATABASE_URL` and `REDIS_URL` in your shell env. [VERIFY: exact env setup]

---

## Things to know when making changes

### Atomic state transitions

All `NormalizeJob` status updates use `updateMany` with a `WHERE status IN (...)` guard, not `findUnique + update`. This is the race fence between the worker and the reconciliation sweep. Preserve the pattern when adding new transitions.

### The supersedes chain

`OCSFEvent.normalizeJobId` is **not** unique. There can be many events per job. The "current" event is the one where `supersededById IS NULL`. Always query with that filter - never assume the first row is current.

When inserting a new corrected event:

1. Find the current event for the job (may be null).
2. Insert the new event with `supersedesEventId` set.
3. Update the old event's `supersededById` to point at the new one.
4. Wrap all three in a single transaction. The DB constraint guarantees no overlap.

### The `fixesApplied` and `hallucinationsStripped` fields

These come from the SLM response and flow through `CompleteNormalizeJobDto` → `JobsService.markCompleted` → Postgres → `job-response.mapper` → API. If you add a new audit field, update all four layers. There's a defensive test in the mapper that drops non-string entries from the JSONB arrays - preserve that when extending.

### The training data system prompt constant

`training-data/training-prompt.constant.ts` is an exact copy of the system prompt the SLM uses at inference time. These must match, otherwise exported training data will train a future model against a prompt that doesn't match how the model will be used. There's a unit test that asserts the constant starts with the expected first words, but it cannot catch deep drift. **If you change the SLM's system prompt, also update this constant.** Treat this as a permanent cross-service invariant.

### Structured logging

All logger calls use `this.logger.log({ ... }, 'event.name')` with object payloads and dotted event names (`normalize.start`, `normalize.done`, `ingest.enqueued`, `jobs_events.ready`, etc.). New code should follow the pattern.

### Self-delete and last-admin guards

`UsersService.delete(actorId, targetId)` enforces:

- Actor cannot delete themselves.
- The last remaining admin cannot be deleted.

Both are belt-and-suspenders - the frontend should also hide the delete button on the actor's own row, but the backend is the source of truth.

---

## What the backend does not do

- **No refresh tokens.** JWTs expire after 24 hours and the user logs in again.
- **No password reset, email verification, or account lockout.**
- **Standard SQS queue, not FIFO.** Publish code supports both; switching is a queue URL change only. On standard queues, a retry can publish the same OCSF event twice downstream.
- **SSE across multi-instance backend is untested.** Uses BullMQ QueueEvents (Redis pub/sub) so should work in theory.
- **No admin reconciliation trigger.** The sweep is `@Cron` only - no `POST /admin/reconciliation/run`.
- **No SQS retry queue for republish failures.** When a corrected event fails to publish, the failure is logged and the DB transaction still commits. Add retry if downstream consumers depend on every correction reaching them.
