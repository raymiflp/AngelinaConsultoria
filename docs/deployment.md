# Deployment Runbook

This runbook is the contract between the repo and the operator who deploys it. It lists every secret that must be set before the first deploy works, the order in which the deploy workflow runs, and how to roll back when something goes wrong.

It is the production counterpart to `docs/dev-setup.md`. Read that first if you have not yet stood up the dev stack.

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

After the workflow succeeds, verify the deploy in two ways:

```bash
# 1. Security headers present at the edge (vercel.json applied)
curl -fsSI https://<your-domain>/ | grep -iE 'strict-transport-security|x-frame-options|permissions-policy'

# Expected: three header lines, one per grep match.
```

Then load the app in a browser, open DevTools → Network, navigate to a cita call page, and confirm the WebSocket connection URL starts with `wss://` (not `ws://`).

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
