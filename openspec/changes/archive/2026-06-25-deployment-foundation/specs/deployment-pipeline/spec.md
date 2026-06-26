# Capability: deployment-pipeline

## Purpose

Define the deploy-time infrastructure that ships the Next.js app from `main` to a running Vercel production deployment, including the Docker build that mirrors CI, the GitHub Actions workflow that orchestrates migrations + build + deploy, the `vercel.json` edge config that enforces security headers at the edge, and the operator-facing runbook that documents the secrets an operator must set before the first deploy works. This spec does NOT cover architectural decisions about managed services vs self-hosting (see `migrate-managed-services`), nor the LiveKit container itself (see `livekit-infrastructure`), nor the backend split between Vercel serverless and a separate worker host (owned by `backend-architecture-decision`).

## Requirements

### REQ-DEP-FOUND-1: Dockerfile uses pnpm, not npm

The `Dockerfile` at the project root MUST use `pnpm` (not `npm`) for dependency installation and build invocation. The repo's lockfile is `pnpm-lock.yaml` (no `package-lock.json` is committed), so `npm ci` MUST NOT appear anywhere in the Dockerfile — `npm ci` against a missing `package-lock.json` fails the build with `npm error ENOENT: package-lock.json`.

The base image MUST be `node:22-alpine` (matching `.nvmrc` and `package.json`'s `engines.node`). The `corepack` binary MUST be enabled at the start of every stage that runs install (`RUN corepack enable`) so the `packageManager: "pnpm@11.3.0"` field in `package.json` is honored without a manual `npm install -g pnpm`. The `COPY` instructions that pull the lockfile MUST target `pnpm-lock.yaml*` (not `package-lock.json*`). The install command MUST be `pnpm install --frozen-lockfile --ignore-scripts` (frozen lockfile matches CI; `--ignore-scripts` is safe because the lockfile declares the postinstall hooks and they will run during the build stage). The build command MUST be `pnpm build` (not `npm run build`).

#### Scenario: Dockerfile does not reference npm

- GIVEN `Dockerfile` at the project root
- WHEN the file is read end-to-end
- THEN no `npm ci` or `npm install` or `npm run` line MUST appear
- AND no `package-lock.json` reference MUST appear
- AND at least one `pnpm install` or `pnpm build` line MUST appear

#### Scenario: Dockerfile enables corepack before pnpm install

- GIVEN the `deps` and `builder` stages of `Dockerfile`
- WHEN each stage is read in order
- THEN a `RUN corepack enable` line MUST appear BEFORE the first `pnpm install` line in that stage
- AND the `corepack enable` MUST appear in every stage that runs install (NOT just one)

#### Scenario: Dockerfile builds successfully with the committed lockfile

- GIVEN a clean checkout at a commit where `pnpm-lock.yaml` is in sync with `package.json`
- WHEN `docker build -t test .` is run from the project root
- THEN the build MUST complete with exit code 0
- AND the resulting image MUST contain `.next/standalone/server.js`

#### Scenario: Dockerfile fails fast on a stale lockfile

- GIVEN a developer bumped a dependency version in `package.json` but did NOT regenerate `pnpm-lock.yaml`
- WHEN `docker build -t test .` is run
- THEN the `pnpm install --frozen-lockfile` step MUST exit non-zero
- AND the error message MUST mention `frozen-lockfile` or `Lockfile is incompatible`

### REQ-DEP-FOUND-2: Deploy workflow runs migrations before deploy

The GitHub Actions workflow at `.github/workflows/deploy.yml` MUST execute database migrations against the production database BEFORE the Vercel deploy job runs. A separate job `pre-deploy-migrate` MUST run `pnpm db:migrate` with `DATABASE_URL` set to `${{ secrets.PRODUCTION_DATABASE_URL }}`, and the `deploy-vercel` job MUST declare `needs: pre-deploy-migrate` so the deploy is blocked until migrations succeed.

The `pre-deploy-migrate` job MUST run on the `production` GitHub Environment (declared at the job level with `environment: name: production`). This gives the operator a manual approval gate and a secrets scope separate from PR previews. The deploy job MUST also declare `environment: name: production` so Vercel production env vars are available.

The `PRODUCTION_DATABASE_URL` secret MUST be documented in the workflow header comment as required. If the secret is missing, the job MUST fail with a clear error message before running `pnpm db:migrate` — a missing secret MUST NOT silently default to a CI test DB.

#### Scenario: pre-deploy-migrate job runs pnpm db:migrate

- GIVEN `.github/workflows/deploy.yml`
- WHEN the workflow is parsed
- THEN a job named `pre-deploy-migrate` MUST be present
- AND the job MUST run `pnpm db:migrate`
- AND the job MUST set `DATABASE_URL` from `${{ secrets.PRODUCTION_DATABASE_URL }}`

#### Scenario: deploy-vercel job depends on pre-deploy-migrate

- GIVEN the `deploy-vercel` job in `.github/workflows/deploy.yml`
- WHEN the job definition is read
- THEN a `needs: pre-deploy-migrate` line MUST be present
- AND the deploy job MUST NOT run before the migrate job succeeds

#### Scenario: Both jobs target the production environment

- GIVEN the `pre-deploy-migrate` and `deploy-vercel` jobs
- WHEN each job's `environment:` field is read
- THEN both MUST declare `environment: name: production`
- AND the `pre-deploy-migrate` job MUST set `DATABASE_URL` from `secrets.PRODUCTION_DATABASE_URL` (the environment-scoped secret), NOT from a workflow-level `env:` block

#### Scenario: Missing PRODUCTION_DATABASE_URL fails the workflow

- GIVEN the `PRODUCTION_DATABASE_URL` secret is NOT set in the GitHub repo
- WHEN the workflow is triggered by a push to `main`
- THEN the `pre-deploy-migrate` job MUST fail at the `DATABASE_URL` resolution step
- AND the error message MUST mention `PRODUCTION_DATABASE_URL` so the operator can fix it
- AND `deploy-vercel` MUST NOT run (because `needs: pre-deploy-migrate` is unsatisfied)

### REQ-DEP-FOUND-3: vercel.json ships security headers at the edge

A `vercel.json` file at the project root MUST exist and MUST redeclare the same security headers that `next.config.ts` sets in its `headers()` function: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. The headers MUST apply to all routes via a source pattern of `"/(.*)"`.

The `vercel.json` MUST set `framework: null` to prevent Vercel from auto-detecting Next.js and overriding the file's settings. The `regions` field SHOULD default to `["iad1"]` (Vercel's default region) but the operator MAY override it via project settings.

