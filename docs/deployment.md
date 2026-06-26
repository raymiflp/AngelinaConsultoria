# Deployment Runbook

This runbook is the contract between the repo and the operator who deploys it. It lists every secret that must be set before the first deploy works, the order in which the deploy workflow runs, and how to roll back when something goes wrong.

It is the production counterpart to `docs/dev-setup.md`. Read that first if you have not yet stood up the dev stack.

## First-Time Setup (one-time, ~30–45 min)

Walk through this section exactly once. After the secrets are in place, every subsequent deploy is `git push origin main` and watch the four-stage pipeline.

### Pre-requisites — accounts to create

All four have free tiers, no credit card required.

- [ ] **GitHub** — you already have this (you're reading the repo).
- [ ] **Vercel** — sign up at https://vercel.com/signup. Use **Continue with GitHub** so the repo import is one-click.
- [ ] **LiveKit Cloud** — sign up at https://livekit.cloud. Free tier, no card.
- [ ] **Upstash** — sign up at https://upstash.com. Free Redis tier, no card.

### Step 1 — Vercel: import the repo and get the IDs

1. Vercel dashboard → **Add New… → Project**.
2. **Import** the `raymiflp/AngelinaConsultoria` repo (or whatever your fork is called).
3. Leave the framework preset as **Next.js** (Vercel auto-detects). Do NOT click Deploy yet — env vars are not set.
4. Once the project is created, go to **Settings → General** and copy:
   - **Project ID** → this is `VERCEL_PROJECT_ID`.
   - **Team ID** (or your personal account ID if no team) → this is `VERCEL_ORG_ID`.
5. Go to https://vercel.com/account/tokens → **Create Token**. Name it `github-actions-deploy`, scope **Full Account**. Copy the token immediately (Vercel only shows it once) → this is `VERCEL_TOKEN`.

### Step 2 — Provision the external services

#### 2a. Vercel Postgres (in-project)

1. In the Vercel project, go to the **Storage** tab → **Create Database** → **Postgres** → **Continue**.
2. Accept the defaults (Hobby plan, region closest to your primary user base, database name `angelina-prod`).
3. After creation, Vercel shows the `POSTGRES_URL` and offers to inject it as an env var. Click **Connect to Project** for both Production and (optionally) Preview environments.
4. Copy the `POSTGRES_URL` value — you will need it for `PRODUCTION_DATABASE_URL` in GitHub secrets (Step 3). The connection string does NOT yet include `?pgbouncer=true&connection_limit=1` — that annotation is appended in Step 4 when you set `DATABASE_URL` in Vercel env vars.

#### 2b. LiveKit Cloud — dev project (for the deployed app)

1. https://livekit.cloud → **Projects** → **Create New Project** → name `angelina-dev`, region closest to your users.
2. From the project dashboard, copy three values:
   - **API Key** (looks like `APIxxxxxxxxxxxx`).
   - **API Secret** — Vercel/LiveKit shows it base64-encoded; copy as-is.
   - **URL** — looks like `wss://angelina-dev-xxxxxxxx.livekit.cloud`.
3. Go to **Settings → Webhooks** → **Add Webhook**:
   - **URL**: `https://<your-future-vercel-domain>/api/livekit/webhook` (you'll fill in the real domain after the first deploy; for now use `https://placeholder.vercel.app/api/livekit/webhook` and update later).
   - **Events to send**: select at minimum `Room Finished`.
   - **API Key**: the same API Key from step 2.

#### 2c. LiveKit Cloud — test project (for CI; separate from dev)

Repeat 2b but name the project `angelina-test`. The CI E2E job (`pnpm test:e2e` in `.github/workflows/ci.yml`) runs against this project — using a separate project avoids room-name collisions between CI runs.

#### 2d. Upstash — Redis (free tier)

1. https://console.upstash.com → **Create Database**.
2. Name `angelina-prod`, type **Regional**, region closest to your Vercel Postgres region (for latency), **TLS** enabled (default).
3. After creation, scroll to **REST API** section. Copy:
   - **UPSTASH_REDIS_REST_URL** (looks like `https://your-db.upstash.io`).
   - **UPSTASH_REDIS_REST_TOKEN** (long random string).

### Step 3 — GitHub repo secrets

Go to **https://github.com/raymiflp/AngelinaConsultoria/settings/secrets/actions** → **New repository secret** for each of:

| Secret | Value | Source |
|--------|-------|--------|
| `VERCEL_TOKEN` | the token from Step 1 | Vercel account/tokens |
| `VERCEL_PROJECT_ID` | the project ID from Step 1 | Vercel project Settings → General |
| `VERCEL_ORG_ID` | the team/account ID from Step 1 | Vercel project Settings → General |
| `PRODUCTION_DATABASE_URL` | the `POSTGRES_URL` from Step 2a (no `?pgbouncer=true` annotation) | Vercel Storage → your Postgres → `.env.local` tab |
| `LIVEKIT_TEST_API_KEY` | API Key from Step 2c (the **test** project) | LiveKit Cloud dashboard |
| `LIVEKIT_TEST_API_SECRET` | API Secret from Step 2c | LiveKit Cloud dashboard |
| `LIVEKIT_TEST_URL` | URL from Step 2c | LiveKit Cloud dashboard |

### Step 4 — Vercel project env vars

Go to the Vercel project → **Settings → Environment Variables** → add each entry below.

**Critical**: the **Scope** column matters. `NEXT_PUBLIC_*` vars MUST be **Build Command** (or **Both**), NOT just Runtime — see the warning under "Vercel Build-Time Env Vars" below.

| Variable | Scope | Value | Source |
|----------|-------|-------|--------|
| `DATABASE_URL` | Runtime, Production | `<POSTGRES_URL from Step 2a>` + append `?pgbouncer=true&connection_limit=1` | Vercel Storage |
| `AUTH_SECRET` | Runtime, Production | Run `openssl rand -base64 32` in a terminal, paste the output | local terminal |
| `AUTH_TRUST_HOST` | Runtime, Production | `true` | (literal) |
| `APP_URL` | Runtime, Production | `https://<your-vercel-domain>` (after first deploy, Vercel shows the domain) | placeholder, update after first deploy |
| `LIVEKIT_API_KEY` | Runtime, Production | API Key from Step 2b (the **dev** project) | LiveKit Cloud |
| `LIVEKIT_API_SECRET` | Runtime, Production | API Secret from Step 2b | LiveKit Cloud |
| `NEXT_PUBLIC_LIVEKIT_URL` | **Build Command** + Production | URL from Step 2b (the `wss://...` one) | LiveKit Cloud |
| `LIVEKIT_WEBHOOK_URL` | Runtime, Production | `https://<your-vercel-domain>/api/livekit/webhook` | placeholder, update after first deploy |
| `MINIO_PUBLIC_HOSTNAME` | Runtime, Production | `*.public.blob.vercel-storage.com` | (literal Vercel Blob hostname pattern) |
| `UPSTASH_REDIS_REST_URL` | Runtime, Production | URL from Step 2d | Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | Runtime, Production | Token from Step 2d | Upstash console |

After saving all env vars, Vercel automatically redeploys the project. This is fine — the build will succeed, the deployed app will start, but `/api/health` will return 503 (DB not yet reachable) and the post-deploy smoke will fail at `/api/health`. That's expected on the first deploy.

### Step 5 — First deploy

```bash
git push origin main
```

Watch the four-stage pipeline in the **Actions** tab:

1. **CI** (`ci.yml`) — lint + typecheck + unit + e2e + audit. The e2e job requires `LIVEKIT_TEST_*` secrets (Step 3) and `LIVEKIT_E2E=1` is set automatically. If CI fails on e2e, the most common cause is missing `LIVEKIT_TEST_*` secrets.
2. **Deploy** (`deploy.yml`) — `pre-deploy-migrate` runs `pnpm db:migrate` against `PRODUCTION_DATABASE_URL`. If that fails, the deploy does not run. The most common cause is a malformed `PRODUCTION_DATABASE_URL` or a Postgres region you can't reach from GitHub Actions runners.
3. **Deploy** continues — `deploy-vercel` runs `vercel build --prod` + `vercel deploy --prebuilt --prod`. The output includes the deployment URL (e.g., `https://angelina-consultoria-xxxxxx.vercel.app`). Copy that URL.
4. **Post-Deploy Smoke** (`post-deploy-smoke.yml`) — automatically triggers after Deploy succeeds. It curls `/`, `/login`, `/api/health` against the URL.

### Step 6 — Verify

A green post-deploy-smoke is the operator's success signal — the deploy is healthy.

If smoke is green, also:

1. Update `APP_URL` in Vercel env vars from `https://placeholder.vercel.app` to the real deployment URL.
2. Update `LIVEKIT_WEBHOOK_URL` in Vercel env vars with the real URL.
3. Update the LiveKit Cloud **dev** project's webhook URL (Step 2b) to the real URL — Vercel injected `https://placeholder.vercel.app` as a placeholder earlier.
4. Push again to trigger another deploy with the corrected URLs.

If smoke is red, check the artifact `post-deploy-smoke-output` in the workflow run for the curl response body. The most common failures:

| Smoke failure | Likely cause | Fix |
|---------------|--------------|-----|
| `/` returns 404 | Deploy didn't actually go to the URL you extracted | Re-run Deploy manually; check `vercel inspect <url>` |
| `/login` returns 500 | `AUTH_TRUST_HOST` not set | Set it in Vercel env vars, push again |
| `/api/health` returns 503 | `DATABASE_URL` missing the `?pgbouncer=true` annotation, or `PRODUCTION_DATABASE_URL` doesn't match | Verify both URLs match and the pool annotation is on `DATABASE_URL` only |
| `/api/health` returns 503 with `database: "disconnected"` | DB region not reachable from Vercel Functions | Verify Vercel Postgres region matches the Vercel Function deployment region |

### Step 7 — You're in production

After the second green smoke (with the real URLs), the platform is live. From this point on:

- `git push origin main` is the deploy trigger.
- Every push runs the full CI + Deploy + Smoke chain.
- To roll back a bad deploy: `vercel rollback --token=$VERCEL_TOKEN` (or click **Promote to Production** on a previous deployment in the Vercel dashboard).

## Required Secrets

The deploy fails fast if any of these are missing. Set them before the first push to `main`.

### Vercel project secrets

Set these in the Vercel project's **Settings → Environment Variables** page. Scope each entry to **Production**.

| Variable | Scope | Production value | Note |
|----------|-------|------------------|------|
| `NEXT_PUBLIC_LIVEKIT_URL` | **Build-time** | `wss://livekit.example.com` | See "Build-Time Env Vars" below. Replace `livekit.example.com` with your LiveKit host. |
| `DATABASE_URL` | Runtime | `postgres://<user>:<pass>@<host>:5432/<db>` | Same DB that `PRODUCTION_DATABASE_URL` points at in GitHub. |
| `AUTH_SECRET` | Runtime | 32+ char random string | Generate with `openssl rand -base64 32`. Used by Auth.js v5 for JWT signing. |
| `LIVEKIT_API_KEY` | Runtime | alphanumeric, ≥8 chars | Must match the `keys.<key>` entry in the prod `livekit.yaml`. |
| `LIVEKIT_API_SECRET` | Runtime | base64 of the secret | Must match the value in prod `livekit.yaml` (base64 form, not raw). |
| `APP_URL` | Runtime | `https://<your-domain>` | Used for CORS `Access-Control-Allow-Origin` in `next.config.ts`. |
| `MINIO_PUBLIC_HOSTNAME` | Runtime | your MinIO public hostname | Used by `next/image` for `remotePatterns`. Set to `minio.local` only in dev. |

### GitHub repository secrets

Set these in the GitHub repo's **Settings → Secrets and variables → Actions** page.

| Secret | Consumed by | Note |
|--------|-------------|------|
| `VERCEL_TOKEN` | `deploy-vercel` | Vercel access token with deploy scope. Get from Vercel account settings. |
| `VERCEL_PROJECT_ID` | `deploy-vercel` | The Vercel project's ID (visible in project settings). |
| `VERCEL_ORG_ID` | `deploy-vercel` | Your Vercel team/org ID. |
| `PRODUCTION_DATABASE_URL` | `pre-deploy-migrate` | Postgres connection string for the production DB. Same DB that `DATABASE_URL` in Vercel points at. |

## Vercel Build-Time Env Vars

`NEXT_PUBLIC_*` environment variables are **inlined into the client bundle at build time** by Next.js. Setting them as GitHub Actions secrets or as Vercel runtime env vars has no effect on the client.

You MUST set them in the Vercel project's **Environment Variables** page, scoped to **Production**. The build step reads them when Vercel compiles the deployment, and the values ship inside the JavaScript bundle that the browser downloads.

If you forget to set `NEXT_PUBLIC_LIVEKIT_URL`:

- The client bundle contains `undefined` for the URL.
- The call page fails to connect with a console error referencing `NEXT_PUBLIC_LIVEKIT_URL`.
- Every video call silently breaks — there is no graceful fallback.

The current change covers `NEXT_PUBLIC_LIVEKIT_URL`. If the app grows more `NEXT_PUBLIC_*` vars, add them to this table.

## Deploy Workflow Order

When you push to `main`, `.github/workflows/deploy.yml` runs two jobs in order:

1. **`pre-deploy-migrate`** — checks out the repo, installs deps with pnpm, runs `pnpm db:migrate` against `PRODUCTION_DATABASE_URL`. If this fails, the deploy does not run.
2. **`deploy-vercel`** — depends on `pre-deploy-migrate` succeeding. Pulls the Vercel environment, runs `vercel build --prod`, runs `vercel deploy --prebuilt --prod`.

Both jobs target the `production` GitHub Environment, which gives you a manual approval gate (if you enable required reviewers in repo settings) and isolates the production secrets from PR previews.

## Verify Deploy

The `post-deploy-smoke` GitHub Actions workflow (`.github/workflows/post-deploy-smoke.yml`) runs automatically after `Deploy` succeeds. It curls three routes against the Vercel deployment URL with a 60-second retry loop (6 attempts × 10s backoff):

| Route | Expected | What it verifies |
|-------|----------|------------------|
| `GET /` | HTTP 200 | The Next.js app renders |
| `GET /login` | HTTP 200 | The login page renders (auth UI is reachable) |
| `GET /api/health` | HTTP 200 + `{"status":"ok"}` | DB connectivity via Vercel Postgres pooler is working |

A green smoke is the operator's success signal — the deploy is healthy. A red smoke means a misconfiguration (env var scope, missing `AUTH_TRUST_HOST`, wrong DATABASE_URL pool annotation, etc.) and should be investigated before considering the deploy complete.

Smoke failures upload `smoke-output-{root,login,health}.txt` as workflow artifacts for debugging.

### Manual spot-checks (optional, after a green smoke)

```bash
# Security headers present at the edge (vercel.json applied)
curl -fsSI https://<your-domain>/ | grep -iE 'strict-transport-security|x-frame-options|permissions-policy'

# Expected: three header lines, one per grep match.
```

Then load the app in a browser, open DevTools → Network, navigate to a cita call page, and confirm the WebSocket connection URL starts with `wss://` (not `ws://`).

### Required CI secrets

The CI workflow's e2e job (which now runs the videocall test by default — was previously skipped) requires these GitHub Actions secrets, set in **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|--------|---------|
| `LIVEKIT_TEST_API_KEY` | LiveKit Cloud free test project API key |
| `LIVEKIT_TEST_API_SECRET` | LiveKit Cloud free test project API secret (base64) |
| `LIVEKIT_TEST_URL` | LiveKit Cloud free test project WSS URL (`wss://<project>.livekit.cloud`) |

Provision the LiveKit Cloud test project at https://livekit.cloud (free tier, no credit card). Without these secrets, the e2e-tests job fails with "LiveKit env vars missing" — this is the loud, documented failure mode (ADR-0001 + `pre-deploy-verification`).

## Rollback

The deploy workflow does not auto-revert. To roll back:

```bash
# Roll back to the previous Vercel deployment
vercel rollback --token=$VERCEL_TOKEN
```

This reverts the Vercel deployment to the previous successful build. It does **NOT** revert DB migrations — if a migration caused the failure, write a forward-fix migration and ship it on the next push.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `pre-deploy-migrate` fails with "secret not found" | `PRODUCTION_DATABASE_URL` not set in GitHub repo secrets | Set it in Settings → Secrets and variables → Actions. |
| `pre-deploy-migrate` fails with connection error | DB unreachable from GitHub Actions runners (firewall) | Whitelist GitHub Actions IP ranges or use a bastion. |
| Call page console: `NEXT_PUBLIC_LIVEKIT_URL is undefined` | Forgot to set `NEXT_PUBLIC_LIVEKIT_URL` in Vercel env vars | Set it in Vercel project → Settings → Environment Variables → Production, then redeploy. |
| Call page connects to `ws://` instead of `wss://` | Same as above, OR `NEXT_PUBLIC_LIVEKIT_URL` was set to `ws://` | Fix the URL scheme to `wss://` and redeploy. |
| `curl -I https://<domain>` shows no `Strict-Transport-Security` header | `vercel.json` not applied | Check `vercel inspect <deployment-url> --token=$VERCEL_TOKEN` for the headers config. Confirm the file is at the project root and the JSON is valid. |
| `vercel build` fails with "framework detected" warning | `vercel.json` does not have `"framework": null` | Add the field and commit. |

## What This Runbook Does Not Cover

- **Self-hosted LiveKit production deployment** — see `docs/livekit-prod.md` for the Caddy + LiveKit + `livekit.yaml` setup.
- **Backend split between Vercel serverless and a separate worker host** — owned by the `backend-architecture-decision` change (in flight).
- **Replacing MinIO / Meilisearch / Socket.io with managed services** — owned by the `migrate-managed-services` change (in flight).
- **Staging environment** — the current workflow has one environment (production). Staging is a follow-up.
