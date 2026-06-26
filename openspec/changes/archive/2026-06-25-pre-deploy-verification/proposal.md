# Proposal: Pre-Deploy Verification

## Change name

`pre-deploy-verification` (folder: `pre-deploy-verification/`, no date prefix — this is the final change in the production-readiness sequence and is operator-driven, not architected).

## Intent

Close the verification gap between "the code builds" and "the deployed app works." The current CI verifies the build, lint, type-check, and unit tests pass — but does NOT verify that the E2E video call flow works (it is gated behind `LIVEKIT_E2E=1`, which CI never sets), and does NOT verify that the deployed app responds correctly on Vercel (no post-deploy smoke). This change adds two layers of verification:

1. **E2E test on every CI run** — the `videocall-2-users.spec.ts` test is updated to work against LiveKit Cloud (ADR-0001's runtime), and CI's e2e job sets `LIVEKIT_E2E=1` so the test runs (not skipped). The test fails the CI run if the video call flow is broken.
2. **Post-deploy smoke test** — a new GitHub Actions workflow `.github/workflows/post-deploy-smoke.yml` that triggers after `deploy.yml` succeeds and curls the deployed app's key routes. If the smoke fails, the operator gets a Slack-equivalent GitHub notification (Actions annotation + workflow status).

The change is config-only + a workflow addition. No application code changes. No new dependencies. No new env vars in the dev workflow (the E2E env vars are CI secrets only).

The user-visible outcome: an operator who pushes to `main` and watches the GitHub Actions runs sees four signals in order: (1) CI passes (lint + typecheck + unit + e2e + audit), (2) deploy.yml pre-deploy-migrate runs migrations, (3) deploy.yml deploy-vercel builds + deploys, (4) post-deploy-smoke curls `/api/health` and asserts `{"status":"ok"}`. If any link in the chain breaks, the operator knows before users do.

## Why

Two concrete gaps surfaced during the exploration of changes #1-3:

**Gap 1: E2E test silently skipped in CI.** `tests/e2e/videocall-2-users.spec.ts:31-34` reads:
```ts
test.skip(
  !process.env.LIVEKIT_E2E || process.env.LIVEKIT_E2E !== "1",
  SKIP_REASON,
);
```
The CI workflow (`ci.yml:53-56`) sets `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`, `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880` — but does NOT set `LIVEKIT_E2E=1`. Result: every CI run reports the videocall test as `skipped`, which Playwright reports as a successful test. The deploy pipeline has never once in its history verified the video call flow actually works end-to-end.

This was acceptable when LiveKit was self-hosted (`ws://localhost:7880` was a real, working target). After ADR-0001 + `migrate-managed-services`, that URL is gone — LiveKit is now `wss://<project>.livekit.cloud`. The E2E test as written can't pass even if `LIVEKIT_E2E=1` is set: it expects `ws://localhost:7880`, which the eager `livekitServerClient` constructor would reject.

**Gap 2: No post-deploy verification.** The deploy workflow runs `vercel deploy --prebuilt --prod`, prints the deployment URL, and exits. There is no check that the deployed app actually responds. A deploy that builds successfully but fails at runtime (e.g., wrong Vercel env var scope, missing `AUTH_TRUST_HOST`, broken DB pool annotation) would only be caught when a user reports it.

The fix is a `post-deploy-smoke` workflow that triggers on `workflow_run` after `deploy.yml` succeeds and hits three routes: `/`, `/login`, `/api/health`. The `/api/health` route already exists (`src/app/api/health/route.ts`) and checks DB connectivity — a passing health check is strong evidence that env vars, DB pool annotation, and basic routing all work.

## Scope

### In scope

- **`tests/e2e/videocall-2-users.spec.ts`** — MODIFIED. Update the test to use LiveKit Cloud env vars (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL=wss://...`) instead of the deleted `ws://localhost:7880` dev defaults. Update the `BASE` URL to read `APP_URL` (already does this; no change) and assert that `NEXT_PUBLIC_LIVEKIT_URL` starts with `wss://` (fail fast if a stale `ws://localhost:7880` value leaks in). Keep the `LIVEKIT_E2E=1` gate.
- **`.github/workflows/ci.yml`** — MODIFIED. Add `LIVEKIT_E2E: "1"` to the e2e job's env block. Add a new `LIVEKIT_TEST_*` prefix env block at the workflow level for the LiveKit Cloud test project secrets. Document the secrets in the workflow header comment.
- **`.github/workflows/post-deploy-smoke.yml`** — NEW. A workflow that:
  - Triggers on `workflow_run` of `Deploy` workflow (only on `success`).
  - Has a `smoke` job that runs `curl` against the deployment URL with a 60-second retry loop (Vercel Functions can take 5-15s to cold-start).
  - Asserts HTTP 200 on `/` and `/login`, and `{"status":"ok"}` on `/api/health`.
  - Posts the deployment URL as a GitHub Actions summary (`$GITHUB_STEP_SUMMARY`).
  - Uploads the curl outputs as artifacts for debugging.
- **`docs/deployment.md`** — MODIFIED. Add a "Post-deploy verification" section documenting the smoke workflow, the routes it checks, and how to interpret failures.
- **`openspec/changes/pre-deploy-verification/specs/pre-deploy-verification/spec.md`** — NEW. 4 requirements, ~12 scenarios.
- **`openspec/changes/pre-deploy-verification/design.md`** — The workflow + test update design.
- **`openspec/changes/pre-deploy-verification/tasks.md`** — Implementation tasks.

### Out of scope

- **Provisioning a LiveKit Cloud test project.** Operator must create a free LiveKit Cloud project, copy its credentials to GitHub repo secrets (`LIVEKIT_TEST_API_KEY`, `LIVEKIT_TEST_API_SECRET`, `LIVEKIT_TEST_URL`). The workflow reads these and passes them as the `LIVEKIT_*` env vars for the e2e job. Out of scope for this change (operator-driven).
- **Slack notifications on smoke failure.** GitHub Actions annotations + workflow status are the notification surface. Adding Slack/Discord webhooks is a follow-up.
- **Synthetic monitoring in production** (running smoke every N minutes from a separate cron). Out of scope — the post-deploy smoke fires once per deploy, not continuously. Continuous monitoring is a follow-up (Sentry alerts, Vercel Analytics, etc.).
- **Database migration verification post-deploy.** The pre-deploy-migrate job (from `deployment-foundation`) runs migrations. Verifying the migration succeeded is implicit in `/api/health` returning `{"database": "connected"}`. No additional check needed.
- **Load testing.** Out of scope — smoke is a liveness check, not a load test.
- **Visual regression testing.** Out of scope — Playwright's screenshot diffs require a separate baseline workflow.
- **Replacing the E2E test infrastructure.** Playwright + the existing spec file stay. The change is to the test logic + CI config, not the harness.

## Decisions (D1..D5)

| ID | Decision | Rationale |
|---|---|---|
| **D1** | Keep the `LIVEKIT_E2E=1` gate. Set it to `"1"` in the CI e2e job's env block. Do NOT remove the gate. | The gate exists to skip the test in local-only CI runs (e.g., a contributor running `pnpm test:e2e` without provisioning LiveKit Cloud). Removing the gate would break local test runs. The fix is to set the gate's trigger env var in CI; not to remove the gate. |
| **D2** | E2E test asserts `NEXT_PUBLIC_LIVEKIT_URL` starts with `wss://` (fail fast if stale `ws://localhost:7880` value leaks in). | Belt-and-suspenders against the footgun that motivated change #3. If a future contributor restores the self-host setup without removing this assertion, the test fails loudly. |
| **D3** | Use `workflow_run` trigger for post-deploy-smoke, not `workflow_call` or `needs:`. | `workflow_run` decouples the smoke workflow from the deploy workflow — they can evolve independently. `needs:` would force them to live in the same workflow file. `workflow_call` requires the deploy workflow to explicitly invoke the smoke, which is a coupling we'd rather avoid. |
| **D4** | Smoke curls `/`, `/login`, `/api/health` only. NOT `/citas/<id>/llamada` (the call page). | The call page requires a valid auth session + a CONFIRMADA cita + browser camera permission. Curl can't drive that. The `/api/health` route already verifies DB connectivity, which is the strongest signal we can get without a browser. |
| **D5** | Smoke uses a 60-second retry loop with 10-second backoff (6 attempts). | Vercel Functions can take 5-15s to cold-start after deploy, plus DNS propagation can take 10-30s. A single curl right after deploy often fails with 502. Retrying handles this without forcing the operator to wait. |

## Capabilities

This change creates one new capability:

- **`pre-deploy-verification`** — NEW. Covers the E2E test running on every CI run (not skipped), and the post-deploy smoke workflow that verifies the deployed app responds correctly.

No existing capabilities are MODIFIED. The `e2e-video-call` capability already covers the videocall test scenarios; this change adds the CI plumbing that runs them.

## Consequences

### Positive

- **CI fails on broken video flow.** Today, a regression in the video call flow (e.g., a wrong `wss://` URL in the env vars) would pass CI and break in production. After this change, CI catches it.
- **Post-deploy catches misconfiguration fast.** A misconfigured Vercel env var (wrong scope, wrong value) breaks the deploy at the smoke step, not when a user reports "video doesn't work."
- **Documented operator expectations.** The deploy runbook now states explicitly that the smoke workflow is the success signal — operators know to wait for it to turn green.

### Negative

- **CI runtime increases by ~30s** (the E2E test takes ~15-20s; the smoke adds another 5-15s of curl retries).
- **Operator must provision a LiveKit Cloud test project** for CI. The test project is a free-tier LiveKit Cloud project; the only cost is the operator's time to create it.
- **Smoke workflow is a third-party dependency on Vercel availability.** If Vercel has an outage, smoke fails — but so does the app. The smoke failure is noise in that case.

### Neutral

- No new dependencies in `package.json`.
- No changes to application code.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| E2E test flakes in CI due to LiveKit Cloud intermittent issues | Medium | The smoke is the post-deploy check; CI E2E is for code correctness. Flake is acceptable if isolated; documented as "re-run CI" in the runbook. |
| Operator forgets to provision LiveKit Cloud test project | Medium | Without it, CI e2e job fails with "LiveKit env vars missing" — loud, documented failure mode. The deploy runbook explains how to provision. |
| Post-deploy smoke fires before Vercel has propagated the new deployment URL | Low | 60-second retry loop with 10s backoff handles DNS + cold start. |
| Smoke curl on `/api/health` returns 503 because DB is unreachable | Low | This is exactly the failure mode the smoke is designed to catch. 503 is a fail signal, not a bug. |

## Rollback plan

This change produces 2 modified files (the test + the CI workflow), 1 new file (post-deploy-smoke.yml), and 1 modified doc (deployment.md). All reversible by `git revert <sha>`. No data loss, no runtime impact beyond the CI/smoke workflows no longer running.
