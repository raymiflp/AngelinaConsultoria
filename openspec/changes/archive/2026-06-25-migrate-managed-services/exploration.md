# Exploration: Managed Services Migration (Vercel-native stack)

> **Status**: Phase 1 of 6 (`sdd-explore`). Read-only investigation. No code
> was modified. This report feeds `sdd-propose` with concrete service
> inventory, env-var landscape, Vercel serverless constraints, and a
> question queue for the user.

## TL;DR for the orchestrator

The project currently assumes a **hybrid deployment** (Next.js on Vercel +
heavy services on a self-hosted VPS). The user wants to move the entire
runtime to **Vercel with managed equivalents**. The good news: only **4 of
the 9 declared services are actually wired into source code today** —
Postgres, Redis, LiveKit, and NextAuth. The other 5 (MinIO, MeiliSearch,
Socket.io, Sentry, PostHog analytics init) are declared in
`package.json` / `docker-compose.yml` / env files but the application
never imports them. That makes the migration **mostly env-var swaps +
config-file changes**, not code rewrites.

**Key risks**: the LiveKit client is eager-init at module load (any missing
`LIVEKIT_*` env var fails the Vercel build), `NEXT_PUBLIC_LIVEKIT_URL`
must be set at **build time** on Vercel (not runtime), and the
`MINIO_PUBLIC_HOSTNAME` env var controls `next.config.ts`
`images.remotePatterns` and currently defaults to `minio.local` — that
default must be replaced with the real managed hostname before deploy.

**Recommendation for proposal phase**: plan 6 chained PRs, one per
service family (Postgres / Redis / LiveKit / Object storage / Auth /
search). Each is small enough to fit the 800-line review budget. Socket.io
gets dropped (unused). MeiliSearch gets dropped or replaced with Postgres
FTS (unused). Sentry config files get added.

---

## Current State

### What is actually wired into source code

| Service | Library | Used in | Boot-time? | Required? |
|---|---|---|---|---|
| **Postgres** | `drizzle-orm@^0.43.1` + `postgres@^3.4.5` | `src/infrastructure/db/index.ts` | Eager | **Yes** — throws at import if `DATABASE_URL` unset |
| **Redis** | `ioredis@^5.6.1` | `src/infrastructure/redis/{index,cache,rate-limiter}.ts` | Eager but **graceful** — returns `null` if `REDIS_URL` unset, cache + rate-limit degrade to no-op | **No** (optional) |
| **LiveKit (server)** | `livekit-server-sdk@2.15.4` | `src/infrastructure/livekit/livekit-server.ts` | **Eager** — `livekitServerClient` instantiated at module load, throws if `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` unset | **Yes** |
| **LiveKit (client)** | `@livekit/components-react@^2.9.4` + `@livekit/components-styles@^1.2.0` + `livekit-client@^2.11.4` | `src/app/citas/[id]/llamada/page.tsx` (call page) | N/A — client-side | **Yes** for video calls |
| **NextAuth (Auth.js v5)** | `next-auth@^5.0.0-beta.28` + `@auth/core` | `src/auth.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts` | Eager | **Yes** — needs `AUTH_SECRET` |
| **PostHog (server)** | `posthog-node@^5.37.0` | `src/infrastructure/analytics/index.ts` | Lazy — returns `null` if `NEXT_PUBLIC_POSTHOG_KEY` unset | **No** (optional) |
| **PostHog (client)** | `posthog-js@^1.238.0` | `src/providers/PostHogProvider.tsx` | Lazy — `posthog.init()` skipped if key unset | **No** (optional) |

### What is declared but NOT wired into source code

| Service | Where it's declared | Status |
|---|---|---|
| **MinIO** | `docker-compose.yml` (lines 41-58), `next.config.ts` line 49 (`MINIO_PUBLIC_HOSTNAME`), `.env.example` not, `.env.local.example` not | **NOT IMPORTED**. There is no `@aws-sdk/client-s3` or `minio` package in `package.json`. The `next.config.ts` `images.remotePatterns` is the only place MinIO surfaces — it allows the Next.js Image component to fetch from a MinIO bucket hostname. |
| **MeiliSearch** | `package.json` has `meilisearch@^0.49.0`, `docker-compose.yml` (lines 60-75), `.env.local.example` has `MEILISEARCH_HOST` + `MEILISEARCH_MASTER_KEY`, `docker/dev/postgres/init.sql` (probably), `openspec/specs/dev-setup/spec.md` | **NOT IMPORTED**. Grep across `src/` returns zero matches. The `meilisearch` JS client lives in `node_modules` but nothing references it. |
| **Socket.io** | `package.json` has `socket.io@^4.8.1` + `socket.io-client@^4.8.1`, `next.config.ts` line 42 (`serverExternalPackages: ["socket.io", "livekit-server-sdk"]`), `README.md` mentions it for real-time, `ARCHITECTURE.md` shows it on the VPS | **NOT IMPORTED**. Grep across `src/` returns zero matches. The lib is in `node_modules` and listed as `serverExternalPackages` but no source file ever requires it. |
| **Sentry** | `package.json` has `@sentry/nextjs@^9.15.0`, `pnpm-workspace.yaml` has `@sentry/cli: true`, `.env.local.example` has commented `SENTRY_DSN=` | **NOT CONFIGURED**. No `sentry.config.ts`, no `instrumentation.ts`, no Sentry import anywhere in `src/`. |
| **Stripe** | `.env.local.example` has commented `STRIPE_SECRET_KEY=` | **NOT IMPORTED**. No Stripe SDK in `package.json`. |

