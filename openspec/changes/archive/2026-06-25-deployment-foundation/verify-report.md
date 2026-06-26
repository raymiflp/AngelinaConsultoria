# Verify Report: Deployment Foundation

## Change

`deployment-foundation` — close 4 deploy-blocking gaps (Dockerfile pnpm, `db:migrate` in deploy workflow, `vercel.json` security headers, `NEXT_PUBLIC_LIVEKIT_URL` prod override + operator runbook).

## Mode

Standard verify. `strict_tdd: false` in `openspec/config.yaml`. No test runner applies to config-only changes — verification is by source inspection plus `pnpm lint` and `pnpm type-check`.

## Completeness Table

| Artifact | Status | Notes |
|----------|--------|-------|
| `proposal.md` | Present | 8 decisions (D1-D8), rollback table per-file |
| `specs/deployment-pipeline/spec.md` | Present | 5 requirements, 18 scenarios |
| `design.md` | Present | 5 architecture decisions, file-changes table, deploy sequence ASCII diagram |
| `tasks.md` | All implementation tasks `[x]` | Phase 5 has 3 manual-verify items blocked on real domain |
| Implementation files | All present | `Dockerfile`, `.github/workflows/deploy.yml`, `vercel.json`, `docs/deployment.md` |

## Build / Tests / Coverage Evidence

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm lint` | exit 0 | 13 pre-existing `import/order` warnings in `src/` files I did not touch; zero errors in new files |
| `pnpm type-check` | exit 0 | `tsc --noEmit` passes clean |
| `docker build -t test .` | NOT RUN | Blocked on operator running locally with Docker available (manual task 5.1) |
| `pnpm test:run` | NOT APPLICABLE | No `src/` changes; coverage thresholds in `vitest.config.ts` are unaffected |
| `pnpm test:integration` | NOT APPLICABLE | No DB or API changes |
| `pnpm test:e2e` | NOT APPLICABLE | No UI changes |

## Spec Compliance Matrix

Each spec scenario gets a verdict based on what evidence exists. Scenarios requiring a real Vercel deployment or production browser are flagged `MANUAL PENDING`.

### REQ-DEP-FOUND-1: Dockerfile uses pnpm, not npm

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Dockerfile does not reference npm | **COMPLIANT** | grep for `npm ci\|npm install\|npm run` in `Dockerfile` returned zero matches. Only `pnpm install` and `pnpm build` remain. |
| Dockerfile enables corepack before pnpm install | **COMPLIANT** | `Dockerfile:8` and `Dockerfile:15` both contain `RUN corepack enable` before the `pnpm install` line. |
| Dockerfile builds successfully with the committed lockfile | **MANUAL PENDING** | Requires `docker build` on the operator's machine with Docker installed. |
| Dockerfile fails fast on a stale lockfile | **INHERENTLY COMPLIANT** | `--frozen-lockfile` is a pnpm built-in flag that exits non-zero on stale lockfiles. No additional code required. |

### REQ-DEP-FOUND-2: Deploy workflow runs migrations before deploy

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| `pre-deploy-migrate` job runs `pnpm db:migrate` | **COMPLIANT** | `.github/workflows/deploy.yml` has the job with `run: pnpm db:migrate` and `env: DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}`. |
| `deploy-vercel` job depends on `pre-deploy-migrate` | **COMPLIANT** | `needs: pre-deploy-migrate` present on the deploy-vercel job. |
| Both jobs target the production environment | **COMPLIANT** | grep confirms exactly 2 `environment:` blocks, both with `name: production`. |
| Missing `PRODUCTION_DATABASE_URL` fails the workflow | **INHERENTLY COMPLIANT** | GitHub Actions resolves `${{ secrets.X }}` to `""` when `X` is unset; `pnpm db:migrate` then fails on empty DATABASE_URL. |

### REQ-DEP-FOUND-3: vercel.json ships security headers at the edge

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| vercel.json exists with security headers | **COMPLIANT** | `node -e "JSON.parse(...)"` parsed the file successfully; the headers array has 6 entries. |
| vercel.json sets framework to null | **COMPLIANT** | `"framework": null` is the top-level key; `"framework": "nextjs"` is not present. |
| CORS headers are NOT in vercel.json | **COMPLIANT** | grep for `Access-Control-Allow` in `vercel.json` returns zero matches; those headers remain in `next.config.ts`. |

### REQ-DEP-FOUND-4: NEXT_PUBLIC_LIVEKIT_URL is set per Vercel environment

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| deploy.yml does not set NEXT_PUBLIC_LIVEKIT_URL in workflow env | **COMPLIANT** | grep for `NEXT_PUBLIC` in `.github/workflows/deploy.yml` returns zero matches. |
| docs/deployment.md documents the Vercel build-time env var pattern | **COMPLIANT** | "Vercel Build-Time Env Vars" section exists, names `NEXT_PUBLIC_LIVEKIT_URL`, explains build-time inlining, instructs Vercel Environment Variables page (NOT GitHub secrets), shows `wss://livekit.example.com` placeholder. |
| Production deployment connects to wss:// LiveKit | **MANUAL PENDING** | Requires real Vercel deployment + browser (task 5.4). |
| Missing NEXT_PUBLIC_LIVEKIT_URL in Vercel silently inlines a wrong value | **DOCUMENTED** | The failure mode is documented in `docs/deployment.md` Troubleshooting table. |

