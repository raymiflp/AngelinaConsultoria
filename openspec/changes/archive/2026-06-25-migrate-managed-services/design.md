# Design: Migrate to Managed Services (Vercel-Only)

## Technical Approach

This change implements ADR-0001 (Vercel-Only Deployment) by migrating the platform's runtime services from self-hosted Docker (Postgres + Redis + LiveKit + MinIO + MeiliSearch) to managed equivalents (Vercel Postgres + Upstash REST + LiveKit Cloud + Vercel Blob). The implementation follows the 6-PR chained delivery plan from `proposal.md` (PR1: Postgres, PR2: Redis REST, PR3: LiveKit Cloud, PR4: Blob, PR5: Auth + deploy hardening, PR6: Cleanup). Total estimated ~745 lines across 43 files; largest single PR is PR3 at ~260 lines (mostly deletions).

The migration is **mostly env-var swaps + config-file edits**, not code rewrites. The only meaningful code rewrites are PR2 (Redis REST: rewrite `cache.ts` + `rate-limiter.ts` against `@upstash/redis`) and the package drops in PR6.

## Architecture Decisions

### Decision: 6 chained PRs, all stacked to main

**Choice**: Implement as 6 chained PRs targeting `main`. Each PR is a self-contained service migration.
**Alternatives considered**: (a) single mega-PR (745 lines exceeds the 800-line budget by ~5% margin; also forces a 6-service review in one shot); (b) feature-branch chain (overkill for this change — every PR is independently mergeable, not stacked behind a tracker); (c) atomic cuts by file type (env vs source vs docker — doesn't match service boundaries).
**Rationale**: 6 PRs × service boundary = each reviewer can understand and approve one service migration in isolation. Reverting one PR does not break the others. Each PR's verification is independent. Stacked to main (NOT feature-branch chain) because the changes are sequential and each PR enables the next.

### Decision: PR2 Redis REST rewrites cache.ts + rate-limiter.ts (not drop-in ioredis → Upstash TCP)

**Choice**: Rewrite the two Redis-using modules against `@upstash/redis` REST API.
**Alternatives considered**: (a) swap `ioredis` for `@upstash/redis` TCP client (no code rewrite, ~300ms cold-start cost on Vercel); (b) swap `ioredis` for `redis` (Node Redis v4, also TCP, also ~300ms cold-start); (c) keep self-hosted Redis (rejected by ADR-0001).
**Rationale**: REST API is zero-connection (no cold-start cost). The two modules are small (~150 lines combined) and the rewrite is mechanical (sequential calls in place of `multi()`; explicit key list in place of `keys()`). The tradeoff is one-time code churn for long-term cold-start savings.

### Decision: DELETE self-hosted Docker files (not "comment them out")

**Choice**: Delete `docker/dev/livekit.yaml`, `docker/prod/livekit.yaml`, `docker/prod/Caddyfile`, `docker/prod/docker-compose.override.yml`. Remove `livekit`, `minio`, `meilisearch` services from `docker-compose.yml`.
**Alternatives considered**: (a) comment them out (proposal's "rollback safety" note suggested this); (b) move them to `docker/archive/` for reference.
**Rationale**: ADR-0001 made the decision explicit. Commented-out files create the impression of a viable self-host path and invite future contributors to re-enable them (which would violate the ADR). Git history preserves them. Deletion is honest about the decision.

### Decision: Postgres connection pool annotation, not driver swap

**Choice**: Keep `postgres-js` driver; add `?pgbouncer=true&connection_limit=1` to `DATABASE_URL`.
**Alternatives considered**: (a) swap to `@vercel/postgres` (would force a driver rewrite across all queries); (b) reduce `postgres-js` `max: 10` to `max: 1` (works but is more brittle under burst traffic).
**Rationale**: The `?pgbouncer=true&connection_limit=1` annotation is the Vercel-recommended approach for the existing driver. No application code changes. The `max: 10` in the driver becomes irrelevant because the pooler caps per-Lambda connections at 1.

### Decision: Sentry package kept (no config)

**Choice**: Keep `@sentry/nextjs` in `package.json` but do NOT configure DSN, sourcemaps, or `instrumentation.ts`.
**Rationale**: The package was added in a previous change with the intent to configure later. Removing it would force a re-add in a follow-up. Keeping it incurs no runtime cost (the SDK is inert without config). Documented as deferred in the proposal.

### Decision: LiveKit Cloud free tier assumed for dev project

**Choice**: Document that developers provision a free LiveKit Cloud project (no credit card) for local dev. The `NEXT_PUBLIC_LIVEKIT_URL` and `LIVEKIT_WEBHOOK_URL` point at the project's Cloud URLs.
**Alternatives considered**: (a) keep the self-hosted `--dev` container for local dev only (rejected — ADR-0001 says no self-host, even in dev); (b) LiveKit Cloud dev project requires a credit card on file (verified: no, free tier is credit-card-free).
**Rationale**: Single deployment model (dev mirrors prod) reduces cognitive load. LiveKit Cloud's free tier supports up to 100 concurrent participants and 10k minutes/month — more than enough for dev iteration.

## Data Flow

### Before (self-hosted hybrid)

```
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│   │                                                           │
│   ├─→ Vercel (Next.js, serverless)                            │
│   │     ├─→ PostgreSQL (Docker, self-hosted)                  │
│   │     ├─→ Redis (Docker, ioredis TCP)                       │
│   │     └─→ LiveKit (Docker, self-hosted SFU)                 │
│   │           └─→ WebRTC media (UDP 7882)                     │
│   └─→ MinIO (Docker, object storage)                          │
│   └─→ MeiliSearch (Docker, search) — UNUSED                   │
│   └─→ Socket.io (planned) — UNUSED                           │
└──────────────────────────────────────────────────────────────┘
```

### After (Vercel-only managed)

```
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│   │                                                           │
│   ├─→ Vercel (Next.js, serverless)                            │
│   │     ├─→ Vercel Postgres (pgbouncer pooler)                │
│   │     ├─→ Upstash REST (cache, rate-limit, webhookDedupe)   │
│   │     └─→ LiveKit Cloud (wss:// managed SFU)                │
│   │           └─→ WebRTC media (managed)                      │
│   └─→ Vercel Blob (object storage, when needed)               │
└──────────────────────────────────────────────────────────────┘

Local dev mirrors: docker-compose.yml runs postgres + redis only.
LiveKit Cloud has a free dev project. Upstash has a free dev DB.
```

## File Changes

| File | Action | PR |
|------|--------|----|
| `src/infrastructure/db/index.ts` | Modify (pool annotation comment) | PR1 |
| `.env.example` | Modify (DATABASE_URL note, drop MINIO/MEILI) | PR1, PR3, PR5 |
| `.env.local.example` | Modify (DATABASE_URL pool note, drop MINIO/MEILI) | PR1, PR3, PR5 |
| `.env.production.example` | Modify (drop VPS-only references) | PR1, PR3, PR5 |
| `src/infrastructure/redis/index.ts` | Modify (Upstash REST singleton) | PR2 |
| `src/infrastructure/redis/cache.ts` | Rewrite (Upstash REST, explicit key list) | PR2 |
| `src/infrastructure/redis/rate-limiter.ts` | Rewrite (Upstash REST, sequential calls) | PR2 |
| `package.json` | Modify (drop ioredis, add @upstash/redis) | PR2, PR6 |
| `docker-compose.yml` | Modify (drop livekit/minio/meilisearch) | PR3, PR6 |
| `docker/dev/livekit.yaml` | **DELETE** | PR3 |
| `docker/prod/livekit.yaml` | **DELETE** | PR3 |
| `docker/prod/Caddyfile` | **DELETE** | PR3 |
| `docker/prod/docker-compose.override.yml` | **DELETE** | PR3 |
| `docs/livekit.md` | Rewrite (LiveKit Cloud contract) | PR3 |
| `docs/livekit-prod.md` | **DELETE** (replaced by docs/livekit.md) | PR3 |
| `next.config.ts` | Modify (hostname → Vercel Blob, drop socket.io from serverExternalPackages) | PR4, PR6 |
| `package.json` | Modify (add @vercel/blob) | PR4 |
| `src/auth.ts` | Modify (trustHost) | PR5 |
| `docs/deployment.md` | Modify (R1/R2/R3 mitigations) | PR5 |
| `docs/dev-setup.md` | Rewrite (drop livekit/minio/meilisearch from DB services) | PR6 |
| `README.md` | Modify (deployment section) | PR6 |
| `ARCHITECTURE.md` | Modify (reference ADR-0001) | PR6 |
| `package.json` | Modify (drop socket.io, socket.io-client, meilisearch) | PR6 |
| `next.config.ts` | Modify (drop socket.io from serverExternalPackages) | PR6 |

## Interfaces / Contracts

### `src/infrastructure/redis/index.ts` (new shape after PR2)

```ts
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

export function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // graceful-degrade
  return new Redis({ url, token });
}

export { redis };
export default redis;
```

### `src/infrastructure/redis/cache.ts` (new shape)

- `cacheGetOrSet<T>(key, fetcher, ttl)` — uses `redis.get(key)`, `redis.set(key, value, { ex: ttl })`, falls through to `fetcher()` if `redis` is null.
- `cacheInvalidate(namespace)` — uses an explicit key list stored under `__index__:<namespace>`. Reads the index, deletes each key, then deletes the index.
- `webhookDedupe(eventId, ttl)` — `redis.set(eventId, "1", { nx: true, ex: 86400 })`.

### `src/infrastructure/redis/rate-limiter.ts` (new shape)

- Sequential Upstash calls: `redis.incr(key)` → `redis.expire(key, windowSec)` → compare to limit. (No `MULTI`.) Documented race window in a comment.

### `next.config.ts` (new shape)

```ts
images: {
  remotePatterns: [
    {
      protocol: "https",
      hostname: process.env.MINIO_PUBLIC_HOSTNAME ?? "*.public.blob.vercel-storage.com",
      port: "",
      pathname: "/**",
    },
  ],
},
serverExternalPackages: ["livekit-server-sdk"], // socket.io removed
```

### `src/auth.ts` (new shape)

```ts
export const { auth, handlers, signIn, signOut } = NextAuth({
  // ... existing config ...
  trustHost: true, // NEW: required on Vercel
});
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Existing tests for `cache.ts`, `rate-limiter.ts`, `auth.ts` — must pass with mocked Upstash client | Update mocks from `ioredis` mock to `@upstash/redis` mock. Run `pnpm test:run` after PR2. |
| Unit | Existing tests for `webhookDedupe` — must pass with mocked Upstash REST client | Same as above. The test in `__tests__/cache.webhookDedupe.test.ts` already uses `vi.mock("@/infrastructure/redis", ...)` — update the mock shape. |
| E2E | Smoke test in `docs/dev-setup.md` must close the loop end-to-end with LiveKit Cloud dev project | Manual: 2 browser tabs, both see each other, cita auto-completes to `COMPLETADA`. |
| Build | `pnpm build` exits 0 on a clean checkout | Run after each PR. |
| Lint | `pnpm lint` exits 0 | Run after each PR. |
| Type-check | `pnpm type-check` exits 0 | Run after each PR. |
| Grep | Forbidden patterns not in repo after each PR | `! grep -r "ioredis\|socket.io\|meilisearch" src/` (post-PR6), `! grep -r "ws://localhost:7880" .` (post-PR3), etc. |

Strict TDD is OFF per `openspec/config.yaml`. The migration is mechanical (mostly env-var + config-file edits) — the value of the existing tests is that they catch regressions when the Redis client is swapped, not that they drive the design.

## Migration / Rollout

This change IS the migration. Rollout per PR:

1. **PR1 (Postgres pool)**: lands. Operator updates Vercel `DATABASE_URL` to include `?pgbouncer=true&connection_limit=1`. No app behavior change.
2. **PR2 (Redis REST)**: lands. Operator creates Upstash account, sets `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel. Local dev: still uses `docker compose up -d redis` with an Upstash REST shim OR points `UPSTASH_REDIS_REST_URL` at a local REST proxy (out of scope — Upstash dev DB is the simpler path).
3. **PR3 (LiveKit Cloud)**: lands. Operator creates LiveKit Cloud free project, sets `LIVEKIT_*` env vars to Cloud values. The call page now connects to `wss://<project>.livekit.cloud`.
4. **PR4 (Vercel Blob)**: lands. Operator sets `MINIO_PUBLIC_HOSTNAME` to the Vercel Blob public hostname (forward-looking; no current code uses storage).
5. **PR5 (Auth hardening)**: lands. Operator sets `AUTH_TRUST_HOST=true` and `AUTH_URL=https://$VERCEL_URL` in Vercel.
6. **PR6 (Cleanup)**: lands. Self-hosted services are no longer referenced. Operator can `docker compose down` the now-unused `livekit`/`minio`/`meilisearch` containers if they had them running.

Rollback: each PR is independently revertible. Worst-case full rollback is `git revert` of all 6 PRs in reverse order, then restoring the original env var values.

## Open Questions

- **Upstash local dev story**: the proposal's PR2 leaves this ambiguous. Default path will be: developers create a free Upstash dev DB (no credit card) and point `UPSTASH_REDIS_REST_URL` at it. Alternative: a local Redis REST shim (e.g., a tiny `redis-server` + `webdis` Docker container). The default path is simpler; the shim is more self-contained. Defaulting to Upstash dev DB for now.
- **`MAX` connection in `postgres-js`**: the existing driver uses `max: 10`. The pgbouncer annotation caps per-Lambda at 1, but the driver's internal pool is still 10. Should we lower to `max: 1`? Out of scope for this change — leave at 10; revisit if pooler exhaustion occurs.
