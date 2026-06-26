# Delta for dev-setup

## MODIFIED Requirements

### Requirement: REQ-DEV-SETUP-2: Runbook documents required Docker services, env vars, and verification commands

(Previously: 5 Docker services required — postgres, redis, minio, meilisearch, livekit. Now: 2 Docker services required — postgres, redis. MinIO and MeiliSearch are gone (Vercel Blob replaces MinIO, MeiliSearch is dropped). LiveKit is gone (LiveKit Cloud replaces self-hosted SFU).)

The runbook MUST list exactly 2 services in the "DB services" section: `postgres` and `redis`. The `minio`, `meilisearch`, and `livekit` services MUST NOT appear in the docker-compose command or the verification list.

The env-var list MUST be updated:
- DROP: `MINIO_*`, `MEILI_*`, `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`, `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook`
- ADD: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_LIVEKIT_URL=wss://<project>.livekit.cloud`, `LIVEKIT_WEBHOOK_URL=https://<vercel-domain>/api/livekit/webhook`

#### Scenario: Runbook lists only postgres + redis

- GIVEN the runbook's "DB services" section
- WHEN the section is read
- THEN exactly 2 services MUST be listed: `postgres` and `redis`
- AND `minio`, `meilisearch`, `livekit` MUST NOT appear

#### Scenario: Runbook lists Upstash + LiveKit Cloud env vars

- GIVEN the runbook's "Env" section
- WHEN the env var block is read
- THEN `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` MUST be present
- AND `NEXT_PUBLIC_LIVEKIT_URL` MUST be present with a `wss://` value
- AND no `MINIO_*` or `MEILI_*` env var MUST appear

### Requirement: REQ-DEV-SETUP-3: Runbook includes a 2-tab smoke test that verifies the MVP end-to-end

(Previously: Smoke test referenced `docker compose up -d livekit` and the call page connecting to `ws://localhost:7880`. Now: smoke test references LiveKit Cloud and `wss://<project>.livekit.cloud`.)

The smoke test instructions MUST be updated:
- Step "DB services" runs `docker compose up -d postgres redis` (NOT including `livekit`).
- The call page URL printed by `pnpm seed:dev` connects to the LiveKit Cloud URL via `wss://`.
- The "Pass criteria" sentence still requires both tabs to see each other AND the cita to auto-complete to `COMPLETADA` within 30 seconds (unchanged).

#### Scenario: Smoke test uses LiveKit Cloud URL, not localhost:7880

- GIVEN the runbook's "Smoke test" section
- WHEN the verification step is read
- THEN the expected connection URL MUST start with `wss://`
- AND `ws://localhost:7880` MUST NOT appear

## REMOVED Requirements

### Requirement: REQ-DEV-SETUP-2 (original) — MinIO + MeiliSearch + LiveKit verification commands

(Reason: The 3 removed services no longer exist in the dev stack. Their verification commands (`curl -fsS http://localhost:9000/minio/health/live`, `curl -fsS http://localhost:7700/health`, `curl -fsS http://localhost:7880`) are obsolete.)
(Migration: The MODIFIED requirement above consolidates the verification list to postgres + redis only.)

## ADDED Requirements

### Requirement: REQ-DEV-SETUP-6: Runbook cross-links ADR-0001

The runbook MUST cross-link ADR-0001 (`docs/architecture/decisions/0001-vercel-only.md`) in a short "Why this stack" note at the top of the runbook. The note MUST state that the dev stack mirrors the production stack (Vercel-only, LiveKit Cloud, Upstash REST) and link to the ADR for the rationale.

#### Scenario: Runbook has a "Why this stack" note

- GIVEN `docs/dev-setup.md`
- WHEN the file's opening is read
- THEN a section MUST cross-link ADR-0001
- AND the section MUST mention "Vercel-only" or equivalent framing