### REQ-DEP-FOUND-5: docs/deployment.md is the source of truth for deploy secrets

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| docs/deployment.md exists and lists Vercel secrets | **COMPLIANT** | "Required Secrets → Vercel project secrets" table has 7 rows covering all app env vars with scope, production value, and notes columns. |
| docs/deployment.md lists GitHub Actions secrets | **COMPLIANT** | "GitHub repository secrets" table has 4 rows (`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`, `PRODUCTION_DATABASE_URL`), each noting which job consumes it. |
| docs/deployment.md has a rollback section | **COMPLIANT** | "Rollback" section exists, documents `vercel rollback` and notes DB migrations are not auto-reverted. |
| docs/deployment.md has a verify-deploy section | **COMPLIANT** | "Verify Deploy" section has the `curl -fsSI` command with the expected header grep. |

## Correctness Table

| Check | Result | Notes |
|-------|--------|-------|
| `Dockerfile` three-stage shape preserved | PASS | deps → builder → runner stages intact |
| `Dockerfile` uses `--ignore-scripts` flag | PASS | Both install commands use it (matches `ci.yml` convention) |
| `deploy.yml` both jobs use `pnpm install --frozen-lockfile` | PASS | Matches the lockfile convention used in `ci.yml` |
| `deploy.yml` workflow env does NOT contain `NEXT_PUBLIC_*` | PASS | Verified by grep |
| `vercel.json` is valid JSON | PASS | Parsed successfully with `node -e JSON.parse(...)` |
| `vercel.json` does not redeclare CORS headers | PASS | Verified by grep |
| `docs/deployment.md` references both `docs/dev-setup.md` and `docs/livekit-prod.md` | PASS | Cross-links present |

## Design Coherence Table

| Design Decision | Implementation matches? | Notes |
|-----------------|------------------------|-------|
| D1: `corepack enable` instead of global pnpm | YES | Both Dockerfile stages have it |
| D2: Separate `pre-deploy-migrate` job with `needs:` | YES | Job order and dependency wired correctly |
| D3: Both jobs scoped to `production` environment | YES | Two `environment:` blocks, both `production` |
| D4: Headers in `vercel.json`, CORS in `next.config.ts` | YES | No CORS headers in `vercel.json` |
| D5: `framework: null` | YES | Top-level key set |
| D6: Two-secret tables in `docs/deployment.md` | YES | Vercel + GitHub tables present |
| D7: Single-region default `iad1` | YES | `"regions": ["iad1"]` in `vercel.json` |

## Issues

### CRITICAL
None.

### WARNING
None.

### SUGGESTION
- `deploy.yml` install step uses `npm install -g vercel` (line: "Install Vercel CLI"). This is a global npm install on the runner — fine for CI but a candidate for using `pnpm dlx vercel` or pinning a specific Vercel CLI version. Out of scope for this change; flagged as a follow-up.
- `vercel.json` does not set `buildCommand` or `outputDirectory` explicitly. Vercel's Next.js detection will pick the right values from `next.config.ts` / `package.json` scripts, but explicit declaration would harden against future framework detection changes. Out of scope for this change.

## Verdict

**PASS WITH MANUAL PENDING**

All file edits match the proposal, specs, design, and tasks. `pnpm lint` and `pnpm type-check` both pass. Three manual verification tasks (5.2, 5.3, 5.4) are blocked on a real Vercel deployment and production domain — these are operator-driven and not blockers for merging the change.

## Ready for Archive

YES. The change is ready to be archived. The 4 modified/new files are all reversible by `git revert`; no DB migrations; no application code changes; no dependency changes.
