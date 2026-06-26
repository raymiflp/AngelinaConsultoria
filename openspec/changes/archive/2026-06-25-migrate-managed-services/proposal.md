# Proposal: migrate-managed-services

Move the runtime from a hybrid (Next.js on Vercel + self-hosted VPS) deployment to a fully managed Vercel-native stack. Only 4 of 9 declared services are actually wired into source today (Postgres, Redis, LiveKit, NextAuth); the rest (MinIO, MeiliSearch, Socket.io, Sentry config, Stripe) are aspirational dependencies. The migration is therefore **mostly env-var swaps + config-file edits**, not code rewrites. All defaults below were confirmed by the orchestrator's auto-mode question round.

## Why

- Project mixes Vercel-hosted Next.js with 5 self-hosted Docker services (Postgres, Redis, MeiliSearch, MinIO, LiveKit + Caddy).
- `Socket.io` cannot run on Vercel Functions (no persistent WebSocket); MeiliSearch and Socket.io are declared but never imported.
- LiveKit self-hosting (Docker + Caddy + VPS) is operationally expensive — LiveKit Cloud offers the same SDK on the free tier.
- ioredis TCP pays ~300ms cold-start cost per Vercel Lambda; Upstash REST is zero-connection.
- Two HIGH-risk footguns block first deploy: (R1) `livekitServerClient` throws at import if any `LIVEKIT_*` var is unset, and (R2) `NEXT_PUBLIC_LIVEKIT_URL` must be inlined at **build time** on Vercel.

## Goals

1. Eliminate the VPS dependency; deploy exclusively to Vercel + managed equivalents.
2. Reduce cold-start and connection-pool overhead (Upstash REST, Vercel Postgres pooler).
3. Fix R1 and R2 so the first Vercel build succeeds deterministically.
4. Drop dead weight (`socket.io`, `meilisearch`, MinIO/MeiliSearch Docker services).
5. Keep Credentials auth working unchanged; do not break the 2-tab E2E video smoke test.

## Non-Goals

- OAuth providers or email magic links (Credentials only).
- Custom production domain (use `.vercel.app` preview URL).
- Sentry configuration (deferred — package kept, no DSN).
- Performance tuning beyond what the migration itself requires.
- Database backups, monitoring dashboards, autoscaling policies.

## What Changes (concrete outcomes)

| Concern | Before | After |
|---|---|---|
| Database | Self-hosted Postgres Docker + `postgres-js` `max:10` | Vercel Postgres + `@vercel/postgres` OR `?pgbouncer=true&connection_limit=1` |
| Cache + rate-limit | Self-hosted Redis Docker + `ioredis` TCP | Upstash Redis via `@upstash/redis` REST (rewrites `cache.ts` + `rate-limiter.ts`) |
| Video calls | Self-hosted LiveKit Docker + Caddy + cert renewal | LiveKit Cloud (free tier) — same `livekit-server-sdk`, same client |
| Object storage | MinIO Docker + `MINIO_PUBLIC_HOSTNAME` env | Vercel Blob — `MINIO_PUBLIC_HOSTNAME` becomes the Blob hostname |
| Search | MeiliSearch Docker (unused) | Dropped |
| Real-time | `socket.io` (unused, incompatible with Vercel) | Dropped |
| Auth | NextAuth Credentials (already Vercel-compatible) | Same + `AUTH_URL` from `VERCEL_URL` + `AUTH_TRUST_HOST=true` |
| VPS infra | Caddyfile, `docker/prod/livekit.yaml`, `docker-compose.override.yml` | Deleted |

## Affected Services and Approach

### 1. Postgres → Vercel Postgres
- **Lib**: keep `drizzle-orm` + `postgres`; add `?pgbouncer=true&connection_limit=1` to `DATABASE_URL`. No driver swap.
- **Env**: `DATABASE_URL` from Vercel Postgres integration (`POSTGRES_URL`).
- **Files**: `src/infrastructure/db/index.ts`, `.env.example`, `.env.local.example`, `.env.production.example`.