The CORS headers (`Access-Control-Allow-Origin` and friends) from `next.config.ts` MUST NOT be duplicated in `vercel.json` — they read `process.env.APP_URL` at runtime, and `vercel.json` is parsed at build time, so duplicating them would freeze the value.

#### Scenario: vercel.json exists with security headers

- GIVEN `vercel.json` at the project root
- WHEN the file is parsed
- THEN a `headers` array MUST be present
- AND the array MUST contain an entry for source `"/(.*)"`
- AND the entry MUST list all six security headers with the exact values from `next.config.ts`

#### Scenario: vercel.json sets framework to null

- GIVEN `vercel.json`
- WHEN the top-level keys are read
- THEN `"framework": null` MUST be present
- AND `"framework": "nextjs"` MUST NOT be present (explicit null beats auto-detection)

#### Scenario: CORS headers are NOT in vercel.json

- GIVEN `vercel.json`
- WHEN the headers array is read
- THEN NO `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, or `Access-Control-Allow-Headers` header MUST appear
- AND those headers MUST continue to come from `next.config.ts` (verified by reading that file separately)

### REQ-DEP-FOUND-4: NEXT_PUBLIC_LIVEKIT_URL is set per Vercel environment, not in workflow env

The `NEXT_PUBLIC_LIVEKIT_URL` environment variable MUST be configurable per Vercel environment (production vs preview vs development), and the value used in production MUST be `wss://<livekit-host>` (NOT `ws://` — production browsers require a secure context for `getUserMedia()`). The deploy workflow MUST NOT pass `NEXT_PUBLIC_LIVEKIT_URL` via its top-level `env:` block — `NEXT_PUBLIC_*` vars are inlined by Next.js at build time, and a workflow env var would be ignored at runtime OR freeze the wrong value at build time.

The `docs/deployment.md` operator runbook MUST include a dedicated section titled "Vercel Build-Time Env Vars" that:
1. Lists every `NEXT_PUBLIC_*` var the app uses (`NEXT_PUBLIC_LIVEKIT_URL` at minimum).
2. States explicitly that these vars MUST be set in the Vercel project's "Environment Variables" page, scoped to "Production".
3. States explicitly that setting them as GitHub Actions secrets or as Vercel runtime env vars will NOT work — the value is baked into the client bundle at build time.
4. Shows the expected production value (`wss://<livekit-host>`) and a placeholder example.

#### Scenario: deploy.yml does not set NEXT_PUBLIC_LIVEKIT_URL in workflow env

