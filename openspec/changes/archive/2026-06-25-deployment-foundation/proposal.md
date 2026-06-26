# Proposal: Deployment Foundation

## Change name

`deployment-foundation` (folder: `deployment-foundation/`, no date prefix — this change is the prerequisite for any production deploy and is being prioritized over `backend-architecture-decision` because the gaps it closes are mechanical, not architectural).

## Intent

The `angelina-consultoria` Next.js 15 app currently has a working Vercel deploy workflow (`.github/workflows/deploy.yml`) and a working local Docker Compose stack (`docker-compose.yml`), but the handoff between them is broken in four concrete ways that prevent a real production deploy. This change closes those four gaps with config-only edits and one small new file (`vercel.json`). No application code changes. No DB migrations. No dependency changes.

The four gaps, in the order they block a deploy:

1. **`Dockerfile` uses `npm ci` but the repo is pnpm-only** — there is no `package-lock.json` in the repo (only `pnpm-lock.yaml`). The Docker build will fail with `npm error ENOENT: package-lock.json` at the very first step. CI uses pnpm (`pnpm/action-setup@v4` + `pnpm install --frozen-lockfile`), so the Dockerfile is the only surface that contradicts the lockfile convention.

2. **`NEXT_PUBLIC_LIVEKIT_URL` is build-time inlined on Vercel.** The CI workflow already pins it to `ws://localhost:7880` (correct for local E2E with self-hosted LiveKit). If the deploy workflow does not override this value for the production environment, the production build will inline `ws://localhost:7880` into the client bundle and every video call from production users will silently fail with a connection error. The `livekit-infrastructure` spec (line 432) already documents this footgun; this change closes the deploy-side guardrail.

3. **The deploy workflow does not run database migrations.** `pnpm db:migrate` (Drizzle) is required before the new build can serve any real traffic, otherwise the app crashes on the first request that hits an unmigrated table. There is no step in `.github/workflows/deploy.yml` that touches the production database. The change adds a pre-deploy migration step gated on a `PRODUCTION_DATABASE_URL` secret.

4. **No `vercel.json` exists.** The security headers (HSTS, X-Frame-Options, Permissions-Policy with `camera=() microphone=()`) currently live in `next.config.ts` `headers()`. On Vercel, those headers are applied by the Next.js runtime at request time, not at the edge — which is fine, but a `vercel.json` with the same headers guarantees they ship with the build output and can be inspected by `vercel inspect` / Vercel's response headers panel. It also gives one canonical place for Vercel-specific config (regions, framework defaults, build env vars policy) so the deploy doesn't depend on whatever defaults Vercel happens to ship this quarter.

This change is intentionally **small and low-risk**. It produces 4 file edits (Dockerfile, deploy.yml, `next.config.ts` headers block, `.github/workflows/deploy.yml`) and 1 new file (`vercel.json`), plus the corresponding OpenSpec artifacts. Every change is reversible by reverting the file. There are no DB migrations, no dependency bumps, no application code changes, and no new env vars in the dev workflow.

The user-visible outcome: an operator who merges this change and sets four Vercel project secrets (`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`, `PRODUCTION_DATABASE_URL`) plus the standard runtime env vars (`DATABASE_URL`, `AUTH_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.<domain>`, `APP_URL`, `MINIO_PUBLIC_HOSTNAME`) can push to `main` and the GitHub Action will build, migrate, and deploy to Vercel production without any manual steps on the server side.

## Why

The gap analysis (done in the explore phase, summarized in chat) found four deploy-blocking issues and several non-blocking ones. The non-blocking ones are deferred to follow-up changes:

| Gap | Status | Owner change |
|-----|--------|--------------|
| Dockerfile uses npm ci | **Fixed here** | `deployment-foundation` |
| NEXT_PUBLIC_LIVEKIT_URL prod override | **Fixed here** | `deployment-foundation` |
| deploy.yml runs db:migrate | **Fixed here** | `deployment-foundation` |
| vercel.json with headers | **Fixed here** | `deployment-foundation` |
| Backend split (Vercel-only vs hybrid) | Deferred | `backend-architecture-decision` |
| Migrate MinIO/Meili/Socket.io to managed | Deferred | `migrate-managed-services` (already in flight) |
| Enable LIVEKIT_E2E in CI by default | Deferred | `pre-deploy-verification` |
| MINIO_PUBLIC_HOSTNAME correct in prod | Deferred (depends on backend split) | `backend-architecture-decision` |

This sequencing matters. The current change only touches the parts of the deployment pipeline that are **uncontroversial** — they fix bugs without requiring an architectural decision. The backend split (`backend-architecture-decision`) and managed-services migration (`migrate-managed-services`) both require a fork in the road that the user hasn't made yet. Doing this change first unblocks all three of them: once the deploy pipeline works, we can ship the backend split as a separate PR with its own rollback surface.

## Scope

### In scope

