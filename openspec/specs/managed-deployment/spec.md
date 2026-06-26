# Managed Deployment Specification

## Purpose

Define the contract for the Vercel-native managed-service stack that replaces the previously self-hosted Docker services. Covers the env-var matrix for Vercel Postgres, Upstash REST (Redis-compatible), LiveKit Cloud, and Vercel Blob; the Vercel env-var scope requirements (Build Command for `NEXT_PUBLIC_*`); the graceful-degrade contract for managed-service integrations; and the deletion rules for the three dead-weight packages (`socket.io`, `socket.io-client`, `meilisearch`).

This spec exists because ADR-0001 (Vercel-Only Deployment) ratified the architectural decision, and this spec is the testable contract that proves the implementation conforms to the ADR. If a future change wants to re-introduce self-hosted infrastructure, this spec is what must be modified or superseded.

## Requirements

### REQ-MD-1: Vercel Postgres connection string uses the pgbouncer pooler

The `DATABASE_URL` environment variable on Vercel MUST be configured with the Vercel Postgres pooler annotation `?pgbouncer=true&connection_limit=1` (or equivalent) appended to the connection string. The `postgres-js` driver in `src/infrastructure/db/index.ts` MUST be left unchanged (no driver swap). The `max: 10` connection pool in the driver MUST be reduced or wrapped so that a single Vercel Function instance does not exhaust the pooler's per-connection budget.

#### Scenario: DATABASE_URL includes pgbouncer query params

- GIVEN a Vercel production environment
- WHEN the `DATABASE_URL` env var is read
- THEN the connection string MUST contain `?pgbouncer=true`
- AND the connection string MUST contain `connection_limit=1` (or an equivalent per-Lambda cap)

#### Scenario: postgres-js driver is unchanged

- GIVEN `src/infrastructure/db/index.ts`
- WHEN the file is read
- THEN it MUST still import from `postgres`
- AND it MUST NOT import from `@vercel/postgres` (no driver swap)

### REQ-MD-2: Redis usage goes through @upstash/redis REST

The `ioredis` TCP client MUST be removed from `package.json` and the codebase. The replacement client MUST be `@upstash/redis` configured to use the REST API (NOT the TCP API). The env var `REDIS_URL` MUST be replaced by `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The functions exported from `src/infrastructure/redis/cache.ts` (`cacheGetOrSet`, `cacheInvalidate`) and `src/infrastructure/redis/rate-limiter.ts` MUST be rewritten against the REST SDK.

The `cacheInvalidate` pattern-delete (`redis.keys(pattern)` + `redis.del(...keys)`) MUST be replaced by an explicit-key-list approach: the cache layer MUST track the set of keys written under a logical namespace and invalidate them by enumerating the explicit list at write time.

The `rate-limiter.ts` `redis.multi()` transaction MUST be replaced by sequential calls (Upstash REST has no `MULTI` primitive). The race window introduced by sequential calls is sub-millisecond and MUST be documented in a code comment.

#### Scenario: ioredis is not in package.json

- GIVEN `package.json` after the migration
- WHEN the file is read
- THEN `"ioredis"` MUST NOT appear in `dependencies`
- AND `"@upstash/redis"` MUST appear in `dependencies`

#### Scenario: cacheGetOrSet uses Upstash REST

- GIVEN `src/infrastructure/redis/cache.ts` after the migration
- WHEN the `cacheGetOrSet` function is called with a key and a fetcher
- THEN it MUST use `@upstash/redis` REST methods (NOT `ioredis` methods)
- AND if `UPSTASH_REDIS_REST_URL` is unset, the function MUST return the fetcher's result (graceful-degrade, no exception)

#### Scenario: cacheInvalidate uses explicit key list

- GIVEN `src/infrastructure/redis/cache.ts` after the migration
- WHEN the `cacheInvalidate` function is called with a namespace prefix
- THEN it MUST NOT use a pattern-delete API (`KEYS` / `SCAN` + `DEL`)
- AND it MUST invalidate by enumerating the explicit key list tracked at write time

#### Scenario: rate-limiter uses sequential Upstash calls

- GIVEN `src/infrastructure/redis/rate-limiter.ts` after the migration
- WHEN the rate-limit check runs
- THEN it MUST NOT call `redis.multi()`
- AND the increment + expiry MUST be sequential Upstash REST calls
- AND a code comment MUST document the sub-millisecond race window

#### Scenario: REDIS_URL is replaced by UPSTASH_* env vars

- GIVEN the env files after the migration
- WHEN `.env.example` is read
- THEN `REDIS_URL` MUST NOT appear
- AND `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` MUST appear (as placeholders)

### REQ-MD-3: LiveKit Cloud replaces the self-hosted SFU

The self-hosted LiveKit container (`docker-compose.yml` `livekit` service, `docker/dev/livekit.yaml`, `docker/prod/livekit.yaml`, `docker/prod/Caddyfile`, `docker/prod/docker-compose.override.yml`) MUST be deleted from the repo. The LiveKit integration code in `src/infrastructure/livekit/livekit-server.ts` MUST continue to use `livekit-server-sdk` (no SDK swap) but the env-var contract MUST target LiveKit Cloud.

The env vars `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_WEBHOOK_URL` MUST remain but their values change to the LiveKit Cloud project's credentials and URLs. `NEXT_PUBLIC_LIVEKIT_URL` MUST be set to `wss://<livekit-cloud-project>.livekit.cloud` (NOT `ws://` — LiveKit Cloud mandates TLS).