**Implication for migration**: 5 of 9 declared services are inert
dependencies / aspirational config. The migration scope is therefore
**smaller than the user prompt implies**. The proposal phase can scope
the work around the 4 services that actually have code touching them
(Postgres, Redis, LiveKit, Auth) plus 3 housekeeping items (MinIO env
var in `next.config.ts`, drop Socket.io, configure Sentry).

---

## Affected Areas

### Service inventory — full file map

#### 1. Postgres (Drizzle + postgres-js)
- **Library**: `drizzle-orm@^0.43.1` + `postgres@^3.4.5` (in `package.json`)
- **Where instantiated**: `src/infrastructure/db/index.ts` (module-level singleton)
- **Env vars**: `DATABASE_URL` (required — throws at import), `TEST_DATABASE_URL` (integration tests)
- **Connection shape**: `postgres(connectionString, { max: 10 })`
- **Schema files**: `src/infrastructure/db/schema/*.ts` (8 files: `usuarios`, `doctores`, `pacientes`, `citas`, `audit-logs`, `consentimientos`, `doctor-availability`, `doctor-{condiciones,experiencia,servicios}`)
- **Migrations**: `src/infrastructure/db/migrations/0000` through `0005` (5 applied, plus `0004_modality.sql` and `0005_massive_se*.sql`)
- **Build-time vs runtime**: Runtime only
- **Drop-in compatibility with Vercel Postgres**: **YES** for connection string format (`postgres://user:pass@host/db`). BUT `postgres-js` with `max: 10` will exhaust Vercel Postgres connection limits under serverless burst (each Lambda instance opens its own pool). **Recommendation**: switch to `@vercel/postgres` (the Vercel-native pooled driver) OR use the pooler URL (`?pgbouncer=true&connection_limit=1`) on every serverless function.

#### 2. Redis (ioredis)
- **Library**: `ioredis@^5.6.1`
- **Where instantiated**: `src/infrastructure/redis/index.ts` (module-level singleton via `globalThis` cache)
- **Env vars**: `REDIS_URL` (optional — returns `null` if unset, cache and rate-limit degrade)
- **Usage sites**:
  - `src/infrastructure/redis/cache.ts` — `cacheGetOrSet`, `cacheInvalidate`, `webhookDedupe`
  - `src/infrastructure/redis/rate-limiter.ts` — `rateLimit` (sliding window via `multi.zremrangebyscore` + `zadd` + `zcard` + `expire`)
  - `src/infrastructure/api/trpc.ts` — `rateLimitedPublicProcedure` middleware (30 req / 10 sec per IP)
  - `src/infrastructure/api/routers/bookings.ts` — slot cache (`slots:<doctorId>:<date>`, TTL 30s)
  - `src/app/api/livekit/webhook/route.ts` — `webhookDedupe(event.id)` for LiveKit event idempotency
- **Build-time vs runtime**: Runtime only
- **Drop-in compatibility with Upstash Redis**: **PARTIAL**. ioredis supports `rediss://` (TLS) so Upstash's TLS TCP endpoint works as an env swap. BUT Vercel Functions are short-lived; ioredis TCP connections incur cold-start cost. **Better fit**: `@upstash/redis` (REST, HTTP-based, no connection pool). However, `@upstash/redis` is NOT a drop-in for ioredis — it has a different API (no `multi()`, no `eval()`, no `keys()`). The `rate-limiter.ts` uses `redis.multi()` (a transaction); that needs to be rewritten as multiple sequential commands. The `cache.ts` `cacheInvalidate("slots:*")` uses `redis.keys(pattern)` to find keys for bulk delete; Upstash has no `keys()`, so we'd need a tag-based approach or skip pattern invalidation.

#### 3. LiveKit (server SDK)
- **Library**: `livekit-server-sdk@2.15.4` (pinned), `@livekit/components-react@^2.9.4`, `@livekit/components-styles@^1.2.0`, `livekit-client@^2.11.4`
- **Where instantiated**: `src/infrastructure/livekit/livekit-server.ts` (eager module-level `livekitServerClient` const — throws at import if env vars missing)
- **Env vars**: `LIVEKIT_API_KEY` (server-only), `LIVEKIT_API_SECRET` (server-only, raw secret — NOT base64), `NEXT_PUBLIC_LIVEKIT_URL` (build-time inlined — `ws://` or `wss://` URL), `LIVEKIT_WEBHOOK_URL` (server-only, the URL LiveKit Cloud POSTs to)
- **Usage sites**:
  - `src/infrastructure/livekit/livekit-server.ts` — `createRoomToken` + `verifyWebhook` (WebhookReceiver from `livekit-server-sdk`)
  - `src/application/use-cases/bookings/get-room-token.use-case.ts` — issues JWT for the call
  - `src/app/api/livekit/webhook/route.ts` — verifies webhook signature (HS256 + body sha256)
  - `src/app/citas/[id]/llamada/page.tsx` — `<LiveKitRoom>` + `<VideoConference>` components
