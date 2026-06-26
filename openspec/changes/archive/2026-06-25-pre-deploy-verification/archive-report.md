# Archive Report: Pre-Deploy Verification

## Change

`pre-deploy-verification` — flip the `LIVEKIT_E2E` gate in CI so the E2E videocall test runs (was silently skipped), and add a `post-deploy-smoke` workflow that curls the deployed app's key routes after a successful Vercel deploy.

## Archived to

`openspec/changes/archive/2026-06-25-pre-deploy-verification/`

## Source of Truth Updated

- `openspec/specs/pre-deploy-verification/spec.md` — NEW capability (4 requirements: REQ-PDV-1 through REQ-PDV-4; 12 scenarios).

No existing capabilities were modified. The `e2e-video-call` capability already covers the videocall test scenarios; this change adds the CI plumbing that runs them.

## Implementation Files Shipped

**Created** (1 file):
- `.github/workflows/post-deploy-smoke.yml` — 134 lines, `workflow_run` trigger on `Deploy`, 3 curl steps with 6×10s retry loop, artifact upload on failure, summary on success

**Modified** (3 files):
- `tests/e2e/videocall-2-users.spec.ts` — added wss:// assertion at top of `beforeAll` (lines 41-55), updated SKIP_REASON comment
- `.github/workflows/ci.yml` — added `LIVEKIT_E2E: "1"` and `secrets.LIVEKIT_TEST_*` references in e2e job env (lines 65-68); added header comment documenting required secrets
- `docs/deployment.md` — rewrote "Verify Deploy" section with smoke table, manual spot-checks, and required CI secrets subsection

## Diff Statistics

- 1 file created (~134 lines)
- 3 files modified (~50 lines added total)
- Total: ~185 lines (well under 800-line review budget)

## Verify Result

**PASS**.

| Check | Result |
|-------|--------|
| `pnpm lint` | exit 0 |
| `pnpm type-check` | exit 0 |
| `tests/e2e/videocall-2-users.spec.ts` wss:// assertion | PASS |
| `ci.yml` LIVEKIT_E2E gate flipped | PASS |
| `post-deploy-smoke.yml` workflow structure | PASS (134 lines, 3 curl steps, 6×10s retry, step summary, artifact upload) |
| `docs/deployment.md` smoke docs | PASS |

## SDD Cycle Complete

✅ proposal → specs → design → tasks → apply → verify → archive

## Production-Readiness Sequence Complete

This is the **fourth and final change** in the production-readiness sequence:

| # | Change | Status |
|---|--------|--------|
| 1 | `deployment-foundation` | ✅ Archived 2026-06-25 |
| 2 | `backend-architecture-decision` (ADR-0001) | ✅ Archived 2026-06-25 |
| 3 | `migrate-managed-services` | ✅ Archived 2026-06-25 |
| 4 | `pre-deploy-verification` | ✅ Archived 2026-06-25 |

The four changes together implement ADR-0001 (Vercel-Only Deployment) end-to-end:
- #1 makes the deploy pipeline actually work (pnpm, db:migrate, vercel.json, build-time env vars).
- #2 ratifies the architectural decision as a discoverable ADR.
- #3 migrates the runtime from self-hosted Docker to managed services.
- #4 adds the verification gates (CI E2E + post-deploy smoke) that prove it all works.

## Operator Next Steps

1. Set GitHub Actions secrets (`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`, `PRODUCTION_DATABASE_URL`).
2. Set Vercel project env vars per `docs/deployment.md` (`DATABASE_URL` with `?pgbouncer=true&connection_limit=1`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL=wss://<project>.livekit.cloud`, `APP_URL`, `MINIO_PUBLIC_HOSTNAME`).
3. Provision a LiveKit Cloud free dev project + free test project (for CI).
4. Provision an Upstash free dev DB (for local cache + rate-limit verification).
5. Push to `main` and watch: CI → pre-deploy-migrate → deploy-vercel → post-deploy-smoke.
6. After green smoke, the platform is in production.

## Open Follow-Up Changes (none blocking)

- Custom production domain (`.vercel.app` is fine for MVP).
- Sentry configuration (package kept, no DSN — deferred).
- OAuth providers for NextAuth (Credentials only for MVP).
- Continuous production monitoring (synthetic smoke every N minutes — out of scope for this sequence).
- Database backup policy on Vercel Postgres (out of scope for this sequence).