- **`Dockerfile`** — MODIFIED. Replace `npm ci` with `corepack enable && pnpm install --frozen-lockfile`. Replace `npm run build` with `pnpm build`. Replace `package-lock.json*` COPY targets with `pnpm-lock.yaml*`. The three-stage multi-stage build shape stays the same. The standalone output (`server.js`) works with pnpm-installed `node_modules` because Next.js standalone output bundles its own resolved module graph.
- **`.github/workflows/deploy.yml`** — MODIFIED. Add a `pre-deploy-migrate` job that runs `pnpm db:migrate` against `${{ secrets.PRODUCTION_DATABASE_URL }}` BEFORE the `deploy-vercel` job. Wire it via `needs: pre-deploy-migrate`. Add a `production` environment to the workflow so Vercel environment-scoped secrets (`LIVEKIT_API_KEY`, etc.) are passed through correctly. The deploy job itself does not change — it still uses `vercel build --prod` + `vercel deploy --prebuilt --prod`. Document the `PRODUCTION_DATABASE_URL` secret requirement in the workflow header comment.
- **`vercel.json`** — NEW. Mirrors the security headers from `next.config.ts` (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy). Sets `regions` to a single region closest to the primary user base (defaults to `iad1` — Northern Virginia, Vercel's default — until the operator overrides it). Does NOT redeclare the `Access-Control-Allow-*` headers from `next.config.ts` because those read `process.env.APP_URL` at runtime and would freeze the value at build time if redeclared in `vercel.json`.
- **`next.config.ts`** — UNCHANGED (no edits). The headers stay where they are; `vercel.json` is additive.
- **`openspec/changes/deployment-foundation/specs/deployment-pipeline/spec.md`** — NEW (delta spec). One ADDED requirement: `REQ-DEP-FOUND-1` covering the Dockerfile pnpm fix, the migration step in deploy, the `vercel.json` headers, and the `NEXT_PUBLIC_LIVEKIT_URL` prod override requirement. The capability name `deployment-pipeline` is new (no existing spec covers CI/CD).
- **`docs/deployment.md`** — NEW. Operator-facing runbook: which secrets to set in Vercel, which secrets to set in GitHub, what the deploy workflow does in order, how to roll back, how to verify the deploy succeeded (curl + Sentry release + Vercel deployment URL).

### Out of scope

- The backend split decision (Vercel-only vs Vercel + separate backend for Socket.io / Redis workers). Owned by `backend-architecture-decision`.
- Killing `socket.io` and replacing with a managed alternative. Owned by `migrate-managed-services`.
- Replacing MinIO with Vercel Blob. Owned by `migrate-managed-services` (depends on backend split).
- Replacing self-hosted Meilisearch with Meilisearch Cloud. Owned by `migrate-managed-services`.
- Running `pnpm db:migrate` on every PR preview deploy (only production migrations are in scope; preview DBs use `db:push` or are not migrated at all).
- Pinning the LiveKit image digest in production. Owned by `livekit-pin-image` (not yet scheduled).
- Adding a staging environment to the deploy workflow. The current change assumes one environment (production); staging is a follow-up once the user confirms the deploy target.
- Configuring Vercel Analytics / Speed Insights / Log Drains. Operator's call.
- Secrets management beyond GitHub Actions secrets (no Vault, no Doppler, no AWS Secrets Manager integration).
- Image optimization for MinIO public hostname in prod. Deferred until the backend split decision lands.
- DNS, CDN, Cloudflare, DDoS protection. Operator's call.
- Rollback automation beyond Vercel's native `vercel rollback` CLI (which the operator runs manually).

## Decisions (D1..D8)

| ID | Decision | Rationale |
|---|---|---|
| **D1** | Dockerfile uses `corepack enable && pnpm install --frozen-lockfile`. | `corepack` ships with Node 22 (the base image) and activates the `packageManager` field from `package.json` (`pnpm@11.3.0`). No global `npm install -g pnpm`, no version drift between CI and Docker. `--frozen-lockfile` matches the CI convention and fails the build if `pnpm-lock.yaml` is out of sync with `package.json` — same safety guarantee as CI. |
| **D2** | Migrations run in a separate `pre-deploy-migrate` job, gated on the `production` GitHub Environment. | GitHub Environments give the operator a manual approval gate and a secrets scope separate from PR previews. Running migrations as a separate job means the deploy job can fail fast without leaving the DB in a half-migrated state. The job runs `pnpm db:migrate` (Drizzle), which is idempotent for already-applied migrations and non-destructive for additive changes. For destructive migrations the operator must run them manually via the `pnpm db:migrate` script over SSH / a bastion — that is documented in `docs/deployment.md`. |
| **D3** | `vercel.json` redeclares the security headers from `next.config.ts`. | Defense in depth. If `next.config.ts` headers() ever regresses (e.g., a future contributor moves the headers block into a per-route config that doesn't apply globally), `vercel.json` still ships the headers at the edge. The cost is two places to update headers in the future; the benefit is the headers survive any refactor of `next.config.ts`. |
| **D4** | `vercel.json` does NOT redeclare the CORS headers from `next.config.ts`. | The CORS headers read `process.env.APP_URL` at runtime. `vercel.json` is parsed at build time, so redeclaring them would freeze `APP_URL` at whatever the build env says. Keeping them in `next.config.ts` preserves the runtime override. |
| **D5** | `NEXT_PUBLIC_LIVEKIT_URL` override documented as a required Vercel env var, NOT a workflow env var. | `NEXT_PUBLIC_*` vars are inlined by Next.js at build time, so the workflow env (`env:` block at the top of `deploy.yml`) cannot deliver them at runtime — they would be ignored. The override MUST happen in the Vercel project's "Environment Variables" page, scoped to "Production", and the value MUST be `wss://<livekit-host>` (not `ws://`). This is the same footgun the `livekit-infrastructure` spec already calls out (line 432). `docs/deployment.md` makes this explicit. |
| **D6** | `docs/deployment.md` documents every secret the operator must set, in two lists (Vercel project secrets, GitHub repo secrets). | The current `AGENTS.md` and `docs/dev-setup.md` only cover local dev. There is no operator-facing deploy runbook anywhere in the repo. The doc is the single source of truth for "what secrets do I need to set before the first deploy works." Format: two tables, one for Vercel (runtime + build-time env vars), one for GitHub (Actions secrets). |
| **D7** | Single region (`iad1`) default for `vercel.json`. | The operator can override this per Vercel project settings or by editing the file. Defaulting to `iad1` (Vercel's cheapest / default region) keeps the file shippable for any operator without committing to a geographic choice. |
| **D8** | `vercel.json` sets `framework: null` to prevent Vercel from re-detecting the framework and overriding settings. | Vercel's auto-detection sometimes silently overwrites `buildCommand` / `outputDirectory` in `vercel.json`. Setting `framework: null` forces Vercel to use the explicit config in the file. |

## Capabilities

This change creates one new capability:

- **`deployment-pipeline`** — NEW. Covers the deploy-time infrastructure: Dockerfile pnpm compatibility, GitHub Actions deploy workflow (with migration step), `vercel.json` edge config, and the `NEXT_PUBLIC_LIVEKIT_URL` prod override requirement.

No existing capabilities are MODIFIED. The `livekit-infrastructure` capability already documents the `NEXT_PUBLIC_LIVEKIT_URL` build-time gotcha (line 432); this change adds the deploy-side enforcement without touching the livekit spec.

## Rollback plan

Each change is independently revertible:

| Change | Revert command | Risk |
|--------|----------------|------|
| Dockerfile | `git revert <sha>` | Zero — Docker image is rebuilt on next deploy. Operators who were not yet using Docker are unaffected. |
| `deploy.yml` migration step | Remove the `pre-deploy-migrate` job and the `needs:` line. | Low — the deploy will work as before, but production DB will not auto-migrate. Operator must run migrations manually until the next deploy includes the step again. |
| `vercel.json` | `git rm vercel.json` | Zero — Vercel falls back to project settings. `next.config.ts` headers still apply at the Next.js runtime. |
| `docs/deployment.md` | `git rm docs/deployment.md` | Zero — documentation only. |

Worst-case full rollback: `git revert <merge-sha>` — the repo returns to the pre-change state in one commit. No data loss, no migration rollback needed (this change does not add any DB migration).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Operator forgets to set `NEXT_PUBLIC_LIVEKIT_URL` in Vercel → video calls silently fail in prod | Medium | `docs/deployment.md` calls this out with a bold warning. The spec scenario `NEXT_PUBLIC_LIVEKIT_URL set at runtime on Vercel` (livekit-infrastructure line 432) already covers the failure mode. The operator is expected to read the runbook before the first deploy. |
| `corepack enable` fails on the Docker base image | Low | `node:22-alpine` ships corepack as a default binary since Node 18. If it fails, the fallback is to install pnpm globally (`npm install -g pnpm@11.3.0`) and skip corepack. Documented in `docs/deployment.md`. |
| Production migration takes longer than the GitHub Actions job timeout (default 6h) | Very low | Drizzle migrations on a fresh DB with 6 existing migrations take seconds. If the schema grows to thousands of migrations, the operator must run them out-of-band. Out of scope. |
| `vercel.json` headers conflict with `next.config.ts` headers (double-header scenario) | Low | Vercel documents that headers in `vercel.json` are applied BEFORE `next.config.ts` headers. Duplicate headers in HTTP are allowed by the spec; browsers will use the first one. The risk is operational (debugging confusion), not functional. Documented in `docs/deployment.md` as a "do not edit both files in the same change" warning. |
| `PRODUCTION_DATABASE_URL` secret leaks via GitHub Actions logs | Very low | Drizzle does not log the connection string in `db:migrate` output. The workflow masks all secrets in logs by default. |