- **Build-time vs runtime**: Mixed. `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are server-only (runtime). `NEXT_PUBLIC_LIVEKIT_URL` is build-time inlined into the client bundle.
- **Drop-in compatibility with LiveKit Cloud**: **YES** for the server SDK (same `AccessToken` + `WebhookReceiver` APIs, just new `LIVEKIT_URL` + new API key). YES for the client SDK (same `@livekit/components-react`). The webhook URL changes from `https://livekit.angelina-consultoria.com/api/livekit/webhook` (currently in `.env.production.example` line 56) to whatever Vercel URL we deploy to. Caddy / Docker / `livekit.yaml` / `docker-compose.yml` / `docker/prod/` — ALL the self-hosted LiveKit infra — gets **deleted** in the migration.

#### 4. NextAuth (Auth.js v5)
- **Library**: `next-auth@^5.0.0-beta.28`
- **Where instantiated**: `src/auth.ts` (Credentials provider only — no OAuth, no email magic links)
- **Env vars**: `AUTH_SECRET` (required), `AUTH_TRUST_HOST` (optional, already in `.env`)
- **Usage sites**: `src/auth.ts`, `src/middleware.ts` (auth middleware), `src/app/api/auth/[...nextauth]/route.ts` (handlers), `src/components/providers.tsx` (`<SessionProvider>`)
- **Build-time vs runtime**: Runtime
- **Compatibility with Vercel**: **YES**. Auth.js v5 is designed for edge + serverless. The current setup uses JWT session strategy + Credentials provider, which is the most serverless-friendly option (no DB sessions). Needs `AUTH_URL` or `NEXTAUTH_URL` set to the production Vercel URL.

#### 5. PostHog (server + client)
- **Library**: `posthog-node@^5.37.0` + `posthog-js@^1.238.0`
- **Where instantiated**: `src/infrastructure/analytics/index.ts` (server, lazy), `src/providers/PostHogProvider.tsx` (client, lazy)
- **Env vars**: `NEXT_PUBLIC_POSTHOG_KEY` (build-time inlined), `NEXT_PUBLIC_POSTHOG_HOST` (build-time inlined), `POSTHOG_HOST` (server-only, optional — defaults to `https://us.i.posthog.com`)
- **Drop-in for managed**: Already managed. Just env vars.

#### 6. MinIO
- **Where referenced**: `next.config.ts` line 49 — `process.env.MINIO_PUBLIC_HOSTNAME ?? "minio.local"` in `images.remotePatterns`
- **Env vars**: `MINIO_PUBLIC_HOSTNAME` (build-time — defaults to `"minio.local"`)
- **Drop-in compatibility**: **NO** — but irrelevant because no code uses the MinIO SDK. Only `next.config.ts` needs updating.

#### 7. MeiliSearch
- **Library**: `meilisearch@^0.49.0` (in package.json but unused)
- **Where referenced**: `docker-compose.yml`, `.env.local.example` (`MEILISEARCH_HOST`, `MEILISEARCH_MASTER_KEY`), `openspec/specs/dev-setup/spec.md`
- **Drop-in compatibility**: **YES** for MeiliSearch Cloud (same JS client, just URL + key). But no code uses it today.

#### 8. Socket.io
- **Library**: `socket.io@^4.8.1` + `socket.io-client@^4.8.1` (in package.json but unused)
- **Where referenced**: `next.config.ts` line 42 — `serverExternalPackages: ["socket.io", "livekit-server-sdk"]`, `README.md`, `ARCHITECTURE.md`
- **Drop-in compatibility**: **NO** — Socket.io CANNOT run on Vercel Functions (no persistent WebSocket connection). And it's not actually used.

