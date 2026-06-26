# Design: Deployment Foundation

## Technical Approach

This change is config-only. Four artifacts change: `Dockerfile` swaps `npm` for `pnpm` via corepack, `.github/workflows/deploy.yml` splits into a `pre-deploy-migrate` job + `deploy-vercel` job with `needs:` dependency and `production` GitHub Environment scoping, `vercel.json` is added at the project root redeclaring the six security headers, and `docs/deployment.md` is added as the operator runbook. No application code, no DB migrations, no dependency changes.

The implementation follows the OpenSpec `config.yaml` rule `apply.follow_existing_code_patterns` — the deploy workflow mirrors `.github/workflows/ci.yml` (same Node 22, same `pnpm/action-setup@v4`, same `pnpm install --frozen-lockfile`). The Dockerfile mirrors the CI workflow's install step (`corepack enable && pnpm install --frozen-lockfile`) so the Docker image is reproducible from the same lockfile the CI uses.

## Architecture Decisions

### Decision: Use `corepack enable` instead of installing pnpm globally in Dockerfile

**Choice**: `RUN corepack enable` at the start of every stage that runs install, then `pnpm install --frozen-lockfile`.
**Alternatives considered**: (a) `npm install -g pnpm@11.3.0` — version drift risk between CI and Docker; (b) baking pnpm into a custom base image — adds maintenance burden and image size; (c) copying `node_modules` from a separate `pnpm fetch` stage — adds complexity for marginal benefit.
**Rationale**: Corepack ships with Node 22-alpine and honors the `packageManager` field in `package.json` (`pnpm@11.3.0`). One source of truth for the pnpm version. No version drift between CI (`pnpm/action-setup@v4` reads `packageManager` the same way) and Docker.

### Decision: Separate `pre-deploy-migrate` job, not a step in `deploy-vercel`

**Choice**: Two jobs — `pre-deploy-migrate` (runs `pnpm db:migrate` against `${{ secrets.PRODUCTION_DATABASE_URL }}`) and `deploy-vercel` (builds + deploys), wired with `needs: pre-deploy-migrate`.
**Alternatives considered**: (a) inline step in `deploy-vercel` — simpler but couples migrate failure to deploy failure (operator can't see migrate logs in isolation, and a partial-failure Vercel deploy is harder to roll back than a failed migrate); (b) external cron / GitHub Action — adds infra outside the workflow file.
**Rationale**: Separate jobs give independent log streams, independent retry semantics, and a clear failure surface. The `needs:` wiring makes the deploy impossible if migrations fail.

### Decision: Both jobs target `environment: production`

**Choice**: Both `pre-deploy-migrate` and `deploy-vercel` declare `environment: name: production`.
**Alternatives considered**: (a) only the deploy job scoped to production, migrate uses workflow-level secrets — leaks secrets to PR previews.
**Rationale**: GitHub Environments give per-environment secrets, manual approval gates, and deployment history. Both jobs need production-scoped secrets (`PRODUCTION_DATABASE_URL` for migrate, Vercel secrets for deploy), so both belong in the `production` environment.

### Decision: `vercel.json` redeclares headers; CORS headers stay in `next.config.ts`

**Choice**: Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy) go in `vercel.json`. CORS headers (`Access-Control-Allow-*`) stay in `next.config.ts`.
**Rationale**: Security headers are static strings — safe in `vercel.json` (parsed at build time). CORS headers read `process.env.APP_URL` at runtime — moving them to `vercel.json` would freeze the value at build time and break multi-environment deployments.

### Decision: `framework: null` in `vercel.json`

**Choice**: Explicit `framework: null`.
**Rationale**: Vercel's auto-detection sometimes silently overwrites `buildCommand` / `outputDirectory` in `vercel.json` when it detects Next.js. `framework: null` forces Vercel to use the explicit config.

## Data Flow

Deploy sequence on push to `main`:

