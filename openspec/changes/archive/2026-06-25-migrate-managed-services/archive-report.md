# Archive Report: Migrate to Managed Services (Vercel-Only)

## Change

`migrate-managed-services` — implemented ADR-0001 (Vercel-Only Deployment). Migrated Postgres → Vercel Postgres (pool annotation), Redis (ioredis TCP) → Upstash REST, LiveKit (self-hosted Docker) → LiveKit Cloud, MinIO → Vercel Blob. Dropped dead-weight packages (`socket.io`, `socket.io-client`, `meilisearch`). Added `AUTH_TRUST_HOST=true` for Vercel edge proxy. Rewrote `docs/dev-setup.md`, `docs/livekit.md`, `README.md`, `ARCHITECTURE.md` to reflect the new architecture.

## Archived to

`openspec/changes/archive/2026-06-25-migrate-managed-services/`

## Source of Truth Updated

- **`openspec/specs/managed-deployment/spec.md`** — NEW capability (10 requirements, ~30 scenarios).
- **`openspec/specs/livekit-infrastructure/spec.md`** — MODIFIED: Purpose rewritten to reflect LiveKit Cloud; `REQ-LI-CLOUD-1` added. Self-hosted Docker/TLS requirements remain as historical record (documented in the new Purpose section).
- **`openspec/specs/dev-setup/spec.md`** — MODIFIED: `REQ-DEV-SETUP-6` added (ADR-0001 cross-link); `REQ-DEV-SETUP-2` (post-migration) added (only postgres + redis).
- **`openspec/specs/auth-core/spec.md`** — `REQ-AUTH-V-1` and `REQ-AUTH-V-2` added.
- **`openspec/specs/api-infrastructure/spec.md`** — `REQ-API-UPSTASH-1`, `REQ-API-UPSTASH-2`, `REQ-API-UPSTASH-3` added.

## Implementation Files Shipped

**Created**: none
**Modified** (18 files):
- `package.json` — dropped ioredis, socket.io, socket.io-client, meilisearch; added @upstash/redis, @vercel/blob
- `pnpm-lock.yaml` — auto-updated by `pnpm install --no-frozen-lockfile`
- `next.config.ts` — `serverExternalPackages` drops socket.io; `images.remotePatterns` defaults to `*.public.blob.vercel-storage.com`
- `src/infrastructure/db/index.ts` — comment added explaining pgbouncer annotation
- `src/infrastructure/redis/index.ts` — rewritten against `@upstash/redis` REST
- `src/infrastructure/redis/cache.ts` — rewritten against `@upstash/redis` REST; explicit-key-list invalidation
- `src/infrastructure/redis/rate-limiter.ts` — rewritten against `@upstash/redis` REST; sequential calls (no MULTI)
- `src/infrastructure/redis/__tests__/cache.webhookDedupe.test.ts` — mock shape updated to Upstash REST API
- `src/auth.ts` — added `trustHost: true`
- `.env.example` — rewritten with new env-var matrix (no REDIS_URL, no MINIO_*, no MEILI_*)
- `docker-compose.yml` — reduced to postgres + redis services only
- `docs/dev-setup.md` — rewritten (2 services, wss://, LiveKit Cloud dev project)
- `docs/livekit.md` — rewritten (LiveKit Cloud contract)
- `README.md` — stack table updated, ADR-0001 cross-link added
- `ARCHITECTURE.md` — ADR-0001 cross-link added
- `docs/deployment.md` — minor references updated (covered by previous `deployment-foundation` change)

**Deleted** (5 files):
- `docker/dev/livekit.yaml`
- `docker/prod/livekit.yaml`
- `docker/prod/Caddyfile`
- `docker/prod/docker-compose.override.yml`
- `docs/livekit-prod.md`

## Diff Statistics

- 18 files modified, 5 files deleted, 1 new spec capability
- Total ~600 lines changed (well under the 800-line budget for the proposed chained-PR plan; this session applied them all in one go for efficiency)
- pnpm-lock.yaml: -19 packages, +8 packages (net -11 dependencies)

## Verify Result

**PASS**.

| Check | Result |
|-------|--------|
| `pnpm install --no-frozen-lockfile` | exit 0 |
| `pnpm type-check` | exit 0 |
| `pnpm lint` | exit 0 (pre-existing warnings only) |
| `pnpm test:run` | exit 0 — **548/548 tests pass** in 77s |
| `pnpm build` | exit 0 — all 30+ routes compile |
| `package.json` forbidden patterns | 0 matches for socket.io, socket.io-client, meilisearch |
| `docker-compose.yml` service check | 0 livekit/minio/meilisearch SERVICES (only comment refs) |
| `docker/prod/` directory | empty |
| `docker/dev/livekit.yaml` | deleted |
| `next.config.ts` serverExternalPackages | `["livekit-server-sdk"]` only (no socket.io) |
| `docs/livekit.md` ws://localhost:7880 | 0 matches |

## Spec Compliance

All scenarios in `managed-deployment/spec.md` (10 requirements, ~30 scenarios) are COMPLIANT. The 4 delta specs (livekit-infrastructure, dev-setup, auth-core, api-infrastructure) have their ADDED requirements met by the implementation; their REMOVED requirements are matched by the corresponding file deletions; their MODIFIED requirements are matched by the corresponding doc/file rewrites.

## SDD Cycle Complete

✅ proposal (pre-existing) → specs (5 files) → design → tasks (6 chained PRs) → apply (18 files modified, 5 deleted) → verify → archive

## Architectural Compliance

This change implements ADR-0001 (Vercel-Only Deployment). The deploy runbook in `docs/deployment.md` references the env-var contract that this change established. No VPS, no self-hosted Docker in production. The local dev stack mirrors the production stack where possible (Postgres in both, Redis in both, LiveKit Cloud in both).

## Open Follow-Up Changes

1. **`pre-deploy-verification`** — enable `LIVEKIT_E2E=1` in CI by default, add post-deploy smoke test. The E2E test currently requires a LiveKit Cloud dev project; provisioning that is a follow-up.
2. **`postgres-js max: 10` tuning** — the driver's internal pool remains at 10 even though the pooler caps per-Lambda at 1. Defense-in-depth works but could be tightened if pooler exhaustion occurs.
3. **Local dev Upstash story** — current default is "create a free Upstash dev DB." Alternative: a local Redis REST shim (webdis + redis-server in Docker). Documented as a follow-up in `design.md`.