#### 9. Sentry
- **Library**: `@sentry/nextjs@^9.15.0`
- **Where referenced**: `package.json`, `pnpm-workspace.yaml` (`@sentry/cli: true`), `.env.local.example` (commented `SENTRY_DSN=`)
- **Drop-in compatibility**: **YES** for Sentry SaaS — needs config files (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`) + `SENTRY_DSN`.

---

### Env var landscape (full audit)

#### `.env.example` (committed, placeholders only)
```
DATABASE_URL=postgres://user:password@localhost:5432/angelina-consultoria
# TEST_DATABASE_URL=postgres://...
# REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxx...
# POSTHOG_HOST=https://us.i.posthog.com
LIVEKIT_API_KEY=changeme
LIVEKIT_API_SECRET=changeme-in-prod
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook
```

#### `.env.local.example` (committed, real dev values)
```
DATABASE_URL=postgres://medico:medico_pass@localhost:5432/medico_consulta
REDIS_URL=redis://localhost:6379
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_MASTER_KEY=dev-master-key
AUTH_SECRET=dev-secret-do-not-use-in-production
# STRIPE_SECRET_KEY=
# SENTRY_DSN=
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook
```

#### `.env.production.example` (committed, VPS-only — references VPS infra)
- LiveKit prod key/secret (base64 encoded for `docker/prod/livekit.yaml`)
- `NEXT_PUBLIC_LIVEKIT_URL=https://livekit.angelina-consultoria.com`
- `LIVEKIT_WEBHOOK_URL=https://angelina-consultoria.com/api/livekit/webhook`
- `CADDY_DOMAIN=livekit.angelina-consultoria.com`
- `CADDY_EMAIL=ops@angelina-consultoria.com`
- `LIVEKIT_NODE_IP=` (VPS public IP or DDNS)

#### `.env` / `.env.local` (git-ignored, current dev)
```
DATABASE_URL=postgres://medico:medico_pass@localhost:5432/medico_consulta
REDIS_URL=redis://localhost:6379
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_MASTER_KEY=dev-master-key
AUTH_SECRET=dev-secret-do-not-use-in-production
AUTH_TRUST_HOST=true
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```

#### `.github/workflows/ci.yml` env block
```
DATABASE_URL=postgres://angelina:angelina_pass@localhost:5432/angelina_consultoria_test
REDIS_URL=redis://localhost:6379
MEILISEARCH_HOST=http://localhost:7700
AUTH_SECRET=ci-secret
```

#### Source code references (grep `process.env.` across `src/`)

| Env var | File | Line | Scope |
|---|---|---|---|
| `REDIS_URL` | `src/infrastructure/redis/index.ts` | 13 | Runtime, optional |
| `NEXT_PUBLIC_POSTHOG_KEY` | `src/providers/PostHogProvider.tsx` | 8 | **Build-time** (inlined to client) |
| `NEXT_PUBLIC_POSTHOG_HOST` | `src/providers/PostHogProvider.tsx` | 9 | **Build-time** (inlined to client) |
| `NEXT_PUBLIC_POSTHOG_KEY` | `src/infrastructure/analytics/index.ts` | 6 | Runtime |
| `POSTHOG_HOST` | `src/infrastructure/analytics/index.ts` | 7 | Runtime, optional |
| `LIVEKIT_API_KEY` | `src/infrastructure/livekit/livekit-server.ts` | 50 | Runtime, **required** (throws at import) |
| `LIVEKIT_API_SECRET` | `src/infrastructure/livekit/livekit-server.ts` | 51 | Runtime, **required** (throws at import) |
| `NEXT_PUBLIC_LIVEKIT_URL` | `src/infrastructure/livekit/livekit-server.ts` | 52 | Server reads at runtime, **also** build-time inlined into client |
| `DATABASE_URL` | `src/infrastructure/db/index.ts` | 9 | Runtime, **required** (throws at import) |
| `NODE_ENV` | `src/app/error.tsx` | 41 | Build-time (Next.js sets it) |

#### `next.config.ts` env references
| Env var | Line | Scope | Impact |
|---|---|---|---|
| `APP_URL` | 33 | Runtime | Used in `Access-Control-Allow-Origin` header on `/api/:path*`. Default: `http://localhost:3000`. |
| `MINIO_PUBLIC_HOSTNAME` | 49 | Build-time (next.config is evaluated at build) | `images.remotePatterns` hostname. Default: `minio.local`. |

#### `playwright.config.ts` + `scripts/seed-*.ts` + `tests/integration/`
- `process.env.CI`, `process.env.APP_URL`, `process.env.LIVEKIT_E2E`, `process.env.DATABASE_URL`, `process.env.TEST_DATABASE_URL` — all test/script scope, not relevant to Vercel deploy.

#### Classification

| Env var | Required? | Scope | Public? | Migration target |
|---|---|---|---|---|
| `DATABASE_URL` | **Yes** | Runtime | Secret | Vercel Postgres `POSTGRES_URL` (auto-injected by Vercel) OR alias to it |
| `TEST_DATABASE_URL` | No | Test | Secret | GitHub Actions secret — keep |
| `REDIS_URL` | No | Runtime | Secret | Upstash Redis `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (REST API) OR `rediss://...` for ioredis-compatible TCP |
| `MEILISEARCH_HOST` | No | Runtime | Secret (with master key) | DROP (MeiliSearch not used) OR MeiliSearch Cloud `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` |
| `MEILISEARCH_MASTER_KEY` | No | Runtime | Secret | DROP (same) |
| `AUTH_SECRET` | **Yes** | Runtime | Secret | Generate with `openssl rand -base64 32`, store in Vercel project env |
| `AUTH_TRUST_HOST` | No | Runtime | Secret | Keep (required for Vercel: Vercel sets `X-Forwarded-Host`) |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | **Build-time** | Public | PostHog Cloud project API key |
| `POSTHOG_HOST` | No | Runtime | Secret | PostHog Cloud `https://us.i.posthog.com` |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | **Build-time** | Public | Same as above |
| `LIVEKIT_API_KEY` | **Yes** | Runtime | Secret | LiveKit Cloud project API key |
| `LIVEKIT_API_SECRET` | **Yes** | Runtime | Secret | LiveKit Cloud project API secret (raw, NOT base64) |
| `NEXT_PUBLIC_LIVEKIT_URL` | **Yes** | **Build-time** | Public | `wss://<project>.livekit.cloud` |
| `LIVEKIT_WEBHOOK_URL` | Yes (webhook signature check works regardless) | Runtime | Public-ish (webhook endpoint) | `https://<vercel-domain>/api/livekit/webhook` |
| `MINIO_PUBLIC_HOSTNAME` | **Yes (for `next/image`)** | **Build-time** | Public | `https://<blob-host>.vercel-storage.com` OR `https://<bucket>.r2.cloudflarestorage.com` |
| `APP_URL` | Yes | Runtime | Public | `https://<vercel-domain>` (used in CORS) |
| `SENTRY_DSN` | No | Runtime | Public | Sentry SaaS DSN (configure after Sentry files added) |
| `STRIPE_SECRET_KEY` | No | Runtime | Secret | N/A — not used |
| `CADDY_DOMAIN` / `CADDY_EMAIL` / `LIVEKIT_NODE_IP` | Yes (VPS only) | Runtime | Public | **DELETE entire VPS infra** — Caddy + Docker override + `docker-compose.yml` livekit service |

---

### Build-time concerns

#### 1. `serverExternalPackages` in `next.config.ts`
```ts
// next.config.ts line 42
serverExternalPackages: ["socket.io", "livekit-server-sdk"],
```
- `livekit-server-sdk` MUST stay — it uses native crypto (`node:crypto`) and needs to be bundled as external for the webhook route.
- `socket.io` should be REMOVED from this list when the dependency is removed from `package.json`. If we keep it (for future real-time features), it remains harmless.

#### 2. `NEXT_PUBLIC_*` inlined at build time
These env vars are inlined into the client bundle at `next build`. On Vercel, scope MUST be **"Build Command"** or **"Both"** — NOT runtime-only. Confirmed by `.env.production.example` R7 doc comment (lines 38-43 of that file).

| Var | What it inlines |
|---|---|
| `NEXT_PUBLIC_LIVEKIT_URL` | The `wss://` URL the browser uses to connect to LiveKit Cloud |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key in the browser |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host in the browser |

**Risk**: if set as runtime-only, the build inlines the Vercel default (which Next.js sets from `.env.production` → falls back to `.env.example` → `ws://localhost:7880`). The call page will fail with "connection refused".

#### 3. `next.config.ts` headers that reference env vars
```ts
// Line 33
{ key: "Access-Control-Allow-Origin", value: process.env.APP_URL ?? "http://localhost:3000" },
```
- `APP_URL` must be set on Vercel to the production domain, or the default `http://localhost:3000` will be returned as the CORS origin (which would block production requests from a different origin).

#### 4. `images.remotePatterns` (MinIO hostname)
```ts
// Line 49
hostname: process.env.MINIO_PUBLIC_HOSTNAME ?? "minio.local",
```
- `MINIO_PUBLIC_HOSTNAME` MUST be set on Vercel. The default `minio.local` is a dev placeholder and will fail image optimization in prod.
- After migration, this becomes the managed-storage hostname (Vercel Blob domain or Cloudflare R2 endpoint).

#### 5. Other build-time risks
- `next.config.ts` is evaluated at `next build`. Any env var referenced there is build-time scoped.
- `tests/setup.ts` defaults `LIVEKIT_API_KEY`/`SECRET`/`NEXT_PUBLIC_LIVEKIT_URL` for unit tests. After migration, these defaults still work for unit tests as long as the `livekit-server.ts` module doesn't try to actually connect.

---

### Vercel serverless constraints

#### 1. Socket.io on Vercel Functions
**BLOCKER**. Vercel Functions don't support persistent WebSocket connections. Socket.io needs long-lived stateful connections. The only paths forward:
- Drop Socket.io (no code uses it today — recommended).
- Move to a managed WebSocket service (Pusher, Ably, Cloudflare Durable Objects) when a real-time feature is actually needed.
- Use LiveKit DataChannel for in-call chat (out of scope per `video-calls-api/spec.md` REQ-LI-GRANT-CANPUBLISHDATA-FALSE).

#### 2. ioredis on Vercel Functions
**PARTIAL**. ioredis (TCP) works on Vercel but:
- Each Lambda instance opens its own pool; on burst, you can exhaust Upstash's connection limit.
- Cold-start penalty: opening a TCP+TLS connection to Upstash takes ~200-400ms.
- The existing client uses `maxRetriesPerRequest: 3` and `lazyConnect: true` — graceful, but still pays the cost on every cold invocation.

**Recommendation**: switch to `@upstash/redis` (REST-based) which has zero connection overhead. But that requires rewriting `cache.ts` (no `keys()` for pattern delete — use tag-based invalidation) and `rate-limiter.ts` (no `multi()` — sequential calls).

#### 3. File system / persistence assumptions
- **No filesystem writes** in source code (verified via grep).
- `@react-pdf/renderer` is in `package.json` but not yet wired (no `import` in source).
- No `fs.readFile` / `fs.writeFile` / `fs.mkdir` in `src/`.

#### 4. Long-running connections (LiveKit)
**MOSTLY OK**. The LiveKit server SDK only opens short-lived HTTP/TLS connections (for token signing) and the webhook receiver is stateless (verifies JWT, returns event). No persistent connection to LiveKit Cloud is needed by the Next.js server. The browser opens a WebRTC connection directly to LiveKit Cloud — that bypasses Vercel entirely.

#### 5. Cold starts and the eager LiveKit init
The `livekitServerClient` is a module-level `const` (per `livekit-infrastructure/spec.md` REQ-LI-INIT-1, archived 2026-06-23). On a cold Vercel Function:
- Module load runs the constructor → reads 3 env vars → if missing, throws.
- If present, the singleton is created and reused for the lifetime of the function instance.

**Mitigation**: ensure all `LIVEKIT_*` env vars are set in Vercel project settings BEFORE the first deploy. If they are unset, every page that transitively imports `bookings` router (most of the app) will return 500.

#### 6. Vercel Postgres connection pooling
The current `postgres-js` client opens `max: 10` connections per function instance. With Vercel's many-Lambda-per-deploy model, this exhausts Vercel Postgres connection limits fast. **Mitigation**: switch to `@vercel/postgres` (pooled via Vercel's built-in PgBouncer) OR use `?pgbouncer=true&connection_limit=1` on the connection string.

