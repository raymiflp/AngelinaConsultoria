# Delta for livekit-infrastructure

## REMOVED Requirements

### Requirement: Docker Service Definition (Dockerfile in compose)

(Reason: LiveKit is no longer self-hosted. ADR-0001 ratified Vercel-Only Deployment; LiveKit Cloud replaces the self-hosted SFU. The `livekit` service is deleted from `docker-compose.yml`.)
(Migration: REQ-MD-3 in `managed-deployment/spec.md` covers the LiveKit Cloud env-var contract. Local dev runs against a LiveKit Cloud dev project, not a local container.)

### Requirement: Dev API Key and Secret (`devkey` / `secret`)

(Reason: LiveKit Cloud has its own API key/secret pair, not the `--dev` defaults. The dev defaults were specific to the local `livekit-server --dev` mode which is no longer used.)
(Migration: Developers provision a LiveKit Cloud project and copy the project's API key/secret into `.env.local`. Documented in `docs/livekit.md` after the rewrite.)

### Requirement: Public URL and TLS Exemption (`ws://localhost:7880`)

(Reason: Localhost TLS exemption was specific to the self-hosted container running on `localhost`. LiveKit Cloud mandates TLS — `wss://` only. The `ws://localhost:7880` value is no longer valid in dev either (LiveKit Cloud dev projects use a `wss://` URL).)
(Migration: REQ-MD-4 covers the build-time-inlined `NEXT_PUBLIC_LIVEKIT_URL` requirement; the value is `wss://<project>.livekit.cloud` for both dev and prod.)

### Requirement: Boot-Time Env Validation (eager init pattern, unchanged)

(Reason kept — this requirement is PRESERVED. The eager init pattern in `src/infrastructure/livekit/livekit-server.ts` is unchanged. The error message wording is unchanged. Only the values of the env vars change.)

### Requirement: REQ-LI-WH-1 — Webhook Configuration (docker/dev/livekit.yaml)

(Reason: The `docker/dev/livekit.yaml` webhook config is deleted with the `livekit` Docker service. The LiveKit Cloud webhook URL is configured in the LiveKit Cloud project dashboard, not in a repo file.)
(Migration: REQ-VCA-WH-1 in `video-calls-api/spec.md` continues to require the `/api/livekit/webhook` route handler to verify webhook signatures using `LIVEKIT_API_SECRET`. The LiveKit Cloud dashboard config is operator responsibility, documented in `docs/livekit.md`.)

### Requirement: REQ-LI-PROD-1 — LiveKit Production TLS Deployment (Caddy + cert automation)

(Reason: LiveKit Cloud handles TLS termination and cert automation. The Caddy + Let's Encrypt + `docker-compose.override.yml` + `docker/prod/livekit.yaml` + `docs/livekit-prod.md` artifacts are deleted.)
(Migration: None needed — LiveKit Cloud is fully managed. The operator provisions a project at livekit.cloud and copies the API key + URL into Vercel env vars.)

## ADDED Requirements

### Requirement: REQ-LI-CLOUD-1 — LiveKit Cloud is the SFU

The system's video-call SFU MUST be LiveKit Cloud (https://livekit.cloud), not a self-hosted container. The `livekit-server-sdk` package MUST continue to be used (no SDK swap). The env vars `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, and `LIVEKIT_WEBHOOK_URL` MUST be set to the LiveKit Cloud project's values.

`NEXT_PUBLIC_LIVEKIT_URL` MUST be `wss://<project-subdomain>.livekit.cloud` (TLS required, `ws://` is rejected by LiveKit Cloud). The env var MUST be scoped to "Build Command" or "Both" in Vercel's Environment Variables page (covered by REQ-MD-4).

`LIVEKIT_WEBHOOK_URL` MUST be the public URL of the deployed Next.js app's `/api/livekit/webhook` endpoint (e.g., `https://<vercel-domain>.vercel.app/api/livekit/webhook` for previews, `https://<custom-domain>/api/livekit/webhook` for prod). The webhook is configured in the LiveKit Cloud project's dashboard, NOT in a repo file.

#### Scenario: livekit-server-sdk is the integration SDK

- GIVEN `package.json`
- WHEN the dependencies are read
- THEN `"livekit-server-sdk"` MUST appear with a version pinned to `2.15.x` or higher
- AND no `livekit` self-hosted server package (e.g., `livekit-server`) MUST appear

#### Scenario: NEXT_PUBLIC_LIVEKIT_URL is wss:// on Vercel

- GIVEN the Vercel production environment variables
- WHEN `NEXT_PUBLIC_LIVEKIT_URL` is read
- THEN it MUST start with `wss://`
- AND the host MUST end with `.livekit.cloud` (or a custom domain if the operator configured one)

#### Scenario: Webhook URL points at the Vercel deployment

- GIVEN the LiveKit Cloud project's webhook config
- WHEN the webhook URL is inspected
- THEN it MUST be the public Vercel app URL + `/api/livekit/webhook`
- AND the path MUST match the route handler at `src/app/api/livekit/webhook/route.ts`
