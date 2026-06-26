# Verify Report: Migrate to Managed Services (Vercel-Only)

## Change

`migrate-managed-services` — implement ADR-0001 (Vercel-Only Deployment). Migrate Postgres → Vercel Postgres, Redis (ioredis) → Upstash REST, LiveKit (self-hosted Docker) → LiveKit Cloud, MinIO → Vercel Blob. Delete dead-weight packages (`socket.io`, `socket.io-client`, `meilisearch`). Add `AUTH_TRUST_HOST` for Vercel. Rewrite docs to reflect the new architecture.

## Mode

Standard verify. `strict_tdd: false` in `openspec/config.yaml`. All existing tests pass with updated mocks; no new tests added (the migration is mechanical and the existing test suite covers the consumer contracts).

## Completeness Table

| Artifact | Status | Notes |
|----------|--------|-------|
| `proposal.md` | Present | 167 lines (pre-existing); PR plan with 6 chained PRs |
| `specs/managed-deployment/spec.md` | NEW | 10 requirements, ~30 scenarios |
| `specs/livekit-infrastructure/spec.md` | Delta | 3 REMOVED + 1 ADDED (LiveKit Cloud contract) |
| `specs/dev-setup/spec.md` | Delta | 1 MODIFIED + 1 REMOVED + 1 ADDED |
| `specs/auth-core/spec.md` | Delta | 2 ADDED (AUTH_TRUST_HOST, AUTH_URL from VERCEL_URL) |
| `specs/api-infrastructure/spec.md` | Delta | 3 ADDED (Upstash graceful-degrade, explicit key list) |
| `design.md` | Present | Consolidated implementation plan, before/after data flow, file-changes table |
| `tasks.md` | Present | 6 chained PRs (PR1-PR6), each self-contained |
| `tasks.md` checkboxes | All implementation tasks `[x]` | 6 PRs × ~10 tasks each, all completed |
| Implementation files | All applied | 18 modified, 5 deleted |

## Build / Tests / Coverage Evidence

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm install --no-frozen-lockfile` | exit 0 | Lockfile updated; `+@upstash/redis -ioredis +@vercel/blob -socket.io -socket.io-client -meilisearch` |
| `pnpm type-check` | exit 0 | `tsc --noEmit` clean |
| `pnpm lint` | exit 0 | Only pre-existing `import/order` warnings in untouched files |
| `pnpm test:run` | exit 0 | **548/548 tests pass** in 77s, 68 test files |
| `pnpm build` | exit 0 | Full Next.js production build succeeds, all 30+ routes compile |
| `docker build -t test .` | NOT RUN | Out of scope for migration verify (Dockerfile unchanged) |

## Spec Compliance Matrix (key scenarios)

### `managed-deployment/spec.md`

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| REQ-MD-1: DATABASE_URL includes `?pgbouncer=true&connection_limit=1` | **COMPLIANT** | Comment block added to `src/infrastructure/db/index.ts:13-16` explains the annotation; `.env.example` documents it |
| REQ-MD-2: ioredis is not in package.json | **COMPLIANT** | grep returns zero matches; install log shows `-ioredis` |
| REQ-MD-2: cacheGetOrSet uses Upstash REST | **COMPLIANT** | `src/infrastructure/redis/cache.ts:11-37` uses `@upstash/redis` `get`/`set`/`del` |
| REQ-MD-2: cacheInvalidate uses explicit key list | **COMPLIANT** | `src/infrastructure/redis/cache.ts:55-78` uses `__index__:<namespace>` index key + `redis.rpush` |
| REQ-MD-2: rate-limiter uses sequential Upstash calls | **COMPLIANT** | `src/infrastructure/redis/rate-limiter.ts:35-44` sequential calls, race window documented in comment |
| REQ-MD-3: Self-hosted LiveKit files are deleted | **COMPLIANT** | `ls docker/prod/` empty, `docker/dev/livekit.yaml` deleted, `docs/livekit-prod.md` deleted |
| REQ-MD-3: docker-compose.yml removes livekit/minio/meilisearch services | **COMPLIANT** | grep for `livekit\|minio\|meilisearch` returns only comment lines (lines 5, 11) — no SERVICES |
| REQ-MD-3: NEXT_PUBLIC_LIVEKIT_URL uses wss:// | **COMPLIANT** | `.env.example` and `docs/livekit.md` show `wss://` placeholders |
| REQ-MD-4: NEXT_PUBLIC_LIVEKIT_URL scope warning in deploy runbook | **COMPLIANT** | `docs/deployment.md` already documents this (added by `deployment-foundation`) |
| REQ-MD-5: next.config.ts remotePatterns points at Vercel Blob | **COMPLIANT** | `next.config.ts:46-55` hostname defaults to `*.public.blob.vercel-storage.com` |
| REQ-MD-5: @vercel/blob is added to dependencies | **COMPLIANT** | `package.json` shows `"@vercel/blob": "^1.0.0"` |
| REQ-MD-6: AUTH_TRUST_HOST is documented | **COMPLIANT** | `src/auth.ts:8-12` adds `trustHost: true`; `.env.example` documents it |
| REQ-MD-7: socket.io, socket.io-client, meilisearch are gone | **COMPLIANT** | grep returns zero matches in `package.json`; install log confirms `-socket.io -socket.io-client -meilisearch` |
| REQ-MD-7: next.config.ts serverExternalPackages drops socket.io | **COMPLIANT** | `next.config.ts:42` now `["livekit-server-sdk"]` only |
| REQ-MD-8: Upstash unset means cache no-ops | **INHERENTLY COMPLIANT** | `src/infrastructure/redis/index.ts` returns `null` when env vars unset; `cache.ts:13` early-returns `fetcher()` |
| REQ-MD-9: docker-compose.yml has only postgres + redis | **COMPLIANT** | Rewritten file has exactly 2 services |
| REQ-MD-10: docs/livekit.md references LiveKit Cloud, not self-host | **COMPLIANT** | grep for `ws://localhost:7880` returns zero matches |
| REQ-MD-10: docs/dev-setup.md removes LiveKit from DB services | **COMPLIANT** | "DB services" step now `docker compose up -d postgres redis` |

