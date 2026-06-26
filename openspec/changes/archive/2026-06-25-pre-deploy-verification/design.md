# Design: Pre-Deploy Verification

## Technical Approach

Two changes: (1) flip the `LIVEKIT_E2E` gate to `"1"` in CI and update the E2E test to work against LiveKit Cloud, (2) add a `post-deploy-smoke` workflow that runs after `Deploy` and curls three routes with retry. No application code changes. No new dependencies.

## Architecture Decisions

### Decision: workflow_run trigger for post-deploy smoke, not workflow_call

**Choice**: `post-deploy-smoke.yml` uses `on: workflow_run: workflows: [Deploy], types: [completed]`.
**Alternatives**: (a) `needs: deploy-vercel` in the same workflow file (couples them); (b) `workflow_call` (requires Deploy to explicitly invoke smoke); (c) cron-based polling (laggy).
**Rationale**: `workflow_run` is the GitHub-native way to react to another workflow's completion. Decouples the two workflows so they can evolve independently. The `if: github.event.workflow_run.conclusion == 'success'` gate ensures smoke only runs after a successful deploy.

### Decision: 60s retry loop with 10s backoff in smoke

**Choice**: 6 curl attempts with 10s sleep between them.
**Alternatives**: (a) Single curl (fails on Vercel cold start); (b) 5min retry with 30s backoff (too slow for the operator's attention span); (c) Use `vercel wait` CLI (extra dependency).
**Rationale**: Vercel Functions cold-start can be 5-15s; DNS propagation can be 10-30s. 60s covers both. 10s backoff is short enough that the workflow finishes within the operator's patience.

### Decision: Smoke checks /, /login, /api/health only (not the call page)

**Choice**: Three routes only.
**Alternatives**: (a) Add /citas/<id>/llamada (requires auth + browser); (b) Add /api/trpc/auth.getSession (requires session cookie); (c) Add /api/health only (minimal but loses the "app renders" signal).
**Rationale**: /api/health checks DB + basic env vars. / and /login check that the Next.js app renders and the auth page loads. The call page requires camera permission + WebRTC, which curl can't drive.

### Decision: Keep LIVEKIT_E2E=1 gate, don't remove it

**Choice**: The gate stays. CI sets LIVEKIT_E2E=1; local dev runs without it (and the test is skipped, which is the documented behavior).
**Alternatives**: (a) Remove the gate (breaks local dev that doesn't have LiveKit Cloud).
**Rationale**: The gate is correct for local dev. The fix is to set it in CI; not to remove it.

## Data Flow

```
git push origin main
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ GitHub Actions: ci.yml                                       │
│  ┌────────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │ lint-type  │→│ unit   │→│ e2e    │→│ audit  │   done    │
│  └────────────┘ └────────┘ └────────┘ └────────┘            │
│                                  │ LIVEKIT_E2E=1            │
│                                  │ + LiveKit Cloud secrets  │
│                                  ▼                          │
│                          videocall-2-users                  │
│                          .spec.ts runs                      │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ GitHub Actions: deploy.yml                                   │
│  pre-deploy-migrate → deploy-vercel (vercel deploy --prebuilt --prod)  │
└──────────────────────────────────────────────────────────────┘
       │
       │ workflow_run trigger (conclusion == success)
       ▼
┌──────────────────────────────────────────────────────────────┐
│ GitHub Actions: post-deploy-smoke.yml                        │
│  smoke job:                                                  │
│    - Extract deployment URL from Deploy run output           │
│    - Retry loop (6 × 10s):                                   │
│        curl <url>/           → expect 200                    │
│        curl <url>/login      → expect 200                    │
│        curl <url>/api/health → expect 200 + status:ok        │
│    - Upload curl outputs as artifacts                        │
│    - Write deployment URL to $GITHUB_STEP_SUMMARY            │
└──────────────────────────────────────────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `tests/e2e/videocall-2-users.spec.ts` | Modify | Assert `NEXT_PUBLIC_LIVEKIT_URL` starts with `wss://` in `beforeAll`. Update SKIP_REASON comment to reference LiveKit Cloud. |
| `.github/workflows/ci.yml` | Modify | Add `LIVEKIT_E2E: "1"` + `LIVEKIT_API_KEY: ${{ secrets.LIVEKIT_TEST_API_KEY }}` etc. to e2e job env. Document secrets in header. |
| `.github/workflows/post-deploy-smoke.yml` | Create | New workflow. `workflow_run` trigger on Deploy. Smoke job with retry loop. |
| `docs/deployment.md` | Modify | Add "Post-deploy verification" section. |
| `openspec/specs/pre-deploy-verification/spec.md` | Create | New capability spec. |

No source code changes. No `package.json` changes. No env var additions to dev workflow (LiveKit Cloud secrets are CI-only).

## Interfaces / Contracts

### New GitHub Actions secrets (operator-set, documented in workflow header)

| Secret | Used by | Purpose |
|--------|---------|---------|
| `LIVEKIT_TEST_API_KEY` | CI e2e job | LiveKit Cloud test project's API key |
| `LIVEKIT_TEST_API_SECRET` | CI e2e job | LiveKit Cloud test project's API secret |
| `LIVEKIT_TEST_URL` | CI e2e job | LiveKit Cloud test project's WSS URL |

These are operator-set in GitHub repo settings. No defaults; without them, CI e2e fails with "LiveKit env vars missing" (loud, documented).

### New artifact outputs

- `smoke-output-root.txt` — curl output for `GET /`
- `smoke-output-login.txt` — curl output for `GET /login`
- `smoke-output-health.txt` — curl output for `GET /api/health`

## Testing Strategy

| Layer | Check | Approach |
|-------|-------|----------|
| Source | E2E test updated to assert `wss://` URL prefix | Run `pnpm test:e2e -- LIVEKIT_E2E=1` with a real LiveKit Cloud test project (manual) |
| Source | E2E test's wss:// assertion rejects `ws://localhost:7880` | Manual: temporarily set `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`, confirm test fails |
| Workflow | post-deploy-smoke.yml syntax | `actionlint` or GitHub's built-in workflow syntax check |
| Integration | Smoke catches a broken deploy | Manual: push a commit that breaks `/api/health` (e.g., wrong DATABASE_URL), confirm smoke fails |
| Integration | Smoke passes a healthy deploy | Manual: push a normal commit, confirm smoke passes within 60s |

Strict TDD is OFF per `openspec/config.yaml`. The change is configuration-heavy; the value is in the workflow YAML + the assertion, not in unit tests.

## Migration / Rollout

No migration. The change takes effect on merge:
- CI's e2e job starts running the videocall test (was skipped).
- The post-deploy-smoke workflow becomes active on the next push to main.

If the operator hasn't provisioned a LiveKit Cloud test project yet, the e2e job will fail with "LiveKit env vars missing." Documented in `docs/deployment.md` as a required setup step.

Rollback: `git revert <merge-sha>` reverts the 4 files in one commit. No data loss, no runtime impact.

## Open Questions

- **None blocking.** The decision to default smoke to retry 6×10s is a guess at Vercel's cold-start behavior; if it's too short in practice, the operator bumps it in a follow-up.