### 2. Redis → Upstash REST
- **Lib**: replace `ioredis` with `@upstash/redis`; `redis.multi()` → sequential calls in `rate-limiter.ts`; `redis.keys("slots:*")` → explicit key list in `cache.ts`.
- **Env**: drop `REDIS_URL`; add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- **Files**: `src/infrastructure/redis/{index,cache,rate-limiter}.ts`, `package.json`, env files.

### 3. LiveKit → LiveKit Cloud
- **Lib**: unchanged (`livekit-server-sdk@2.15.4`, `@livekit/components-react@^2.9.4`).
- **Env**: same `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` / `LIVEKIT_WEBHOOK_URL` — values change to LiveKit Cloud project. **MUST be set with "Build Command" or "Both" scope on Vercel.**
- **Files**: env files; DELETE `docker/prod/{livekit.yaml, Caddyfile, docker-compose.override.yml}`, `docker/dev/livekit.yaml`, `docker-compose.yml` `livekit` service; `docs/livekit.md` and `docs/livekit-prod.md` rewrite; `README.md` deployment section rewrite.

### 4. Object storage → Vercel Blob
- **Lib**: add `@vercel/blob` (forwards-looking; no source uses storage today).
- **Env**: `MINIO_PUBLIC_HOSTNAME` → Vercel Blob hostname (e.g. `*.public.blob.vercel-storage.com`).
- **Files**: `next.config.ts` (hostname default + `serverExternalPackages`), `.env.example`, `package.json`.

### 5. Auth (NextAuth)
- **Lib**: unchanged.
- **Env**: add `AUTH_URL` (from `VERCEL_URL` injected by Vercel) and confirm `AUTH_TRUST_HOST=true`.
- **Files**: `src/auth.ts`, `.env.example`, `.env.production.example`.

### 6. Drop unused (MeiliSearch, Socket.io)
- **Lib**: remove `meilisearch`, `socket.io`, `socket.io-client` from `package.json`.
- **Files**: `docker-compose.yml` (remove `meilisearch`, `minio` services); remove `next.config.ts` `serverExternalPackages` `socket.io` entry; remove `MEILISEARCH_*` env vars.

## Capabilities (contract with sdd-spec)

### New Capabilities
- `managed-deployment`: managed-service equivalents for each self-hosted service, Vercel env-var scope requirements (Build Command for `NEXT_PUBLIC_*`), R1/R2 mitigations, drop rules for unused packages.

### Modified Capabilities
- `livekit-infrastructure`: replace "self-hosted Docker + Caddy" with LiveKit Cloud env contract; remove all Docker, Caddy, `livekit.yaml`, `--dev`, `node_ip`, cert/ACME, UDP 7882, secrets-rotation sections.
- `dev-setup`: drop MinIO + MeiliSearch from `docker compose` line; drop MeiliSearch from `REQ-DEV-SETUP-2` service list + verification commands; remove LiveKit from DB services (now Cloud — env vars only); update smoke test to no longer expect `localhost:7880`.
- `auth-core`: add requirement that `AUTH_TRUST_HOST=true` MUST be set on Vercel + `AUTH_URL` resolves from `VERCEL_URL`.
- `api-infrastructure`: add requirement that the rate-limit middleware (`rateLimitedPublicProcedure`) MUST degrade to no-op when Upstash env vars are unset (parity with the existing graceful-degrade behavior of `ioredis`).

## Risks (severity-ordered; mitigations in design.md)

