# LiveKit Setup

ADR-0001 (Vercel-Only Deployment) retired the self-hosted LiveKit Docker container. LiveKit is now a managed service: **LiveKit Cloud** (https://livekit.cloud).

This doc covers:
1. How to provision a LiveKit Cloud dev project for local development.
2. The env-var contract the Next.js app uses against LiveKit Cloud.
3. Why this changed (link to ADR-0001).
4. The boot-time env-var validation that still throws on misconfiguration.

It does NOT cover:
- Caddy / cert automation / VPS firewall rules (those were the self-host story; gone now).
- TURN servers, recording, multi-region (deferred — see ADR-0001's "Out of scope / Follow-ups").

## Provision a LiveKit Cloud dev project

1. Sign up at https://livekit.cloud (free tier, no credit card required).
2. Create a new project. Note the project name (e.g., `angelina-dev`).
3. From the project dashboard, copy:
   - **API Key** (e.g., `APIxxxxxxxxxxxx`)
   - **API Secret** (a base64-encoded string)
   - **URL** (e.g., `wss://angelina-dev-xxxxxxxx.livekit.cloud`)
   - **Webhook URL** — set this to your local dev URL during dev:
     `http://host.docker.internal:3000/api/livekit/webhook`
4. Paste into `.env.local`:

```bash
LIVEKIT_API_KEY=APIxxxxxxxxxxxx
LIVEKIT_API_SECRET=<base64-from-dashboard>
NEXT_PUBLIC_LIVEKIT_URL=wss://angelina-dev-xxxxxxxx.livekit.cloud
LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook
```

5. Restart `pnpm dev`. The eager `livekitServerClient` init in `src/infrastructure/livekit/livekit-server.ts` reads these vars at boot.

## Env-var contract

The Next.js app reads exactly four env vars for LiveKit. All four are documented in `docs/deployment.md` for production deploys.

| Var | Scope | Required | Notes |
|-----|-------|----------|-------|
| `LIVEKIT_API_KEY` | Runtime | Yes | From LiveKit Cloud project dashboard. Server-only — never exposed to the client. |
| `LIVEKIT_API_SECRET` | Runtime | Yes | Base64-encoded, from dashboard. Server-only. |
| `NEXT_PUBLIC_LIVEKIT_URL` | **Build-time** | Yes | `wss://<project>.livekit.cloud`. Inlined into the client bundle. See `docs/deployment.md` "Vercel Build-Time Env Vars". |
| `LIVEKIT_WEBHOOK_URL` | Runtime | Yes | Public URL of `/api/livekit/webhook`. In dev: `http://host.docker.internal:3000/api/livekit/webhook`. In prod: `https://<vercel-domain>/api/livekit/webhook`. Configured in the LiveKit Cloud project dashboard under Webhooks. |

## Boot-time validation (unchanged)

The `livekitServerClient` in `src/infrastructure/livekit/livekit-server.ts` is instantiated eagerly at module load. If `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, or `NEXT_PUBLIC_LIVEKIT_URL` is unset, the import throws with:

```
LiveKit env vars missing. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local.
See docs/livekit.md for setup.
```

This is deliberate. A misconfigured deploy surfaces the error at boot, not three hours later when a user clicks "Join call". The error message points at this doc so you can self-serve.

## Why this changed

ADR-0001 (Vercel-Only Deployment) at `docs/architecture/decisions/0001-vercel-only.md` documents the architectural decision. The short version: self-hosting LiveKit (Docker + Caddy + VPS + cert renewal + firewall rules) is operationally expensive for a service that LiveKit Cloud offers on the free tier with the same SDK. The previous self-host setup is fully removed — `docker-compose.yml` no longer has a `livekit` service, `docker/dev/livekit.yaml` is deleted, and `docs/livekit-prod.md` (the Caddy + cert runbook) is deleted.

## Webhooks

The webhook receiver at `POST /api/livekit/webhook` (in `src/app/api/livekit/webhook/route.ts`) verifies the JWT signature using `LIVEKIT_API_SECRET` and dedupes event IDs via Upstash REST (`webhookDedupe` in `src/infrastructure/redis/cache.ts`).

Configure the webhook URL in your LiveKit Cloud project's dashboard (not in a repo file). The URL must be reachable from the public internet — for local dev, use a tunnel (ngrok, cloudflared) pointing at `http://localhost:3000/api/livekit/webhook`, or `http://host.docker.internal:3000/api/livekit/webhook` if the LiveKit Cloud runner can reach your Docker host.
