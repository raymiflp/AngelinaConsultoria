# Tasks: Migrate to Managed Services (Vercel-Only)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~745 across 43 files (per proposal PR plan) |
| 400-line budget risk | **High** for single PR; **Low** per chained PR |
| Chained PRs recommended | **Yes** |
| Suggested split | 6 stacked-to-main PRs (per proposal) |
| Delivery strategy | auto-chain (already chosen by proposal's `auto-forecast`) |
| Chain strategy | **stacked-to-main** |

Decision needed before apply: **No** (delivery strategy resolved by proposal: auto-chain, stacked-to-main)
Chained PRs recommended: **Yes**
Chain strategy: stacked-to-main
400-line budget risk: Low (per-PR); High (single mega-PR)

### Suggested Work Units

| Unit | Goal | Likely PR | Stack base | Estimated lines |
|------|------|-----------|------------|-----------------|
| 1 | Postgres pool annotation lands; deploy-ready | PR1 | `main` | ~40 |
| 2 | Redis usage goes through Upstash REST | PR2 | `main` | ~180 |
| 3 | LiveKit Cloud replaces self-hosted SFU; VPS infra deleted | PR3 | `main` | ~260 (mostly deletions) |
| 4 | Object storage uses Vercel Blob | PR4 | `main` | ~25 |
| 5 | Auth + deploy hardening (R1/R2/R3 mitigations) | PR5 | `main` | ~90 |
| 6 | Cleanup: drop dead packages + docs rewrite | PR6 | `main` (after PR5) | ~150 |

Each PR is independently revertible. The order matters because PR3 deletes LiveKit-related files that PR2's tests don't touch, and PR6 deletes docs that PR5 references.

## Phase 1: PR1 — Postgres Pool Annotation

- [ ] 1.1 Edit `src/infrastructure/db/index.ts` to add a comment block explaining the `?pgbouncer=true&connection_limit=1` annotation that Vercel Postgres expects
- [ ] 1.2 Edit `.env.example` to update the `DATABASE_URL` placeholder with `?pgbouncer=true&connection_limit=1`
- [ ] 1.3 Edit `.env.local.example` to update the dev `DATABASE_URL` placeholder with the same annotation
- [ ] 1.4 Edit `.env.production.example` to drop VPS-only references (livekit hostnames, cert paths) and add the pool annotation
- [ ] 1.5 Verify: `pnpm lint` and `pnpm type-check` exit 0; `git diff --stat` shows ~40 lines changed

## Phase 2: PR2 — Redis via Upstash REST

- [ ] 2.1 Edit `package.json`: remove `"ioredis"` from `dependencies`, add `"@upstash/redis"` (latest stable)
- [ ] 2.2 Rewrite `src/infrastructure/redis/index.ts` to export a `@upstash/redis` `Redis` instance, created lazily, returning `null` when env vars are unset
- [ ] 2.3 Rewrite `src/infrastructure/redis/cache.ts` to use Upstash REST methods (`get`, `set` with `{ ex, nx }`, `del`); replace `cacheInvalidate` pattern-delete with explicit-key-list via an index key
- [ ] 2.4 Rewrite `src/infrastructure/redis/rate-limiter.ts` to use sequential Upstash REST calls (no `multi()`); add comment documenting the sub-millisecond race window
- [ ] 2.5 Update `src/infrastructure/redis/__tests__/cache.webhookDedupe.test.ts` mock from `ioredis` shape to `@upstash/redis` shape
- [ ] 2.6 Update any other tests that mock the Redis singleton (`src/app/api/livekit/__tests__/route.test.ts`, `src/infrastructure/api/routers/__tests__/bookings.createAppointment.test.ts`)
- [ ] 2.7 Edit `.env.example` to drop `REDIS_URL`, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` placeholders
- [ ] 2.8 Edit `.env.local.example` to add `UPSTASH_REDIS_REST_URL` pointing at the local Upstash REST shim OR an Upstash dev DB
- [ ] 2.9 Verify: `pnpm test:run` exits 0 (all cache + rate-limiter + webhook tests pass with updated mocks); `pnpm lint` and `pnpm type-check` exit 0

## Phase 3: PR3 — LiveKit Cloud + Delete VPS Infra

- [ ] 3.1 Delete `docker/dev/livekit.yaml`
- [ ] 3.2 Delete `docker/prod/livekit.yaml`, `docker/prod/Caddyfile`, `docker/prod/docker-compose.override.yml`
- [ ] 3.3 Edit `docker-compose.yml` to remove the `livekit`, `minio`, `meilisearch` services; keep only `postgres` and `redis`
- [ ] 3.4 Rewrite `docs/livekit.md` to document the LiveKit Cloud env-var contract (free dev project, Cloud URLs, no local container)
- [ ] 3.5 Delete `docs/livekit-prod.md` (Caddy + cert automation no longer applicable)
- [ ] 3.6 Edit `.env.example` to drop `LIVEKIT_API_KEY=changeme`, `LIVEKIT_API_SECRET=changeme-in-prod`, `LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook`; add placeholders for `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL=wss://<project>.livekit.cloud`, `LIVEKIT_WEBHOOK_URL=https://<vercel-domain>/api/livekit/webhook`
- [ ] 3.7 Edit `.env.local.example` similarly with a comment pointing the developer to their LiveKit Cloud dev project
- [ ] 3.8 Edit `src/infrastructure/livekit/livekit-server.ts` to update the boot-time error message to mention LiveKit Cloud (cosmetic)
- [ ] 3.9 Verify: `pnpm lint` and `pnpm type-check` exit 0; grep for `ws://localhost:7880` returns no results; grep for `docker/dev/livekit.yaml` returns no results

## Phase 4: PR4 — Vercel Blob for Object Storage

- [ ] 4.1 Edit `package.json` to add `"@vercel/blob"` to `dependencies`
- [ ] 4.2 Edit `next.config.ts` `images.remotePatterns` to default the hostname to `*.public.blob.vercel-storage.com` (replace the `minio.local` fallback)
- [ ] 4.3 Edit `.env.example` to document `MINIO_PUBLIC_HOSTNAME` as the Vercel Blob public hostname
- [ ] 4.4 Verify: `pnpm lint`, `pnpm type-check`, and `pnpm build` exit 0

## Phase 5: PR5 — Auth + Deploy Hardening

- [ ] 5.1 Edit `src/auth.ts` to add `trustHost: true` to the NextAuth config
- [ ] 5.2 Edit `.env.example` to add `AUTH_TRUST_HOST=true` placeholder
- [ ] 5.3 Edit `docs/deployment.md` to add `AUTH_URL=https://$VERCEL_URL` to the Vercel secrets table and document the Vercel `VERCEL_URL` auto-injection
- [ ] 5.4 Edit `docs/deployment.md` "Vercel Build-Time Env Vars" section to confirm `NEXT_PUBLIC_LIVEKIT_URL` MUST be `wss://` for LiveKit Cloud
- [ ] 5.5 Verify: `pnpm lint` and `pnpm type-check` exit 0

## Phase 6: PR6 — Cleanup

- [ ] 6.1 Edit `package.json` to remove `"socket.io"`, `"socket.io-client"`, `"meilisearch"` from `dependencies`
- [ ] 6.2 Edit `next.config.ts` to remove `"socket.io"` from `serverExternalPackages` (keep `"livekit-server-sdk"`)
- [ ] 6.3 Rewrite `docs/dev-setup.md` to drop the `livekit`/`minio`/`meilisearch` references from the "DB services" step; update the smoke test to reference `wss://` instead of `ws://localhost:7880`; add a "Why this stack" note cross-linking ADR-0001
- [ ] 6.4 Edit `README.md` deployment section to reference Vercel + managed services and link to ADR-0001
- [ ] 6.5 Edit `ARCHITECTURE.md` to reference ADR-0001
- [ ] 6.6 Verify: `grep -r "socket.io\|meilisearch" package.json src/ next.config.ts` returns no matches; `grep -r "MINIO_\|MEILI_" .env.example .env.local.example` returns no matches; `pnpm lint`, `pnpm type-check`, `pnpm test:run`, and `pnpm build` all exit 0

## Phase 7: Verify (whole change)

- [ ] 7.1 Verify success criteria from proposal.md line 140–157:
  - `pnpm type-check` exit 0
  - `pnpm lint` exit 0
  - `pnpm test:run` exit 0 (Vitest unit suite)
  - `pnpm build` exit 0
  - `package.json` does NOT contain `socket.io`, `socket.io-client`, `meilisearch`
  - `docker-compose.yml` does NOT contain `meilisearch`, `minio`, or `livekit` services
  - `docker/prod/` directory deleted (or only contains `.gitkeep`)
  - All 6 capabilities synced to main specs (`livekit-infrastructure`, `dev-setup`, `auth-core`, `api-infrastructure`, plus new `managed-deployment`, plus `architecture-decisions` from previous change)
- [ ] 7.2 Manual: Vercel preview URL returns HTTP 200 on `/`
- [ ] 7.3 Manual: Vercel preview URL `/api/trpc/auth.getSession` returns `{ user: { id, email, role } }` after Credentials login (BLOCKED on operator secrets — manual)
- [ ] 7.4 Manual: Vercel preview URL `/citas/{id}/llamada` returns 200 with LiveKit Cloud eager init succeeding (BLOCKED on LiveKit Cloud project — manual)
