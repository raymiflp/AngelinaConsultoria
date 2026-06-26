# Tasks: Deployment Foundation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~135 (10 Dockerfile + 20 deploy.yml + 25 vercel.json + 80 docs) |
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
| 1 | All four config changes ship together | PR 1 | Single PR, <200 lines, no app code |

## Phase 1: Dockerfile → pnpm

- [x] 1.1 Edit `Dockerfile` deps stage: replace `COPY package.json package-lock.json* ./` with `COPY package.json pnpm-lock.yaml* ./`
- [x] 1.2 Edit `Dockerfile` deps stage: replace `RUN npm ci --only=production --ignore-scripts` with `RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts`
- [x] 1.3 Edit `Dockerfile` builder stage: replace `COPY package.json package-lock.json* ./` with `COPY package.json pnpm-lock.yaml* ./`
- [x] 1.4 Edit `Dockerfile` builder stage: add `RUN corepack enable` BEFORE `pnpm install`
- [x] 1.5 Edit `Dockerfile` builder stage: replace `RUN npm ci --ignore-scripts` with `RUN pnpm install --frozen-lockfile --ignore-scripts`
- [x] 1.6 Edit `Dockerfile` builder stage: replace `RUN npm run build` with `RUN pnpm build`

## Phase 2: Deploy Workflow + Migrations

- [x] 2.1 Add `pre-deploy-migrate` job to `.github/workflows/deploy.yml` with `environment: name: production`, `runs-on: ubuntu-latest`, Node 22 + pnpm setup, and step `run: pnpm db:migrate` with `env: DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}`
- [x] 2.2 Add `needs: pre-deploy-migrate` to the `deploy-vercel` job
- [x] 2.3 Add `environment: name: production` to the `deploy-vercel` job
- [x] 2.4 Update workflow header comment to document `PRODUCTION_DATABASE_URL` as a required GitHub Actions secret

## Phase 3: vercel.json Edge Config

- [x] 3.1 Create `vercel.json` at project root with top-level `"framework": null` and `"regions": ["iad1"]`
- [x] 3.2 Add `headers` array with source `"/(.*)"` and the six security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Strict-Transport-Security, Permissions-Policy with `camera=(), microphone=(), geolocation=()`)

## Phase 4: docs/deployment.md Operator Runbook

- [x] 4.1 Create `docs/deployment.md` with header explaining it is the deploy runbook (parallel to `docs/dev-setup.md`)
- [x] 4.2 Add "Vercel project secrets" table: `NEXT_PUBLIC_LIVEKIT_URL` (build-time, `wss://livekit.example.com`), `DATABASE_URL`, `AUTH_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `APP_URL`, `MINIO_PUBLIC_HOSTNAME` (all runtime)
- [x] 4.3 Add "Vercel Build-Time Env Vars" callout section explaining `NEXT_PUBLIC_*` vars are inlined at build, must be set in Vercel project's Environment Variables page, NOT in GitHub secrets
- [x] 4.4 Add "GitHub repository secrets" table: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`, `PRODUCTION_DATABASE_URL`
- [x] 4.5 Add "Rollback" section documenting `vercel rollback` as the recovery action and noting DB migrations are NOT auto-reverted
- [x] 4.6 Add "Verify deploy" section with `curl -fsSI https://<domain>/` and assert `Strict-Transport-Security` header is present
- [x] 4.7 Add "Troubleshooting" matrix with at least three entries: (a) video fails → check `NEXT_PUBLIC_LIVEKIT_URL` in Vercel env; (b) migrate job fails → check `PRODUCTION_DATABASE_URL` secret; (c) headers missing → check `vercel.json` was applied via `vercel inspect`

## Phase 5: Verify

- [x] 5.1 Local checks: Dockerfile grep confirmed zero `npm ci`/`npm install`/`npm run`, `corepack enable` in both stages, `pnpm install --frozen-lockfile` in both stages, `pnpm build` in builder stage
- [ ] 5.2 Manual: push branch, watch GitHub Actions `deploy.yml` run, assert both `pre-deploy-migrate` and `deploy-vercel` jobs succeed (BLOCKED on operator setting `PRODUCTION_DATABASE_URL` and Vercel secrets)
- [ ] 5.3 Manual: after deploy, `curl -fsSI https://<domain>/` and assert `strict-transport-security`, `x-frame-options`, `permissions-policy` headers all present (BLOCKED on real domain)
- [ ] 5.4 Manual: load the call page in a production browser, open DevTools network tab, confirm `wss://` (not `ws://`) in the WebSocket connection URL (BLOCKED on real domain)