---

### Migration complexity per service

| Service | Current | Managed target | Code changes needed | Effort | Risk |
|---|---|---|---|---|---|
| **Postgres** | Self-hosted Docker, `postgres-js` driver | Vercel Postgres | Switch driver to `@vercel/postgres` OR add `?pgbouncer=true&connection_limit=1` to URL. Drizzle schema unchanged. | **Low** | Connection-limit exhaustion under burst |
| **Redis** | Self-hosted Docker, `ioredis` | Upstash Redis (TCP via `rediss://`) OR `@upstash/redis` (REST) | TCP: env swap only. REST: rewrite `cache.ts` and `rate-limiter.ts` (drop `multi()` and `keys()`). | **Low to Medium** | TCP has cold-start cost; REST requires API rewrite |
| **LiveKit** | Self-hosted Docker + Caddy | LiveKit Cloud | Same `livekit-server-sdk` and `@livekit/components-react`. Swap `LIVEKIT_API_KEY`/`SECRET`/`NEXT_PUBLIC_LIVEKIT_URL`. Update webhook URL. Delete VPS infra. | **Low** | None significant |
| **MinIO** | Self-hosted Docker | Vercel Blob OR Cloudflare R2 | No code today. `next.config.ts` `MINIO_PUBLIC_HOSTNAME` → managed hostname. (If we add file upload code, new SDK needed.) | **Low (no code today)** | Future file uploads will need new SDK + rewrite |
| **MeiliSearch** | Self-hosted Docker | DROP OR MeiliSearch Cloud | No code today. If keeping: env swap only. If dropping: remove `package.json` dep + Docker service + env vars. | **Low** | None — unused |
| **Socket.io** | Self-hosted VPS | **DROP** | Remove from `package.json` + remove from `next.config.ts serverExternalPackages`. No source code to update. | **Low** | None — unused |
| **Sentry** | Not configured | Sentry SaaS | Add `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`. Set `SENTRY_DSN`. | **Low** | None |
| **PostHog** | Managed (already) | Managed (already) | Env vars only. | **None** | None |
| **NextAuth** | Auth.js v5 Credentials | Same (already compatible with Vercel) | Set `AUTH_SECRET` + `AUTH_URL` (Vercel auto-injects `VERCEL_URL`). | **Low** | None |

