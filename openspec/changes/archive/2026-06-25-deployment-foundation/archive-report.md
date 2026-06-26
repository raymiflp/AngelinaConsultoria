# Archive Report: Deployment Foundation

## Change

`deployment-foundation` — closed 4 deploy-blocking gaps: Dockerfile pnpm compatibility, `db:migrate` step in deploy workflow, `vercel.json` edge security headers, and `NEXT_PUBLIC_LIVEKIT_URL` production override with operator runbook.

## Archived to

`openspec/changes/archive/2026-06-25-deployment-foundation/`

## Source of Truth Updated

The following specs now reflect the new behavior:

- `openspec/specs/deployment-pipeline/spec.md` — **NEW**. 5 requirements (REQ-DEP-FOUND-1 through REQ-DEP-FOUND-5), 18 Given/When/Then scenarios covering Dockerfile pnpm contract, deploy workflow + migration step, vercel.json edge config, NEXT_PUBLIC_LIVEKIT_URL prod requirement, and operator runbook structure.

No existing specs were modified. The `livekit-infrastructure` spec already documented the `NEXT_PUBLIC_LIVEKIT_URL` build-time gotcha (line 432); this change added the deploy-side enforcement without touching the livekit spec.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `deployment-pipeline` | Created | 5 requirements, 18 scenarios, 0 modified, 0 removed |

## Archive Contents

- `proposal.md` ✅ — 8 decisions, rollback per-file, 4 in-scope + 12 out-of-scope items
- `specs/deployment-pipeline/spec.md` ✅ — delta spec (now also at main specs)
- `design.md` ✅ — 5 architecture decisions, deploy sequence ASCII diagram, file-changes table
- `tasks.md` ✅ — 22 tasks total: 21 implementation `[x]`, 1 manual-verify (`docker build`) `[x]`, 3 manual-verify blocked on real domain (marked with reason)
- `verify-report.md` ✅ — Verdict: PASS WITH MANUAL PENDING; 0 CRITICAL, 0 WARNING, 2 SUGGESTION

## Implementation Files Shipped

- `Dockerfile` — modified (3 stage build now uses corepack + pnpm)
- `.github/workflows/deploy.yml` — modified (added `pre-deploy-migrate` job, `needs:` dependency, both jobs scoped to `production` environment)
- `vercel.json` — created (6 security headers at edge, `framework: null`, `regions: ["iad1"]`)
- `docs/deployment.md` — created (operator runbook with 2 secret tables, build-time env var warning, rollback, verify, troubleshooting)

## Diff Statistics

- 2 files modified (Dockerfile, deploy.yml): ~35 insertions, 5 deletions
- 2 files created (vercel.json, docs/deployment.md): ~165 insertions
- Total: ~200 lines changed (well under 800-line review budget)

## Open Follow-Up Changes

The deployment foundation unblocks 3 follow-up changes that depend on this one or run in parallel:

1. **`backend-architecture-decision`** — ADR on Vercel-only vs Vercel+backend split (for Socket.io/Redis workers).
2. **`migrate-managed-services`** — already in flight at `openspec/changes/migrate-managed-services/` (exploration + proposal exist).
3. **`pre-deploy-verification`** — enable `LIVEKIT_E2E=1` in CI by default, add post-deploy smoke test.

## SDD Cycle Complete

✅ proposal → specs → design → tasks → apply → verify → archive

The change is ready for review and merge. The operator must set the secrets documented in `docs/deployment.md` before the first push to `main` triggers a successful deploy.

## Related Memory

- Engram observation `obs-d2dca55f3c1a7e5d`: "SDD cycle started: deployment-foundation" (architecture, marked with conflict reviewed against the unrelated `migrate-managed-services` candidates — judged `not_conflict`).
