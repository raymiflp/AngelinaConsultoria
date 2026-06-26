# Tasks: Pre-Deploy Verification

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150 (1 new workflow ~80, 1 spec ~40, test ~10, ci.yml ~10, docs ~10) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | E2E gate flipped in CI + smoke workflow + docs | PR 1 | Single PR, ~150 lines, config-only |

## Phase 1: Update E2E Test

- [ ] 1.1 Edit `tests/e2e/videocall-2-users.spec.ts` `beforeAll` to assert `process.env.NEXT_PUBLIC_LIVEKIT_URL` starts with `wss://`; throw with clear message if not
- [ ] 1.2 Update the SKIP_REASON comment to reference LiveKit Cloud instead of "self-hosted LiveKit container"

## Phase 2: Update CI Workflow

- [ ] 2.1 Edit `.github/workflows/ci.yml` e2e job to add `LIVEKIT_E2E: "1"` to its `env` block
- [ ] 2.2 Replace the hardcoded `LIVEKIT_API_KEY=devkey` / `LIVEKIT_API_SECRET=secret` / `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880` with `${{ secrets.LIVEKIT_TEST_* }}` references
- [ ] 2.3 Add a header comment documenting the required `LIVEKIT_TEST_*` GitHub Actions secrets

## Phase 3: Create Post-Deploy Smoke Workflow

- [ ] 3.1 Create `.github/workflows/post-deploy-smoke.yml` with `on: workflow_run: workflows: [Deploy], types: [completed]`
- [ ] 3.2 Add `if: github.event.workflow_run.conclusion == 'success'` gate on the smoke job
- [ ] 3.3 Add a step to extract the Vercel deployment URL from the Deploy workflow's run output (using `gh api repos/${{ github.repository }}/actions/runs/${{ github.event.workflow_run.id }}` and parsing)
- [ ] 3.4 Add the three curl checks with a 60s retry loop (6 attempts × 10s backoff) — one step per route
- [ ] 3.5 Add an `actions/upload-artifact@v4` step for each curl output
- [ ] 3.6 Add a final step that writes the deployment URL + pass/fail status to `$GITHUB_STEP_SUMMARY`

## Phase 4: Update Deployment Doc

- [ ] 4.1 Edit `docs/deployment.md` "Verify Deploy" section to mention the `post-deploy-smoke` workflow
- [ ] 4.2 Add a list of the three routes the smoke checks
- [ ] 4.3 Add a "Required secrets" subsection listing `LIVEKIT_TEST_*` for the CI e2e job

## Phase 5: Verify

- [ ] 5.1 Run `pnpm lint` and `pnpm type-check`; assert both exit 0
- [ ] 5.2 grep `tests/e2e/videocall-2-users.spec.ts` for `wss://` assertion; assert 1 match
- [ ] 5.3 grep `.github/workflows/ci.yml` for `LIVEKIT_E2E`; assert it equals `"1"`
- [ ] 5.4 grep `.github/workflows/post-deploy-smoke.yml` for `workflows: [Deploy]`; assert 1 match
- [ ] 5.5 Manual: push a commit, confirm CI runs the e2e test (BLOCKED on operator LiveKit Cloud test project)
- [ ] 5.6 Manual: confirm post-deploy-smoke triggers after a successful Deploy (BLOCKED on real deploy)