---

### Affected code paths (consolidated list)

Files that WILL need changes during the migration (proposal phase will scope this):
- `next.config.ts` — `MINIO_PUBLIC_HOSTNAME` default, `serverExternalPackages` cleanup
- `src/infrastructure/db/index.ts` — driver change OR connection-string annotation
- `src/infrastructure/redis/index.ts` — client swap (ioredis → @upstash/redis if REST, no change if TCP)
- `src/infrastructure/redis/cache.ts` — pattern invalidation rewrite (only if @upstash/redis REST)
- `src/infrastructure/redis/rate-limiter.ts` — drop `multi()` (only if @upstash/redis REST)
- `src/infrastructure/livekit/livekit-server.ts` — env var rename (LIVEKIT_URL → NEXT_PUBLIC_LIVEKIT_URL kept, just new value)
- `src/infrastructure/analytics/index.ts` — `POSTHOG_HOST` is OK as-is
- `src/auth.ts` — possibly add `trustHost: true` (already in `.env` as `AUTH_TRUST_HOST=true`)
- `instrumentation.ts` (NEW) — Sentry init
- `sentry.server.config.ts` (NEW)
- `sentry.edge.config.ts` (NEW)
- `package.json` — drop `socket.io`, `socket.io-client`, possibly `meilisearch`; add `@upstash/redis` if REST, or `@vercel/postgres` if driver swap
- `docker-compose.yml` — remove `meilisearch`, `minio`, `livekit` services (or comment out)
- `docker/dev/livekit.yaml` — DELETE
- `docker/prod/livekit.yaml` — DELETE
- `docker/prod/Caddyfile` — DELETE
- `docker/prod/docker-compose.override.yml` — DELETE
- `Dockerfile` — verify still builds without the livekit/caddy infra
- `README.md`, `ARCHITECTURE.md`, `docs/SETUP.md`, `docs/livekit.md`, `docs/livekit-prod.md`, `docs/dev-setup.md` — rewrite deployment sections
- `.env.example`, `.env.local.example`, `.env.production.example` — rewrite env var list
- `.github/workflows/ci.yml` — remove Redis + MeiliSearch from CI if dropping
- `.github/workflows/deploy.yml` — add Sentry source map upload step