#### Scenario: Self-hosted LiveKit files are deleted

- GIVEN the repo after the migration
- WHEN the file tree is inspected
- THEN `docker/dev/livekit.yaml` MUST NOT exist
- AND `docker/prod/livekit.yaml` MUST NOT exist
- AND `docker/prod/Caddyfile` MUST NOT exist
- AND `docker/prod/docker-compose.override.yml` MUST NOT exist

#### Scenario: docker-compose.yml removes livekit + minio + meilisearch services

- GIVEN `docker-compose.yml` after the migration
- WHEN the file is read
- THEN the `livekit` service MUST NOT be present
- AND the `minio` service MUST NOT be present
- AND the `meilisearch` service MUST NOT be present
- AND only `postgres` and `redis` services MUST remain (for local dev)

#### Scenario: LiveKit SDK is unchanged

- GIVEN `package.json` after the migration
- WHEN the file is read
- THEN `livekit-server-sdk` MUST still be in `dependencies`
- AND `@livekit/components-react` MUST still be in `dependencies`

#### Scenario: NEXT_PUBLIC_LIVEKIT_URL uses wss:// for LiveKit Cloud

- GIVEN the Vercel production env vars
- WHEN `NEXT_PUBLIC_LIVEKIT_URL` is read
- THEN it MUST start with `wss://`
- AND it MUST NOT start with `ws://` (LiveKit Cloud mandates TLS)

### REQ-MD-4: NEXT_PUBLIC_* env vars are scoped to Build Command on Vercel

All `NEXT_PUBLIC_*` environment variables MUST be configured in the Vercel project's Environment Variables page with scope **Production** and scope **Build Command** (or **Both**). Setting them with scope **Runtime** is incorrect and MUST be flagged in the deploy runbook.

The build-time-inlined warning MUST be present in `docs/deployment.md` (added by `deployment-foundation`) and MUST also be referenced from `docs/dev-setup.md` so the operator sees it during dev onboarding.

#### Scenario: NEXT_PUBLIC_LIVEKIT_URL is scoped to Build Command

- GIVEN a Vercel production environment
- WHEN `NEXT_PUBLIC_LIVEKIT_URL` is configured
- THEN the Vercel Environment Variables page MUST show scope = "Build Command" or "Both"
- AND the scope MUST NOT be "Runtime" only

