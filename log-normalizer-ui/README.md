# log-normalizer-ui

React + Vite + TypeScript monitoring dashboard and admin surface for LogNormalizer AI.

This README assumes you've read the [root README](../README.md) for context. Here we cover the frontend-specific things: pages, auth context, visual language, and conventions.

---

## What it is

A single-page React app served by nginx in production and by Vite's dev server in development. It talks exclusively to the NestJS backend via cookies — there is no direct client-to-SLM communication. All API calls go through `/api/*` on the same origin in production (nginx reverse-proxies to the backend) or via `VITE_API_URL` in development.

The UI is a functional dashboard for a SOC engineering audience: dark theme, dense information, no marketing gloss.

---

## Pages

```
src/pages/
├── Login.tsx              # /login — split-screen brand + form
├── Dashboard.tsx          # / — top-level metrics
├── Jobs.tsx               # /jobs — browse all jobs, flag any for review
├── Review.tsx             # /review — list of flagged jobs (review queue)
├── ReviewDetail.tsx       # /review/:id — raw alert + OCSF editor + post-processor audit
├── Health.tsx             # /health — system metrics + cron status
├── Users.tsx              # /users — admin: list/create/delete users
└── TrainingData.tsx       # /admin/training-data — admin: export corrections
```

### Login

Split-screen layout: left panel is a branded dark gradient with a headline and three feature bullets; right panel is the form. Mobile collapses to form-only under 768px. Cookie-based auth — `POST /api/auth/login` sets an `httpOnly; SameSite=Strict` cookie, subsequent calls include credentials automatically.

### Dashboard

Top-level metrics: job counts by status, recent activity, throughput summary. Pulls from `GET /api/metrics/*`.

### Jobs

Browse all completed jobs with filters (status, decision, source, date range, has-review). Each row shows id, source, status badge, decision badge, confidence, created date, and an action:

- If the job already has a `ManualReview`: "Open review" link to `/review/:id`.
- If the job is `COMPLETED` and not yet flagged: "Flag for review" button. Clicking it confirms with the user, calls `POST /api/jobs/:id/flag-for-review`, and redirects to `/review/:id` so the analyst can edit.
- If the job's OCSFEvent has been superseded by a correction, a small "corrected" badge appears next to the action.

Filters live in URL query params so the page is shareable and back-button works. Pagination is server-side. Both analysts and admins can use this page.

### Review (list)

Table of jobs in the review queue. Includes both auto-flagged and human-flagged jobs. Columns: id, source, decision, confidence, correction type badge, created date, link to detail view.

### Review detail (the most important page)

This is where the human-in-the-loop loop actually happens. Layout:

- **Header:** job ID, submitted timestamp, source vendor, current status, confidence score + breakdown (with the negative `post_process_penalty` row rendered in a visually distinct way), and a small badge: "Auto-flagged" (slate) or "Human-flagged by {email}" (teal) based on `correctionType`.
- **Raw alert panel:** the raw alert that came in, syntax-highlighted JSON.
- **OCSF output panel:** the post-processed OCSF Detection Finding, editable as JSON. The analyst can modify the JSON directly before saving.
- **Post-processor activity section:** two sublists showing `fixesApplied` and `hallucinationsStripped` from the job. Fixes use a teal accent; hallucinations use amber. Empty states handled per-sublist.
- **Submit button:** posts the edited OCSF to `POST /api/review/:id/correct`. The reviewer identity is set from the JWT cookie on the backend, not from any field in the form. After submit, an inline banner shows "Corrected on {date} by {email}, republished as new OCSF event."

The JSON editor is a plain `<textarea>` with monospace font. [VERIFY: whether a richer editor was added]

### Health

System status from multiple sources:

- Backend health (is the API up)
- SLM health (proxied through backend via `GET /api/health` which calls the SLM's `/health`)
- System metrics from the SLM (CPU, memory, GPU)
- Cron job status (reconciliation sweep)

### Users (admin-only)

Table: email, role badge, created, last login, delete. Add User modal with client-side validation (email format, password min length). Delete is inline (row swaps to cancel/confirm buttons, no full modal). The current user's row cannot be deleted — the delete button is hidden. The backend enforces the same rule and also blocks deletion of the last remaining admin.

### Training data (admin-only)

Stats cards at the top (total corrections, pending export, already exported, last export). Export action card with the big "Export N corrections" button. History table showing past exports with admin email and record count. Clicking export calls `POST /api/admin/training-data/export`, receives a JSONL file in the response body, and triggers a browser download via a Blob and a temporary anchor element.

---

## Authentication on the frontend

All auth state lives in one place: `src/context/AuthContext.tsx`.

```tsx
const { user, loading, login, logout } = useAuth();
```

- `user`: `{ id, email, role } | null`
- `loading`: true during the initial `/me` probe on mount
- `login(email, password)`: POSTs to `/auth/login`, triggers a `/me` refetch on success
- `logout()`: POSTs to `/auth/logout`, clears the local user state

On mount, `AuthProvider` calls `GET /api/auth/me`. If the cookie is present and valid, the user state is populated. If not, the user is redirected to `/login`.

**All fetch calls must pass `credentials: 'include'`** so the cookie is sent. This is handled by the `api/client.ts` wrapper — use it. Do not write raw `fetch()` calls that bypass the wrapper.

### Route gating

Admin-only routes need two layers of guard:

1. **Nav link visibility** — the sidebar only renders the link if `user.role === 'ADMIN'`. Non-admins don't see it.
2. **Route-level guard** — the page component itself checks `user.role` on mount and renders a "403 — admin access required" fallback if a non-admin lands there via URL manipulation or a bookmark.

The backend is the source of truth — the `@Roles(UserRole.ADMIN)` decorator + `RolesGuard` rejects the API call regardless of what the frontend thinks. The frontend gates are UX, not security.

---

## API client

`src/api/client.ts` exports an `endpoints` object grouped by resource:

```ts
export const endpoints = {
  auth: {
    login: (email, password) => ...,
    logout: () => ...,
    me: () => ...,
  },
  users: {
    list: () => ...,
    create: (email, password, role) => ...,
    delete: (id) => ...,
  },
  jobs: {
    list: (filters) => ...,
    get: (id) => ...,
    flagForReview: (id, reason) => ...,
    subscribeSSE: (id) => ...,
  },
  review: {
    list: () => ...,
    get: (id) => ...,
    submit: (id, correctedOcsf) => ...,
  },
  trainingData: {
    stats: () => ...,
    export: () => ...,
  },
  health: () => ...,
  metrics: {
    ...,
  },
};
```

Every call includes `credentials: 'include'`. Responses are parsed via a shared `handleJsonResponse` helper that throws on non-2xx with the error body attached.

**Pattern for new endpoints:** add to this object, mirror the backend route shape, reuse `handleJsonResponse`. Do not write one-off fetch calls in page components.

### Native fetch, not axios

The project uses the built-in `fetch` API, not axios. Do not introduce axios.

---

## Visual language

### Palette

| Token | Value | Use |
|---|---|---|
| Background | `slate-950` | Page background |
| Panel | `slate-900` | Cards, modals, nav sidebar |
| Panel subtle | `slate-900/50` | Lower-emphasis cards |
| Border | `slate-800` | Card borders, input borders, table dividers |
| Text primary | `slate-100` | Headings, emphasized text |
| Text body | `slate-300` | Body text |
| Text muted | `slate-500` | Subtitles, placeholders, empty states |
| Accent primary | `teal-500` | Primary buttons, focus rings, active nav |
| Accent hover | `teal-400` | Hover states on primary buttons |
| Success | `teal-300` | Success messages, fixes |
| Warning | `amber-400` | Hallucinations, deduction indicators |
| Error | `red-400` | Errors, destructive actions |

### Plain CSS, no Tailwind

The project does **not** use Tailwind. All styles live in `src/App.css`. Style classes are component-scoped by naming convention (e.g., `.users-table`, `.training-data-stats`). When adding a new component, add a new section to `App.css`.

### Icons

Inline SVG, written as small React components. See `src/pages/Login.tsx` for the existing pattern (Mail, Lock, Eye, EyeOff, AlertCircle). Do not install `lucide-react` or any other icon library — all the icons used so far are simple enough to inline, and the inline pattern keeps the bundle small and the visual language consistent.

### Typography

- Headings: Inter or system sans-serif, semibold/bold
- Body: Inter or system sans-serif, regular
- Code / JSON: monospace (ui-monospace, SF Mono, Menlo, ...)

[VERIFY: actual font stack in index.css or similar]

### Input style (shared)

All form inputs follow the same pattern:

- Height: 44px
- Background: `slate-900`
- Border: `slate-800`, rounded-lg
- Focus: border `teal-500`, ring `teal-500/20`
- Label: `slate-400`, text-sm, font-medium, above the input

Preserve this across new forms.

---

## Project layout

```
src/
├── main.tsx                   # React entrypoint
├── App.tsx                    # Router + top-level layout
├── App.css                    # All styles live here
├── index.css                  # Reset + base typography
│
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Jobs.tsx
│   ├── Review.tsx
│   ├── ReviewDetail.tsx
│   ├── Health.tsx
│   ├── Users.tsx
│   └── TrainingData.tsx
│
├── components/
│   ├── Layout.tsx             # Sidebar + header shell
│   ├── RoleBadge.tsx
│   ├── CorrectionTypeBadge.tsx    # Auto-flagged / Human-flagged
│   ├── AddUserModal.tsx
│   ├── UserTable.tsx
│   ├── JobsTable.tsx              # Used by the Jobs page
│   ├── JobsFilters.tsx            # Filter bar for the Jobs page
│   ├── PostProcessorActivity.tsx  # Fixes/hallucinations panel on ReviewDetail
│   └── ConfidenceBreakdown.tsx    # 4-bar breakdown with negative handling
│
├── context/
│   └── AuthContext.tsx        # useAuth(), AuthProvider
│
├── api/
│   ├── client.ts              # endpoints object
│   └── types.ts               # API DTO types
│
├── types/
│   └── index.ts               # domain types (User, Job, etc.)
│
└── utils/
    └── formatDate.ts          # [VERIFY: date helpers]
```

---

## Running the UI

### Development (Vite)

```bash
cd log-normalizer-ui
npm install
npm run dev
```

Runs at `http://localhost:5173` [VERIFY]. The backend must be running somewhere reachable — set `VITE_API_URL` in a `.env.local` to point at it:

```
VITE_API_URL=http://localhost:3000/api
```

Vite proxies `/api/*` requests in development if configured. [VERIFY: vite.config.ts proxy setup]

### Production build

```bash
npm run build
```

Outputs static files to `dist/`. The production Dockerfile uses a multi-stage build: node:22 for the build, then copies `dist/` into `nginx:1.27-alpine`. nginx config is at `[VERIFY: path]` and handles:

- SPA fallback: unknown routes serve `index.html` (React Router handles the rest client-side)
- `/api/*` reverse-proxies to the backend service
- Cache headers: static assets get immutable caching, `index.html` gets no-cache

---

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API base URL. In Docker, set to `/api` and nginx proxies to the backend service. In dev, set to `http://localhost:3000/api` or equivalent. |

Vite exposes all `VITE_*` env vars at build time via `import.meta.env`.

---

## Testing

[VERIFY: test coverage state]. The pattern to follow when adding tests:

- React Testing Library
- Co-locate specs next to components (`UserTable.test.tsx` alongside `UserTable.tsx`) or under `src/__tests__/`
- Mock the `api/client` module so tests don't hit real endpoints

---

## Things to know when making changes

### The PostProcessorActivity component

Lives on ReviewDetail. Renders two sublists from `job.fixesApplied` and `job.hallucinationsStripped`. If you rename the backend fields or change their shape, update:

1. The API DTO type in `src/api/types.ts`
2. The domain type in `src/types/index.ts`
3. The component rendering in `PostProcessorActivity.tsx`
4. Any unit tests for the component

The defensive pattern in the backend mapper drops non-string entries from the JSONB arrays, but the frontend should still handle `null | undefined | []` gracefully (show empty state, not crash).

### The ConfidenceBreakdown component

This is the thing that renders the four score components from `job.breakdown`. It **must handle the negative `post_process_penalty` key** distinctly from the positive components. Three keys are in `[0, 1]`; the fourth is in `[-0.30, 0]`. A renderer that assumes all values are positive will break.

The existing implementation renders positives as horizontal bars with teal fill and the penalty as a distinct row with amber/red styling and a `−` prefix. If you add another positive component, add it to the positive group. If you add another penalty, add it to the deduction group. Keep the two groups visually distinct.

### The auth cookie

The auth cookie is `httpOnly`, which means JavaScript cannot read it. There is deliberately no way to inspect the token from the frontend — you call `/auth/me` to check if you're logged in, and the backend returns the current user or 401. Do not try to work around this by reading `document.cookie`. If you need new user state on the frontend, add it to the `/me` response, not to a parseable token.

### The Jobs page filter state

Filters live in URL query params, not React state. The page reads `useSearchParams()` on mount and pushes changes back to the URL. This makes the page shareable and back-button-friendly. When adding a new filter, follow the same pattern.

### Flag-for-review confirmation

Clicking "Flag for review" on the Jobs page should show a confirmation prompt before calling the API. The action is consequential (creates a row, redirects to a different page). Do not silently fire the API call on click. If you redesign this flow, preserve the confirmation step.

---

## What the UI does not do

- **Sparse test coverage.** The backend and SLM are heavily tested; the UI has limited coverage.
- **No standardized loading states.** Some pages use skeleton bars, some use spinners, some just blank-render.
- **No toast/notification system.** Success and error messages are inline per-component.
- **The Health page's cron status is hardcoded.** It shows the configured schedule for the reconciliation sweep but doesn't know whether the sweep actually ran recently.
- **ReviewDetail's OCSF editor is a plain textarea.** A real JSON editor (Monaco, CodeMirror) with syntax highlighting, validation, and schema-aware completion would be a meaningful UX upgrade. [VERIFY: whether this is actually the case]
- **No diff view between original and corrected OCSF on review detail.** The original is preserved in the supersedes chain in the DB but is not rendered side-by-side with the correction.
- **No dark/light toggle.** The UI is dark-only.
- **Mobile layouts are adequate, not polished.** Pages stack on small screens but weren't extensively tested on real devices.