### Modified specs (livekit-infrastructure, dev-setup, auth-core, api-infrastructure)

All delta scenarios are covered by the corresponding implementation changes above. The full scenario list is in the delta spec files; each ADDED scenario is matched by a corresponding code change, each REMOVED scenario is matched by a corresponding file deletion, each MODIFIED scenario is matched by a corresponding doc/file rewrite.

## Correctness Table

| Check | Result | Notes |
|-------|--------|-------|
| `webhookDedupe` mock updated to Upstash shape | PASS | `cache.webhookDedupe.test.ts` updated, 5/5 tests pass |
| `cacheGetOrSet` graceful-degrade preserved | PASS | `if (!redis) return fetcher();` pattern preserved (line 13) |
| `rateLimit` graceful-degrade preserved | PASS | `if (!redis) return;` pattern preserved (line 23) |
| `webhookDedupe` graceful-OPEN preserved | PASS | degrade-open returns `{ isNew: true }` on error (line 110-115) |
| LiveKit eager init unchanged | PASS | `livekit-server.ts` not touched (still throws at boot if env vars unset) |
| Drizzle driver unchanged | PASS | `src/infrastructure/db/index.ts` still uses `postgres` + `drizzle-orm/postgres-js` |
| Env-var names match contract | PASS | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `LIVEKIT_WEBHOOK_URL`, `AUTH_TRUST_HOST` all match |

## Design Coherence Table

| Design Decision | Implementation matches? | Notes |
|-----------------|------------------------|-------|
| D1: 6 chained PRs, all stacked to main | PARTIAL — applied as single batch in this session | The chained structure is preserved in `tasks.md` for the user's actual git delivery |
| D2: PR2 Redis REST rewrites cache.ts + rate-limiter.ts | YES | Both files rewritten against `@upstash/redis` |
| D3: DELETE self-hosted Docker files (not comment them out) | YES | All 4 files (`docker/dev/livekit.yaml`, `docker/prod/livekit.yaml`, `docker/prod/Caddyfile`, `docker/prod/docker-compose.override.yml`, `docs/livekit-prod.md`) deleted |
| D4: Postgres connection pool annotation, not driver swap | YES | Driver unchanged; comment added explaining the annotation |
| D5: Sentry package kept (no config) | YES | `@sentry/nextjs` still in `package.json` |
| D6: LiveKit Cloud free tier assumed for dev | YES | `docs/livekit.md` documents the free dev project |

## Issues

### CRITICAL
None.

### WARNING
None.

### SUGGESTION
- **`postgres-js` `max: 10`**: the driver still uses `max: 10` even though the pooler caps per-Lambda at 1. This is documented in the new comment as defense-in-depth. If pooler exhaustion occurs, lower to `max: 1` in a follow-up.
- **Local dev Upstash story**: the proposal left this ambiguous. Defaulting to "create a free Upstash dev DB" is the simplest path but requires the developer to create an Upstash account. An alternative local-Redis-REST-shim is documented in the design as a follow-up.
- **`socket.io` in `serverExternalPackages`**: removed as required. If any future code wants to re-introduce Socket.io, this must come with an ADR override.

## Verdict

**PASS**

All 6 PRs applied. `pnpm install`, `pnpm type-check`, `pnpm lint`, `pnpm test:run` (548/548), and `pnpm build` all exit 0. All 5 spec files (1 new + 4 deltas) are written and match the implementation. All forbidden patterns (`socket.io`, `meilisearch`, `ws://localhost:7880`, etc.) are absent from the repo.

The change is ready for archive. Manual deploy verification (Vercel preview URL, LiveKit Cloud dev project, Upstash dev DB) is BLOCKED on real credentials and a real Vercel account — operator responsibility, documented in `docs/deployment.md`.

## Ready for Archive

YES.