#### Scenario: Deploy runbook calls out build-time-inlining

- GIVEN `docs/deployment.md`
- WHEN the "Vercel Build-Time Env Vars" section is read
- THEN `NEXT_PUBLIC_LIVEKIT_URL` MUST be listed
- AND the warning about runtime-only scope MUST be present

### REQ-MD-5: Object storage uses Vercel Blob

The `minio` Docker service MUST be deleted (covered by REQ-MD-3). The `next.config.ts` `images.remotePatterns` hostname MUST be updated to point at the Vercel Blob public hostname pattern (`*.public.blob.vercel-storage.com`). The env var `MINIO_PUBLIC_HOSTNAME` MUST be renamed (or repurposed) to point at the Vercel Blob hostname. The `@vercel/blob` package MUST be added to `dependencies` (forward-looking — no current code uses storage).

#### Scenario: next.config.ts remotePatterns points at Vercel Blob

- GIVEN `next.config.ts` after the migration
- WHEN the `images.remotePatterns` block is read
- THEN the `hostname` field MUST match the Vercel Blob public hostname pattern (default `*.public.blob.vercel-storage.com`)
- AND the default fallback `?? "minio.local"` MUST be removed or replaced

#### Scenario: @vercel/blob is added to dependencies

- GIVEN `package.json` after the migration
- WHEN the file is read
- THEN `"@vercel/blob"` MUST appear in `dependencies`

### REQ-MD-6: Auth.js v5 uses AUTH_TRUST_HOST and AUTH_URL from VERCEL_URL

The NextAuth configuration in `src/auth.ts` MUST set `trustHost: true` (or equivalent) when running on Vercel. The `AUTH_URL` env var MUST be set on Vercel using the value of `VERCEL_URL` (Vercel injects this automatically per-deploy). `AUTH_SECRET` MUST continue to be set explicitly (not auto-generated by Vercel).

#### Scenario: AUTH_TRUST_HOST is documented and set

- GIVEN `src/auth.ts` after the migration
- WHEN the file is read
- THEN `trustHost: true` MUST be set (or `AUTH_TRUST_HOST=true` MUST be set as an env var)
- AND `.env.example` MUST include `AUTH_TRUST_HOST=true` as a placeholder

#### Scenario: AUTH_URL resolves from VERCEL_URL

- GIVEN a Vercel production deployment
- WHEN `AUTH_URL` is read by NextAuth
- THEN it MUST equal the value of `VERCEL_URL` (or be unset, in which case NextAuth falls back to the request URL — acceptable but not preferred)

### REQ-MD-7: Dead-weight packages are removed from package.json

The packages `socket.io`, `socket.io-client`, and `meilisearch` MUST be removed from `package.json` `dependencies`. The packages were declared but never imported in `src/` (verified at proposal time). The `@sentry/nextjs` package MUST be kept (configured in a future change, not this one).

The `next.config.ts` `serverExternalPackages` array MUST be updated: `socket.io` MUST be removed. `livekit-server-sdk` MUST be kept.

#### Scenario: socket.io, socket.io-client, meilisearch are gone

- GIVEN `package.json` after the migration
- WHEN the file is read
- THEN `"socket.io"` MUST NOT appear in `dependencies` or `devDependencies`
- AND `"socket.io-client"` MUST NOT appear
- AND `"meilisearch"` MUST NOT appear
- AND `"@sentry/nextjs"` MUST still appear (deferred config)

#### Scenario: next.config.ts serverExternalPackages drops socket.io

- GIVEN `next.config.ts` after the migration
- WHEN the `serverExternalPackages` array is read
- THEN `"socket.io"` MUST NOT be in the array
- AND `"livekit-server-sdk"` MUST still be in the array

### REQ-MD-8: Managed-service integrations degrade gracefully when env vars are unset

Every managed-service integration (Upstash REST, LiveKit Cloud, Vercel Postgres) MUST degrade gracefully when its env vars are unset. Specifically:

- **Upstash REST**: if `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is unset, the cache and rate-limiter MUST no-op (return fetcher result, allow request). This matches the existing `ioredis` graceful-degrade behavior.
- **LiveKit**: the eager init in `livekit-server.ts` MUST continue to throw at boot if `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are unset (deliberate — LiveKit is critical, not optional). This is unchanged from current behavior.
- **Vercel Postgres**: if `DATABASE_URL` is unset, the eager init in `src/infrastructure/db/index.ts` MUST throw with the existing `"DATABASE_URL environment variable is required"` message. Unchanged.

#### Scenario: Upstash unset means cache no-ops

- GIVEN `UPSTASH_REDIS_REST_URL` is unset
- WHEN `cacheGetOrSet(key, fetcher)` is called
- THEN it MUST return `fetcher()` directly (no cache hit check, no cache write)
- AND it MUST NOT throw

#### Scenario: Upstash unset means rate limiter no-ops

- GIVEN `UPSTASH_REDIS_REST_URL` is unset
- WHEN `rateLimit(...)` is called
- THEN it MUST return `{ allowed: true }` (no rate limit applied)
- AND it MUST NOT throw

#### Scenario: LiveKit unset still throws at boot

- GIVEN `LIVEKIT_API_KEY` is unset
- WHEN `pnpm dev` boots
- THEN the import of `livekit-server.ts` MUST throw with the existing error message naming both `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`

### REQ-MD-9: Local dev keeps docker-compose.yml for Postgres + Redis only

The `docker-compose.yml` at the project root MUST be retained (for local dev) but reduced to only `postgres` and `redis` services. The `minio`, `meilisearch`, and `livekit` services MUST be removed (LiveKit is now Cloud, MinIO is Vercel Blob, MeiliSearch is dropped). The env vars for the dropped services MUST also be removed from `.env.example` and `.env.local.example`.

#### Scenario: docker-compose.yml has only postgres + redis

- GIVEN `docker-compose.yml` after the migration
- WHEN the file is parsed
- THEN exactly 2 services MUST be defined: `postgres` and `redis`
- AND no `livekit`, `minio`, or `meilisearch` service MUST exist

#### Scenario: Local dev uses Upstash REST against a local Redis (or Upstash dev DB)

- GIVEN a developer running `pnpm dev` locally
- WHEN they hit a tRPC route that uses the cache or rate-limiter
- THEN the integration MUST work against either (a) `docker compose up -d redis` + a local fallback, OR (b) an Upstash dev DB pointed at by `UPSTASH_REDIS_REST_URL`

The default documented path in `docs/dev-setup.md` MUST be option (a) — keep local Redis in `docker-compose.yml` for dev simplicity, point `UPSTASH_REDIS_REST_URL` at the local Redis over the REST shim. The dev path MUST NOT require creating an Upstash account.

### REQ-MD-10: Docs reflect the Vercel-only deployment

`docs/livekit.md` and `docs/livekit-prod.md` MUST be rewritten (or replaced) to reflect the LiveKit Cloud contract. `README.md` MUST have a "Deployment" section updated to reference Vercel + managed services. `ARCHITECTURE.md` MUST reference ADR-0001. `docs/dev-setup.md` MUST drop the LiveKit `docker compose up` step and update the smoke test to no longer reference `localhost:7880`.

#### Scenario: docs/livekit.md references LiveKit Cloud, not self-host

- GIVEN `docs/livekit.md` after the migration
- WHEN the file is read
- THEN it MUST NOT mention `docker-compose.yml` `livekit` service
- AND it MUST mention LiveKit Cloud (`livekit.cloud`) as the target

#### Scenario: docs/dev-setup.md removes LiveKit from DB services

- GIVEN `docs/dev-setup.md` after the migration
- WHEN the "DB services" step is read
- THEN `docker compose up -d ...` MUST NOT include `livekit`
- AND the smoke test MUST NOT reference `localhost:7880` or the `--dev` defaults
