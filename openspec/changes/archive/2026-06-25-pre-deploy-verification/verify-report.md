# Verify Report: Pre-Deploy Verification

## Change

`pre-deploy-verification` — flip the `LIVEKIT_E2E` gate to run the E2E videocall test on every CI run (was silently skipped), and add a `post-deploy-smoke` workflow that curls the deployed app's key routes after a successful Vercel deploy.

## Mode

Standard verify. `strict_tdd: false` in `openspec/config.yaml`. The change is configuration + workflow YAML; no application code.

## Completeness Table

| Artifact | Status | Notes |
|----------|--------|-------|
| `proposal.md` | Present | 5 decisions (D1-D5), scope/risks documented |
| `specs/pre-deploy-verification/spec.md` | NEW | 4 requirements (REQ-PDV-1 through REQ-PDV-4), 12 scenarios |
| `design.md` | Present | Workflow diagram, file-changes table, retry rationale |
| `tasks.md` | All implementation tasks `[x]` | 13 tasks across 5 phases |
| Implementation files | All applied | 3 modified, 1 created |

## Build / Tests / Coverage Evidence

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm lint` | exit 0 | Pre-existing warnings only |
| `pnpm type-check` | exit 0 | `tsc --noEmit` clean |
| `pnpm test:run` | NOT RUN (unchanged from prior cycle) | No `src/` changes |
| `pnpm build` | NOT RUN (unchanged from prior cycle) | No `src/` changes |
| `tests/e2e/videocall-2-users.spec.ts` wss:// assertion | PASS | Lines 47-55 throw if `NEXT_PUBLIC_LIVEKIT_URL` doesn't start with `wss://` |
| `ci.yml` LIVEKIT_E2E gate | PASS | Line 65: `LIVEKIT_E2E: "1"` |
| `post-deploy-smoke.yml` workflow structure | PASS | workflow_run trigger, Deploy ref, 3 curl steps, 6×10s retry loop, step summary, upload-artifact |

## Spec Compliance Matrix

### REQ-PDV-1: CI runs the E2E video-call test on every push to main

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| CI sets LIVEKIT_E2E=1 | **COMPLIANT** | `ci.yml:65` has `LIVEKIT_E2E: "1"` in e2e-tests job env |
| CI provides LiveKit Cloud env vars | **COMPLIANT** | `ci.yml:66-68` references `secrets.LIVEKIT_TEST_*` |
| CI e2e job fails when LiveKit secrets are missing | **INHERENTLY COMPLIANT** | Eager `livekitServerClient` init throws on missing env vars (existing behavior from `livekit-infrastructure/spec.md`); the wss:// assertion (REQ-PDV-2) adds belt-and-suspenders |

### REQ-PDV-2: E2E test fails fast on stale LiveKit URL

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| ws:// value fails fast | **COMPLIANT** | `videocall-2-users.spec.ts:47-55` throws with offending value if URL doesn't start with `wss://` |
| wss:// value passes the assertion | **COMPLIANT** | `startsWith("wss://")` check passes; test proceeds |

### REQ-PDV-3: Post-deploy smoke workflow runs after deploy.yml succeeds

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Smoke triggers after Deploy succeeds | **COMPLIANT** | `post-deploy-smoke.yml:11-14` declares `on.workflow_run.workflows: ["Deploy"]` |
| Smoke does NOT trigger if Deploy fails | **COMPLIANT** | `post-deploy-smoke.yml:21` gates job on `github.event.workflow_run.conclusion == 'success'` |
| Smoke fails if it cannot extract the deployment URL | **COMPLIANT** | `post-deploy-smoke.yml:35-42` greps Deploy run output and exits 1 with descriptive error if URL not found |

### REQ-PDV-4: Smoke checks /, /login, /api/health with retry

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| All three checks pass | **COMPLIANT** | `post-deploy-smoke.yml:67-129` runs the three curls with retry; success step writes the green summary |
| /api/health returns 503 (DB disconnected) | **INHERENTLY COMPLIANT** | Health step parses both status code AND `{"status":"ok"}`; a 503 or absent `status:ok` triggers the retry loop then fails the job |
| Vercel cold start exceeds 30 seconds | **COMPLIANT** | Each curl step has `for i in 1 2 3 4 5 6` with 10s sleep = 60s total retry budget |
| docs/deployment.md documents the smoke workflow | **COMPLIANT** | "Verify Deploy" section rewritten with smoke table, manual spot-checks, and required CI secrets subsection |

## Correctness Table

| Check | Result | Notes |
|-------|--------|-------|
| Smoke workflow file is syntactically valid YAML | PASS | 134 lines, parses without error |
| Smoke workflow has all 3 curl steps | PASS | `Smoke: GET /`, `Smoke: GET /login`, `Smoke: GET /api/health` |
| Smoke retry loop is 6 × 10s | PASS | `for i in 1 2 3 4 5 6; do ... sleep 10` |
| Smoke uploads artifacts on failure | PASS | `actions/upload-artifact@v4` with `if: always()` |
| Smoke writes summary on success | PASS | `$GITHUB_STEP_SUMMARY` populated in final step with `if: success()` |
| CI LiveKit env vars come from secrets | PASS | `secrets.LIVEKIT_TEST_API_KEY` etc. (not hardcoded dev defaults) |
| E2E test's wss:// assertion runs at top of beforeAll | PASS | First statement in `test.beforeAll` (lines 41-55), before DATABASE_URL check |
| E2E test's SKIP_REASON updated for Cloud | PASS | Lines 6-9, 17-18 reference "LiveKit Cloud test project" |

## Design Coherence Table

| Design Decision | Implementation matches? | Notes |
|-----------------|------------------------|-------|
| D1: Keep LIVEKIT_E2E gate, set it to "1" in CI | YES | Gate kept; `ci.yml:65` sets `LIVEKIT_E2E: "1"` |
| D2: Assert wss:// URL prefix | YES | `videocall-2-users.spec.ts:47-55` |
| D3: workflow_run trigger for smoke | YES | `post-deploy-smoke.yml:11-14` |
| D4: Smoke checks /, /login, /api/health only | YES | Three curl steps, no call page |
| D5: 60s retry loop with 10s backoff | YES | `for i in 1 2 3 4 5 6; sleep 10` in each step |

## Issues

### CRITICAL
None.

### WARNING
None.

### SUGGESTION
- **Vercel deployment URL extraction**: the current `gh api ... --jq` approach parses the Deploy workflow's step outputs. If Vercel CLI's output format changes, the regex `https://[a-z0-9-]+\.vercel\.app` may need updating. Documented as a follow-up if it breaks.
- **PostHog events from smoke**: the smoke workflow runs `curl` only (no browser), so PostHog client events are not triggered. Coverage is sufficient for "does the app respond" but not "do all flows work end-to-end." The CI e2e test (which now runs by default) covers the auth + video flow.

## Verdict

**PASS**.

All file edits match the proposal, specs, design, and tasks. `pnpm lint` and `pnpm type-check` both pass. The smoke workflow file is syntactically valid and has all required steps. The E2E test's wss:// assertion provides regression protection against the footgun that change #3 closed.

## Ready for Archive

YES. Manual verification (CI running the videocall test, smoke triggering after a real deploy) is BLOCKED on operator provisioning a LiveKit Cloud test project and pushing to `main`. Both are operator-driven and documented in `docs/deployment.md`.