```
git push origin main
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ GitHub Actions: .github/workflows/deploy.yml                   │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  pre-deploy-migrate          deploy-vercel                     │
│  ┌──────────────────┐        ┌──────────────────┐             │
│  │ checkout         │        │ checkout         │             │
│  │ pnpm install     │        │ pnpm install     │             │
│  │ pnpm db:migrate  │──ok──▶ │ vercel pull      │             │
│  │   DATABASE_URL=  │        │ vercel build     │             │
│  │   $PROD_DB_URL   │        │ vercel deploy    │             │
│  └──────────────────┘        └──────────────────┘             │
│           │                            │                       │
│           ▼                            ▼                       │
│   env: production              env: production                 │
└───────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
                                     Vercel production
                                     (reads vercel.json
                                      headers at edge,
                                      inlines NEXT_PUBLIC_*
                                      from Vercel env at build)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `Dockerfile` | Modify | Replace `npm ci` with `corepack enable && pnpm install --frozen-lockfile`; replace `package-lock.json*` COPY with `pnpm-lock.yaml*`; replace `npm run build` with `pnpm build`. Three stages preserved. |
| `.github/workflows/deploy.yml` | Modify | Add `pre-deploy-migrate` job (checkout → setup-node → pnpm install → pnpm db:migrate with `DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}` → `environment: production`). Add `needs: pre-deploy-migrate` to `deploy-vercel`. Add `environment: production` to both jobs. |
| `vercel.json` | Create | New file. `framework: null`, `regions: ["iad1"]`, `headers: [{ source: "/(.*)", headers: [...] }]` with the six security headers. |
| `docs/deployment.md` | Create | New file. Two tables (Vercel secrets, GitHub secrets), rollback section, verify-deploy curl, troubleshooting matrix. |
| `openspec/changes/deployment-foundation/specs/deployment-pipeline/spec.md` | Create | Already exists from spec phase. |
| `openspec/changes/deployment-foundation/design.md` | Create | This file. |

No source code under `src/` changes. No DB migrations. No `package.json` changes.

## Interfaces / Contracts

No new TypeScript interfaces, no new API routes, no new env vars in the dev workflow. The only new contract surfaces are:

**GitHub Actions secrets (NEW)**:
- `PRODUCTION_DATABASE_URL` — Postgres connection string for the production database. Used only by `pre-deploy-migrate`. Format: `postgres://<user>:<pass>@<host>:5432/<db>`.

**Vercel project env vars (operator-set, documented in `docs/deployment.md`)**:
- `DATABASE_URL`, `AUTH_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `APP_URL`, `MINIO_PUBLIC_HOSTNAME` — runtime env vars (unchanged from current AGENTS.md documentation, now also in `docs/deployment.md`).
- `NEXT_PUBLIC_LIVEKIT_URL` — build-time env var (must be `wss://<livekit-host>` for production). Documented as build-time inlined.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | N/A — no application code changes | None |
| Integration | N/A — no DB or API changes | None |
| E2E | Deploy workflow on a scratch Vercel project | Manual: push a branch, watch the GitHub Actions run, verify both jobs succeed, curl the production URL for `Strict-Transport-Security` header |
| Docker | Dockerfile builds cleanly | Manual: `docker build -t test .` against the resulting `Dockerfile`, assert exit 0, assert `.next/standalone/server.js` exists in the image |

Strict TDD is OFF per `openspec/config.yaml` (`testing.strict_tdd: false`). The change is too mechanical for test-first to add value — the value is in the diff itself and the operator's manual smoke test.

## Migration / Rollout

No DB migration required (this change does not touch the schema). Rollout sequence:

1. Merge to `main`.
2. Operator sets `PRODUCTION_DATABASE_URL` in GitHub repo secrets.
3. Operator confirms Vercel project has the required env vars per `docs/deployment.md` (especially `NEXT_PUBLIC_LIVEKIT_URL=wss://...`).
4. Push to `main` triggers `deploy.yml` automatically.
5. Operator verifies the deploy via `curl -fsS https://<domain>/api/health` (when the route is added — out of scope here) or `curl -fsSI https://<domain>/` and checks the `Strict-Transport-Security` header is present.

Rollback: `git revert <merge-sha>` reverts all four changes in one commit. No DB rollback needed.

## Open Questions

- **None blocking.** The decision to default `regions: ["iad1"]` is a guess at the primary user base; the operator can override it via Vercel project settings without touching the file. If the operator wants a different default, they edit `vercel.json` post-merge.