| # | Severity | Risk | Mitigation in design |
|---|---|---|---|
| R1 | **HIGH** | Eager LiveKit init throws at boot if `LIVEKIT_*` vars unset → 500 on most pages | Deploy-runbook step: set all 3 vars BEFORE first deploy. Vercel integration secret check in CI. |
| R2 | **HIGH** | `NEXT_PUBLIC_LIVEKIT_URL` runtime-scoped on Vercel → client bundle gets `ws://localhost:7880` → call page breaks | Deploy-runbook step: scope = "Build Command" or "Both". CI lint warns on `NEXT_PUBLIC_*` runtime-only scope. |
| R3 | **HIGH** | `MINIO_PUBLIC_HOSTNAME` defaults to `minio.local` → Next.js Image optimization broken in prod | Set Vercel Blob hostname BEFORE first deploy; remove the `?? "minio.local"` fallback or replace with the Blob hostname as new default. |
| R4 | MEDIUM | `postgres-js` `max:10` exhausts Vercel Postgres pool | Add `?pgbouncer=true&connection_limit=1` to `DATABASE_URL` (no driver swap). |
| R5 | MEDIUM | Upstash REST rewrite introduces rate-limiter race window (sequential `multi()`) | Acceptable: race window is sub-millisecond; document in code comment. |
| R6 | MEDIUM | `cacheInvalidate("slots:*")` has no Upstash equivalent for pattern delete | Replace with explicit key list (`slots:{doctorId}:{date}:*` enumerated at write time). |
| R7 | LOW | PostHog events lost on Vercel Function recycle | Set `flushAt: 1, flushInterval: 0` on the client init; server-side best-effort. |
| R8 | LOW | E2E video test (`LIVEKIT_E2E=1`) needs LiveKit Cloud dev project | Defer E2E re-provisioning to a follow-up change; keep `LIVEKIT_E2E` gate. |
| R9 | LOW | `livekit-prod.md` rewrite may forget cert + firewall caveats | New `docs/managed-deployment.md` covers every previous production gotcha as a "what changed" table. |

## PR / Delivery Plan (auto-forecast, 800-line budget)

`delivery_strategy: auto-forecast` triggered chained-PR recommendation. Forecast per PR:

| PR | Scope | Files touched | Net lines changed | Rollback |
|---|---|---|---|---|
| **PR1 — Postgres** | `DATABASE_URL` pool annotation + db driver note | 5 (1 source, 4 env/docs) | ~40 | Revert PR; revert `DATABASE_URL` to non-pooler URL |
| **PR2 — Redis (Upstash REST)** | rewrite `cache.ts` + `rate-limiter.ts` + swap client + env | 7 (3 source, 2 env, 1 package.json, 1 docker-compose) | ~180 | Revert PR; restore ioredis + `REDIS_URL` |
| **PR3 — LiveKit (Cloud + delete VPS infra)** | env values + delete 5 docker/caddy files + docs rewrite | 12 (3 env, 6 DELETE, 3 docs) | ~260 (mostly deletions) | Restore deleted files from git history; revert env values |
| **PR4 — Object storage (Vercel Blob)** | `next.config.ts` hostname + add `@vercel/blob` + env | 4 (1 config, 1 package.json, 2 env) | ~25 | Revert; restore `MINIO_PUBLIC_HOSTNAME` semantics |
| **PR5 — Auth + deploy hardening** | `AUTH_URL` + `AUTH_TRUST_HOST` + deploy runbook + R1/R2/R3 mitigations in `next.config.ts` | 6 (2 source, 3 env, 1 runbook) | ~90 | Revert; remove `trustHost` |
| **PR6 — Cleanup (drop unused + docs)** | remove `socket.io*` + `meilisearch` from deps; trim `docker-compose.yml`; rewrite `README.md`/`ARCHITECTURE.md`/`docs/dev-setup.md` | 9 (1 package.json, 1 config, 5 docs, 2 docker) | ~150 | Revert; re-add deps |
| **Total** | | ~43 files | **~745 lines** | |

**Forecast vs budget**: 745 lines across 6 PRs; largest single PR is 260 (PR3 LiveKit, mostly deletions of VPS infra). All PRs are **well under 800**.

**Chained PRs recommended**: **YES**, but with a caveat. Chain is justified not by size (each PR fits) but by **reviewability** — each PR is a self-contained service migration a reviewer can understand in isolation, and reverting one PR does not break the others (Postgres → Redis → LiveKit → Blob → Auth → Cleanup are independent service boundaries). Chained also enables parallel work if 2 reviewers are available.