---

## Open Questions (for proposal phase)

These must be answered by the user BEFORE the proposal is written. Each
is a real fork with meaningful tradeoffs — not implementation detail.

1. **Redis: Upstash TCP (drop-in, cold-start cost) or Upstash REST (rewrite, no cold-start cost)?**
   - Upstash Redis over TLS (`rediss://...`) works with ioredis unchanged — but pays ~300ms cold-start per Lambda.
   - `@upstash/redis` REST is zero-connection-cost but requires rewriting `cacheInvalidate` (no `keys()`) and `rateLimit` (no `multi()`).
   - **Tradeoff**: code simplicity vs cold-start latency.

2. **Object storage: Vercel Blob (native, simple) or Cloudflare R2 (S3-compatible, no egress fees)?**
   - Vercel Blob is one env var + one SDK (`@vercel/blob`), no `next.config.ts` `remotePatterns` change needed (uses built-in optimization).
   - Cloudflare R2 is S3-compatible (could use `@aws-sdk/client-s3`) and zero egress cost, but requires more setup.
   - **Tradeoff**: simplicity vs cost at scale. (No code uses storage today — the decision is forward-looking.)

3. **MeiliSearch: keep (MeiliSearch Cloud), drop (Postgres FTS), or drop entirely?**
   - No source code uses MeiliSearch today. Keeping MeiliSearch Cloud = env var swap + JS client untouched.
   - Postgres full-text search (`tsvector` + `pg_trgm`) = no new service, but requires Drizzle query changes if/when search is implemented.
   - **Tradeoff**: future flexibility vs operational simplicity.

4. **NextAuth: stay on Credentials provider or move to OAuth/email magic links?**
   - Current: Credentials provider against `usuarios` table with bcrypt hashes.
   - **Implication**: if adding OAuth (Google/GitHub), need provider credentials + DB schema for account linking.
   - **Tradeoff**: dev simplicity vs user onboarding UX.

5. **Production domain: what's the final Vercel URL?**
   - Affects `AUTH_URL` / `NEXTAUTH_URL`, `APP_URL`, `NEXT_PUBLIC_LIVEKIT_URL` (LiveKit webhook reachability), CORS, `images.remotePatterns`.
   - Examples: `medico-consulta.vercel.app`, `medico.angelina-consultoria.com` (custom domain).
   - **Tradeoff**: subdomains, paths, HTTPS provision.

6. **LiveKit Cloud project name / region?**
   - Need to provision a LiveKit Cloud project before deploy (free tier exists for dev).
   - **Implication**: project name appears in the `wss://<project>.livekit.cloud` URL.

7. **Sentry: skip for MVP or add now?**
   - `@sentry/nextjs` is installed but unconfigured. Adding 3 config files + `SENTRY_DSN` is low effort.
   - **Tradeoff**: zero observability vs 15 min setup.

8. **Drop Socket.io and MeiliSearch from `package.json`, or keep them for future use?**
   - Dropping slims the Vercel build and removes an unused dependency surface.
   - Keeping preserves the original infrastructure assumption (real-time + search later).
   - **Tradeoff**: minimal install vs forward planning.

---

## Risks