- GIVEN `.github/workflows/deploy.yml`
- WHEN the top-level `env:` block is read
- THEN no `NEXT_PUBLIC_LIVEKIT_URL` line MUST appear in the workflow env
- AND no `NEXT_PUBLIC_*` line MUST appear in the workflow env (the operator sets these in Vercel, not in GitHub)

#### Scenario: docs/deployment.md documents the Vercel build-time env var pattern

- GIVEN `docs/deployment.md` exists at the project root
- WHEN the "Vercel Build-Time Env Vars" section is read
- THEN `NEXT_PUBLIC_LIVEKIT_URL` MUST be listed
- AND the section MUST state that the var is build-time inlined
- AND the section MUST instruct the operator to set it in the Vercel project's Environment Variables page (NOT in GitHub Actions secrets)
- AND a placeholder production value (`wss://livekit.example.com`) MUST appear in the section

#### Scenario: Production deployment connects to wss:// LiveKit

- GIVEN a Vercel production deployment where `NEXT_PUBLIC_LIVEKIT_URL` is set to `wss://livekit.example.com` in the Vercel project's Environment Variables
- WHEN the operator visits the app in a production browser and navigates to a cita call page
- THEN the client bundle MUST contain `wss://livekit.example.com` (verified via `view-source` or DevTools network tab)
- AND the WebRTC connection MUST attempt `wss://` (not `ws://`)
- AND `getUserMedia()` MUST succeed (no secure-context error)

#### Scenario: Missing NEXT_PUBLIC_LIVEKIT_URL in Vercel silently inlines a wrong value

- GIVEN the operator did NOT set `NEXT_PUBLIC_LIVEKIT_URL` in the Vercel project
- WHEN the Next.js app builds on Vercel
- THEN the client bundle MUST contain `undefined` for the URL (Next.js behavior when `NEXT_PUBLIC_*` is unset at build)
- AND the call page MUST fail to connect with a console error referencing `NEXT_PUBLIC_LIVEKIT_URL`
- AND this is the failure mode `docs/deployment.md` warns against

### REQ-DEP-FOUND-5: docs/deployment.md is the single source of truth for deploy secrets

A `docs/deployment.md` file at the project root MUST exist and MUST enumerate every secret the operator must set before the first production deploy works. The doc MUST contain two tables:

1. **Vercel project secrets** — every env var the Next.js app reads at runtime or build time, with the production value (or placeholder). Group: "Build-time (NEXT_PUBLIC_*)" first, then "Runtime".
2. **GitHub repository secrets** — every secret used by `.github/workflows/deploy.yml` (currently `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`, `PRODUCTION_DATABASE_URL`).

The doc MUST also include:
- A "Rollback" section that documents `vercel rollback` as the standard recovery action.
- A "Verify deploy" section with a one-line `curl` command that hits a known-good route (e.g., `/api/health`) and asserts a 200.
- A "Troubleshooting" section with at least three entries: (a) `NEXT_PUBLIC_LIVEKIT_URL` missing → video calls fail; (b) `PRODUCTION_DATABASE_URL` missing → migrations fail; (c) headers missing from response → `vercel.json` not applied.

#### Scenario: docs/deployment.md exists and lists Vercel secrets

- GIVEN `docs/deployment.md` at the project root
- WHEN the "Vercel project secrets" table is read
- THEN every env var the app reads MUST appear (DATABASE_URL, AUTH_SECRET, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, NEXT_PUBLIC_LIVEKIT_URL, APP_URL, MINIO_PUBLIC_HOSTNAME)
- AND each row MUST have columns: variable name, scope (build-time or runtime), production value or placeholder, and a one-line note

#### Scenario: docs/deployment.md lists GitHub Actions secrets

- GIVEN `docs/deployment.md`
- WHEN the "GitHub repository secrets" table is read
- THEN `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`, and `PRODUCTION_DATABASE_URL` MUST all appear
- AND each row MUST note which job consumes the secret (deploy-vercel or pre-deploy-migrate)

#### Scenario: docs/deployment.md has a rollback section

- GIVEN `docs/deployment.md`
- WHEN the "Rollback" section is read
- THEN it MUST mention `vercel rollback` (the Vercel CLI command) as the recovery action
- AND it MUST state that DB migrations are NOT automatically reverted (the operator must write a forward-fix migration)

#### Scenario: docs/deployment.md has a verify-deploy section

- GIVEN `docs/deployment.md`
- WHEN the "Verify deploy" section is read
- THEN a one-line `curl` command against a known-good route MUST appear
- AND the expected response code MUST be stated (200 OK)