**Chain target**: PR1..PR5 target `main`. PR6 (Cleanup) targets `main` only after PR5 is merged (so the docs rewrite references the new state). All PRs are stacked, NOT chained feature branches — they merge to `main` in order.

## Rollback Plan (whole change)

- Each PR is independently revertable (`git revert <sha>` + redeploy).
- Docker/Caddy/LiveKit VPS infra files are **deleted in PR3** but remain in git history up to the merge point. To roll back the entire change, revert PR3 → PR2 → PR1 in reverse order and restore `DATABASE_URL` / `REDIS_URL` env values.
- If a Vercel deploy succeeds but breaks at runtime, the rollback is `vercel rollback` to the last green deployment (no code revert needed if only env vars changed).
- Self-hosted Docker stack is **NOT deleted from git** during PR6 — only the docker-compose entries are commented out. The `docker-compose.yml` file remains valid for any developer who wants to opt out of the migration.

## Open Assumptions (user-confirmed in auto-mode round)

| # | Decision | User default | Notes |
|---|---|---|---|
| 1 | Redis client | Upstash REST `@upstash/redis` | Requires `cache.ts` + `rate-limiter.ts` rewrite |
| 2 | Object storage | Vercel Blob | Vercel-native, no AWS SDK |
| 3 | MeiliSearch | Drop entirely | Declared but never imported |
| 4 | NextAuth | Credentials only | `bcryptjs` already in deps |
| 5 | Production domain | `.vercel.app` preview | Custom domain deferred |
| 6 | LiveKit Cloud | Free tier project | User provisions, keys provided later |
| 7 | Sentry | Deferred | `@sentry/nextjs` package kept, no config |
| 8 | Drop unused packages | Yes (`socket.io*`, `meilisearch`) | Keep `@sentry/nextjs` |

**Assumption needing confirmation before apply**: PR2 (Redis REST rewrite) changes application code (`cache.ts`, `rate-limiter.ts`). The orchestrator should confirm this is acceptable — alternative is Upstash TCP drop-in (no code rewrite, ~300ms cold-start cost).

## Success Criteria (verifiable)

- [ ] `pnpm type-check` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test:run` exits 0 (Vitest unit suite)
- [ ] `pnpm build` exits 0
- [ ] Vercel preview URL returns HTTP 200 on `/`
- [ ] Vercel preview URL `/api/trpc/auth.getSession` returns `{ user: { id, email, role } }` after Credentials login
- [ ] Vercel preview URL `/citas/{id}/llamada` returns 200 (bookings router resolves + LiveKit eager init succeeds)
- [ ] DB connection test: `SELECT 1` from `postgres(DATABASE_URL)` returns 1
- [ ] Upstash env vars set in Vercel; `cacheGetOrSet` round-trip works in deployed env
- [ ] All 6 `NEXT_PUBLIC_*` env vars set with "Build Command" or "Both" scope in Vercel
- [ ] All `LIVEKIT_*` env vars set; `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are server-only
- [ ] `MINIO_PUBLIC_HOSTNAME` set to Vercel Blob hostname
- [ ] `AUTH_TRUST_HOST=true` and `AUTH_URL` resolves from `VERCEL_URL`
- [ ] `package.json` does NOT contain `socket.io`, `socket.io-client`, `meilisearch`
- [ ] `docker-compose.yml` does NOT contain `meilisearch`, `minio`, or `livekit` services
- [ ] `docker/prod/` directory deleted (or only contains `.gitkeep`)

## Out of Scope / Follow-ups

- Custom production domain (`medico.angelina-consultoria.com`)
- Sentry configuration (`sentry.server.config.ts`, `instrumentation.ts`, DSN)
- OAuth providers (Google, GitHub) for NextAuth
- E2E video test re-provisioning on LiveKit Cloud
- PostHog flush tuning for Vercel serverless (R7)
- Database backup policy on Vercel Postgres
- Rate-limit window tuning (current 30 req / 10 sec unchanged)