| # | Severity | Risk | Why | Mitigation |
|---|---|---|---|---|
| R1 | **HIGH** | Eager LiveKit init fails the entire Vercel build if `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` is unset | `livekit-server.ts` is imported by `bookings.ts` router which is used by most pages. Any missing var throws at module load. | Set all 3 vars in Vercel project env BEFORE first deploy. Document in deploy runbook. |
| R2 | **HIGH** | `NEXT_PUBLIC_LIVEKIT_URL` set as runtime-only on Vercel inlines wrong URL into client bundle | Already documented footgun in `livekit-infrastructure/spec.md` (REQ-LI-PROD-1) and `.env.production.example` R7. | Vercel scope MUST be "Build Command" or "Both". Add to deploy runbook. |
| R3 | **HIGH** | `MINIO_PUBLIC_HOSTNAME` defaults to `minio.local` if unset — Next.js Image optimization breaks in prod | `next.config.ts` line 49. The default was a dev placeholder. | Set the env var to the managed storage hostname on Vercel. |
| R4 | **MEDIUM** | `postgres-js` with `max: 10` exhausts Vercel Postgres connection limits under burst | Each Lambda instance opens its own pool. Vercel Postgres has a connection cap per plan. | Use `@vercel/postgres` (pooled) OR `?pgbouncer=true&connection_limit=1`. |
| R5 | **MEDIUM** | ioredis TCP cold-start adds ~300ms to first request per Lambda | TCP+TLS handshake to Upstash | Switch to `@upstash/redis` REST (no connection), or accept the cold-start penalty. |
| R6 | **MEDIUM** | `cacheInvalidate("slots:*")` uses `redis.keys(pattern)` — Upstash REST has no `keys()` | Pattern-based bulk delete requires `SCAN` which is not exposed by Upstash REST. | Rewrite with explicit key list, or use tag-based invalidation. |
| R7 | **MEDIUM** | `rate-limiter.ts` uses `redis.multi()` (transaction) — Upstash REST has no transactions | `MULTI/EXEC` requires a persistent connection. | Rewrite as sequential calls (acceptable: small race window for rate-limit counter). |
| R8 | **LOW** | `posthog-node` buffers events in memory — Vercel Functions may exit before flush | Serverless functions are short-lived; the buffer is lost on instance recycle. | Switch to HTTP transport (`posthog-node`'s `flushAt: 1, flushInterval: 0`) OR accept event loss (PostHog is best-effort analytics). |
| R9 | **LOW** | E2E test `tests/e2e/videocall-2-users.spec.ts` requires self-hosted LiveKit container (`LIVEKIT_E2E=1`) | Test is opt-in and skipped by default. After migration to LiveKit Cloud, the test needs a Cloud dev project. | Either keep test gated + skip in CI, or provision LiveKit Cloud dev project for CI. |
| R10 | **LOW** | `socket.io` in `package.json` adds ~150KB to the Vercel build even though unused | Tree-shaking should drop it but `serverExternalPackages` keeps it external. | Drop from `package.json` + remove from `serverExternalPackages`. |
| R11 | **LOW** | `meilisearch` in `package.json` adds ~5MB (native bindings) to Vercel build | Same as above. | Drop from `package.json`. |
| R12 | **LOW** | `APP_URL` defaults to `http://localhost:3000` — CORS breaks in prod | `next.config.ts` line 33. The default is a dev placeholder. | Set `APP_URL` to the production domain on Vercel. |

---

## Recommendation

**Run `sdd-propose` next.** The exploration is conclusive enough to write
a proposal. The proposal should:

1. **Open a question round with the user** for the 8 open questions
   above (especially the Redis TCP-vs-REST fork, the storage Blob-vs-R2
   fork, and the MeiliSearch keep/drop decision).
2. **Plan 6 chained PRs** (auto-forecasted; each PR < 800 lines):
   - **PR1**: Postgres (drop-in env swap + connection pool fix)
   - **PR2**: Redis (decide TCP vs REST after Q1)
   - **PR3**: LiveKit (Vercel + Cloud + delete VPS infra)
   - **PR4**: Object storage (decide Blob vs R2 after Q2)
   - **PR5**: Auth + Sentry (env vars + config files)
   - **PR6**: Cleanup (drop Socket.io, drop or keep MeiliSearch, rewrite docs)
3. **Mark Socket.io and MeiliSearch as REMOVED by default** — the user
   can override in the question round. Removing them is the cleanest
   path because no code depends on them.

**Risk priority for the proposal**: R1 (eager LiveKit init) and R2
(build-time NEXT_PUBLIC_) are the two non-obvious blockers that the
proposal MUST call out in the rollback plan.

---

## Ready for Proposal

**Yes.** The exploration is conclusive. Run `sdd-propose` and use the
"Open Questions" section as the question-round input.

**Skill resolution**: paths-injected — 2 skills loaded
(`next-best-practices`, `vercel-react-best-practices`). Both confirmed
loaded before this report was written.

**Artifacts**:
- This file at `openspec/changes/migrate-managed-services/exploration.md`
- Engram observation at `sdd/migrate-managed-services/explore`
  (topic_key `explore/migrate-managed-services`, capture_prompt false)
