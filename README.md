# Log Normalizer

Multi-vendor security alert normalization to OCSF v1.7.0 Detection Findings, served via a NestJS HTTP layer with a BullMQ async queue, a Python FastAPI inference service running a fine-tuned Foundation-Sec-1.1-8B + LoRA, and a React review UI.

---

## Quickstart (Docker Compose)

### Prerequisites

- **Docker** 24+ with the Compose v2 plugin (`docker compose`, not `docker-compose`)
- **NVIDIA GPU** + recent drivers (CUDA 13 capable) **on the host machine**
- **`nvidia-container-toolkit`** installed and configured. Verify with:
  ```sh
  docker run --rm --gpus all nvidia/cuda:13.0.0-base-ubuntu22.04 nvidia-smi
  ```
  If that command prints your GPU info, you're good.
- **Model weights** placed at `log-normalizer-slm/models/` on the host. The directory is mounted read-only into the SLM container.

### First boot

```sh
# 1. Copy the env template and fill in real values for API_KEY + JWT_SECRET
cp .env.example .env
$EDITOR .env

# 2. Bring up the dev stack (with hot reload)
docker compose up -d

# 3. Watch the logs while everything starts
docker compose logs -f
```

The first build takes ~15 minutes (the SLM image's torch+transformers layer is large). Subsequent rebuilds are seconds because Docker caches the requirements layer.

What boots:

| Service | Port | Notes |
|---|---|---|
| `postgres` | — | Internal only |
| `redis` | — | Internal only |
| `migrate` | — | One-shot, exits 0 |
| `slm` | — | Internal only, GPU-bound |
| `backend-http` | 3000 | NestJS HTTP |
| `backend-worker` | — | BullMQ consumer |
| `frontend` | 5173 (dev) / 8080 (prod) | Vite dev server (dev) or nginx (prod) |

### Verifying it works

```sh
# Wait for the backend to be ready, submit a sample alert, poll until completion
./scripts/smoke-test.sh
```

You should see `✓ SMOKE TEST PASSED` after ~3 minutes (most of which is the SLM doing inference).

### Production stack (no hot reload, nginx-served frontend)

```sh
docker compose -f docker-compose.yml up -d
```

The bare `docker-compose.yml` is the production baseline. The `docker-compose.override.yml` (auto-loaded by `docker compose up`) layers on bind mounts and watch commands for development. Skipping the override file with the explicit `-f` flag gives you the prod shape.

---

## Without an NVIDIA GPU

If you're developing on a machine without a GPU (Windows-without-GPU, Apple Silicon, anything that's not CUDA-capable), the `slm` container will fail to start. Two paths:

1. **Run the SLM natively against a remote GPU** (e.g. a workstation, a cloud instance) and point `SLM_API` at it:
   - Comment out the `slm:` service in `docker-compose.yml`
   - Remove `slm` from `backend-worker.depends_on`
   - In your `.env`, set `SLM_API` to the remote URL and rebuild the backend services
2. **Run everything natively.** Each subdirectory (`log-normalizer-backend/`, `log-normalizer-slm/`, `log-normalizer-ui/`) is a self-contained project with its own dev commands.

---

## Architecture (one screen)

```
        machine clients & UI
                │
                ▼
   POST /api/logs/ingest   (sole submit URL)
                │
                ▼
       IngestionService
        ├── JobsService.create  → NormalizeJob row (idempotent on Idempotency-Key)
        └── NormalizeProducer   → BullMQ enqueue (jobId === row.id)
                │
                │  202 { jobId, status: 'queued' }
                ▼
              client
                │
                │  GET /api/normalize/jobs/:id        (polling)
                │  GET /api/normalize/jobs/:id/events (SSE, live state)
                │  POST /api/normalize/jobs/:id/retry (FAILED → new row, parentJobId)
                ▼
         backend-http (NestJS)
                │
                │  cross-process via Redis pub/sub (BullMQ QueueEvents)
                ▼
        backend-worker (separate process, concurrency=1)
                ├── markActive          (idempotent across BullMQ retries)
                ├── SLMService.normalize → Python FastAPI → Foundation-Sec-1.1-8B
                ├── RoutingService.route → OCSFEvent + ProcessingMetric (UPSERTs)
                │                       → SQS publish (FIFO dedup id = jobId)
                │                       → ManualReview queue (UPSERT)
                └── markCompleted
```

**Key contracts:**
- `status === COMPLETED` ⟹ `OCSFEvent` and `ProcessingMetric` exist for that jobId
- `markActive` accepts `{QUEUED, ACTIVE}` so BullMQ retries are safe
- All downstream writes are UPSERTs by `normalizeJobId` so retries don't duplicate

---

## Auth surface

| Route | Auth |
|---|---|
| `POST /api/auth/login` | Open |
| `POST /api/auth/logout` | JWT cookie |
| `GET /api/auth/me` | JWT cookie |
| `POST /api/logs/ingest` (single + batch) | API key |
| `GET /api/normalize/jobs/:id` | JWT or API key |
| `GET /api/normalize/jobs/:id/events` (SSE) | JWT or API key |
| `POST /api/normalize/jobs/:id/retry` | JWT cookie |
| `GET /api/review/pending` | JWT cookie |
| `POST /api/review/:id/correct` | JWT cookie (reviewer sourced from token) |
| `GET /api/metrics/*` | JWT cookie |
| `GET /api/health` | Open |

---

## Known limitations (Week 2)

These are documented gaps deferred to Week 3+:

- **No refresh tokens.** JWTs live for `JWT_TTL_HOURS` (default 24h). Re-login required after expiry.
- **No password reset / forgot password flow.**
- **No email verification.**
- **No account lockout** after N failed login attempts.
- **No 2FA / MFA.**
- **No user management UI.** Add users via the bootstrap env vars or `psql`.
- **`SameSite=strict` cookies require same-origin frontend + backend in production.** If you ever host the UI on a different origin (e.g. Vercel + a separate API host), switch the cookie to `SameSite=lax` and add CSRF tokens.
- **Standard SQS queue**, not FIFO — retries may publish duplicate downstream events. Switch the SQS URL to a `.fifo` queue and the dedup id (already plumbed) takes effect with zero code changes.
- **No retries beyond BullMQ's `attempts: 3`**. If the SLM is down for >2 minutes, the reconciliation sweep handles stragglers.

---

## Running tests

```sh
cd log-normalizer-backend

# Unit + integration tests against a real Postgres on localhost:5432.
# Make sure the test DB exists: `createdb lognormalizer_test`
npm run test

# E2E test against real Postgres + Redis + BullMQ + mocked SLM.
# Same Postgres prereq, plus `docker run -d -p 6379:6379 redis:7`
npm run test:e2e
```

Test counts (Week 2 final): **177 unit + 11 e2e** across 17 suites.
