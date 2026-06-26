# Capability: pre-deploy-verification

## Purpose

Define the verification contract that runs at the boundary between "code merged to main" and "users hitting the deployed app." Two workflows participate: (1) CI runs the full test suite including the E2E video-call flow, and (2) post-deploy smoke curls the deployed app's key routes and asserts they respond correctly. The contract catches regressions that build-time checks cannot (broken env vars, wrong Vercel scope, DB pool exhaustion).

## Requirements

### REQ-PDV-1: CI runs the E2E video-call test on every push to main

The `e2e-tests` job in `.github/workflows/ci.yml` MUST set `LIVEKIT_E2E: "1"` so the `videocall-2-users.spec.ts` test runs (not skipped). The job MUST provide LiveKit Cloud env vars (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`) sourced from GitHub Actions secrets with a `LIVEKIT_TEST_` prefix (so they're clearly identified as CI-only).

#### Scenario: CI sets LIVEKIT_E2E=1

- GIVEN `.github/workflows/ci.yml`
- WHEN the `e2e-tests` job is inspected
- THEN `LIVEKIT_E2E: "1"` MUST appear in the job's `env` block
- AND the job MUST NOT run the test as `skipped`

#### Scenario: CI provides LiveKit Cloud env vars

- GIVEN the `e2e-tests` job's environment
- WHEN the job runs
- THEN `LIVEKIT_API_KEY` MUST equal `${{ secrets.LIVEKIT_TEST_API_KEY }}`
- AND `LIVEKIT_API_SECRET` MUST equal `${{ secrets.LIVEKIT_TEST_API_SECRET }}`
- AND `NEXT_PUBLIC_LIVEKIT_URL` MUST equal `${{ secrets.LIVEKIT_TEST_URL }}`
- AND `NEXT_PUBLIC_LIVEKIT_URL` MUST start with `wss://`

#### Scenario: CI e2e job fails when LiveKit secrets are missing

- GIVEN the `LIVEKIT_TEST_*` secrets are NOT set in the GitHub repo
- WHEN the `e2e-tests` job runs
- THEN the test MUST fail with a clear "LiveKit env vars missing" error
- AND the failure MUST be visible in the CI run summary

### REQ-PDV-2: E2E test fails fast on stale LiveKit URL

The `videocall-2-users.spec.ts` test MUST assert that `process.env.NEXT_PUBLIC_LIVEKIT_URL` starts with `wss://` at the top of the test (in `beforeAll`, not deep inside a test). If the value starts with `ws://` or is empty, the test MUST fail immediately with a clear error message naming the offending value.

This is a regression guard against the footgun that change #3 (`migrate-managed-services`) closed: setting `ws://localhost:7880` would crash the eager `livekitServerClient` init at boot, but the failure would be silent in CI without this assertion.

#### Scenario: ws:// value fails fast

- GIVEN `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880` is set
- WHEN the E2E test's `beforeAll` runs
- THEN the test MUST fail with an error message that includes the offending value and the word `wss://`

#### Scenario: wss:// value passes the assertion

- GIVEN `NEXT_PUBLIC_LIVEKIT_URL=wss://test.livekit.cloud` is set
- WHEN the E2E test's `beforeAll` runs
- THEN the test MUST proceed past the URL assertion

### REQ-PDV-3: Post-deploy smoke workflow runs after deploy.yml succeeds

A new GitHub Actions workflow at `.github/workflows/post-deploy-smoke.yml` MUST trigger on `workflow_run` of the `Deploy` workflow with `types: [completed]` and `workflows: [Deploy]`. The workflow's `smoke` job MUST only run if the `Deploy` workflow concluded with `success`.

The workflow MUST extract the Vercel deployment URL from the `Deploy` workflow's run output (via `gh api` or `gh run view --json output`) and use it as the `BASE` URL for the smoke checks. If the URL extraction fails, the workflow MUST fail with a clear error message.

#### Scenario: Smoke triggers after Deploy succeeds

- GIVEN a push to `main` that successfully deploys via `Deploy`
- WHEN the `Deploy` workflow concludes
- THEN the `post-deploy-smoke` workflow MUST trigger automatically

#### Scenario: Smoke does NOT trigger if Deploy fails

- GIVEN a push to `main` where the `Deploy` workflow fails (e.g., pre-deploy-migrate error)
- WHEN the `Deploy` workflow concludes
- THEN the `post-deploy-smoke` workflow MUST NOT run its `smoke` job

#### Scenario: Smoke fails if it cannot extract the deployment URL

- GIVEN the `Deploy` workflow succeeded but the deployment URL is not in the run output
- WHEN the smoke workflow runs
- THEN it MUST fail with an error message naming `vercel deploy --prebuilt` output and the `gh run view` command to debug

### REQ-PDV-4: Smoke checks /, /login, /api/health with retry

The smoke workflow MUST run three curl checks against the deployment URL, each with a 60-second retry loop (10-second backoff, 6 attempts):

1. `GET /` → expect HTTP 200
2. `GET /login` → expect HTTP 200
3. `GET /api/health` → expect HTTP 200 AND JSON body `{"status": "ok"}`

Each check MUST upload its curl output to a workflow artifact (`smoke-output-<step>.txt`) for debugging. The workflow summary (`$GITHUB_STEP_SUMMARY`) MUST show the deployment URL and the pass/fail status of each check.

#### Scenario: All three checks pass

- GIVEN a successful Vercel deployment with the correct env vars
- WHEN the smoke workflow runs
- THEN all three curl checks MUST return the expected status code (200)
- AND the workflow summary MUST show "✅ All smoke checks passed"
- AND the deployment URL MUST be in the summary

#### Scenario: /api/health returns 503 (DB disconnected)

- GIVEN the deployed app cannot reach the Vercel Postgres pooler (e.g., wrong DATABASE_URL)
- WHEN the smoke workflow runs
- THEN the `/api/health` check MUST fail with HTTP 503
- AND the workflow MUST exit with a non-zero status
- AND the curl output MUST be in the artifact for debugging

#### Scenario: Vercel cold start exceeds 30 seconds

- GIVEN the Vercel Function cold-starts in 45 seconds after the deploy
- WHEN the smoke workflow's first curl attempt fails (e.g., with 502)
- THEN the retry loop MUST continue with 10-second backoff
- AND the workflow MUST NOT fail until 6 attempts (60s) have elapsed

#### Scenario: docs/deployment.md documents the smoke workflow

- GIVEN `docs/deployment.md`
- WHEN the "Verify Deploy" section is read
- THEN it MUST mention the `post-deploy-smoke` workflow
- AND it MUST list the three routes checked
- AND it MUST state that a green smoke is the success signal for the deploy
