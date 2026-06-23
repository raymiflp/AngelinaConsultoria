# LiveKit Infrastructure Specification

## Purpose

Define the runtime surface for the self-hosted LiveKit SFU that powers the video calls. The platform runs LiveKit in Docker (not LiveKit Cloud) to keep consultation traffic in-house. This spec covers the Docker service definition, the environment variables, the dev-mode API key/secret pair, the no-TLS exemption for `localhost`, the boot-time validation of env vars, and the dev documentation. It does NOT cover the call page UI (see `video-calls-ui`) or the procedure (see `video-calls-api`).

## Requirements

### Requirement: Docker Service Definition

The `docker-compose.yml` at the project root MUST include a `livekit` service with the following exact configuration:

```yaml
livekit:
  image: livekit/livekit-server:latest
  container_name: angelina-livekit
  restart: unless-stopped
  ports:
    - "7880:7880"   # HTTP signaling
    - "7881:7881"   # WebRTC over TCP
    - "7882:7882/udp"  # WebRTC over UDP
  command: --dev --bind 0.0.0.0
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:7880/"]
    interval: 10s
    timeout: 3s
    retries: 5
```

The image MUST be `livekit/livekit-server:latest` (rolling tag — pinned in production via the image digest, out of MVP scope). The `container_name` MUST be `angelina-livekit` for predictable scripts (`docker logs angelina-livekit`). The `restart: unless-stopped` policy keeps the dev experience frictionless across `docker compose down / up` cycles. The `command: --dev --bind 0.0.0.0` flag enables permissive dev defaults and binds the signaling port to all interfaces (required for cross-platform Docker networking).

The three ports are non-negotiable: 7880 is HTTP signaling, 7881 is WebRTC over TCP (the TURN-over-TCP fallback), 7882/udp is WebRTC over UDP (the primary media path). Missing any of them breaks the call.

The healthcheck MUST call `wget -qO- http://localhost:7880/` every 10 seconds with 5 retries. A `wget` probe is preferred over `curl` because `wget` is in the LiveKit container's base image.

#### Scenario: livekit service is present in docker-compose

- GIVEN `docker-compose.yml` at the project root
- WHEN the file is parsed
- THEN a `livekit` service MUST be defined
- AND its `image` MUST start with `livekit/livekit-server`
- AND its `container_name` MUST be `angelina-livekit`

#### Scenario: livekit service exposes the three ports

- GIVEN the `livekit` service
- WHEN the `ports` block is inspected
- THEN `"7880:7880"` MUST be present
- AND `"7881:7881"` MUST be present
- AND `"7882:7882/udp"` MUST be present

#### Scenario: livekit command enables dev mode and binds all interfaces

- GIVEN the `livekit` service
- WHEN the `command` is inspected
- THEN it MUST contain `--dev`
- AND it MUST contain `--bind 0.0.0.0`

#### Scenario: livekit healthcheck probes the signaling port

- GIVEN the `livekit` service
- WHEN the `healthcheck` block is inspected
- THEN the `test` MUST call `wget` against `http://localhost:7880/`
- AND the `interval` MUST be `10s`
- AND the `retries` MUST be `5`

#### Scenario: docker compose up brings up livekit

- GIVEN the `livekit` service is defined
- WHEN `docker compose up -d livekit` is run
- THEN the container MUST start
- AND `docker ps` MUST show `angelina-livekit` in the list
- AND `curl -sS http://localhost:7880` MUST return a LiveKit server identification response

### Requirement: Dev API Key and Secret

The LiveKit `--dev` mode MUST be paired with the official dev defaults: API key `devkey` and API secret `secret`. These values are the documented defaults in the [LiveKit repository](https://github.com/livekit/livekit) and the `livekit-server --dev` help text. Using any other pair (e.g. `devsecret`) makes the container refuse to issue tokens with a confusing "invalid api key" error that wastes an hour of debug time.

The `.env.example` file at the project root MUST carry placeholders, not real values, to discourage committing real-looking secrets. The exact lines MUST be:

```
LIVEKIT_API_KEY=changeme
LIVEKIT_API_SECRET=changeme-in-prod
```

The `.env.example` MUST include a comment above the LiveKit block reading: `"# Get these from your LiveKit deployment. For local dev, use devkey/secret (the defaults of livekit-server --dev)."`

The `.env.local.example` file (if present) MUST carry the real dev values:

```
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

#### Scenario: dev mode uses devkey and secret

- GIVEN the LiveKit container is started with `--dev`
- WHEN the container logs are inspected
- THEN the API key in use MUST be `devkey`
- AND the secret in use MUST be `secret`

#### Scenario: .env.example uses placeholders

- GIVEN the project root
- WHEN `.env.example` is read
- THEN the `LIVEKIT_API_KEY` line MUST be a placeholder (NOT `devkey`)
- AND the `LIVEKIT_API_SECRET` line MUST be a placeholder (NOT `secret`)

#### Scenario: .env.example comment explains the dev defaults

- GIVEN `.env.example`
- WHEN the LiveKit block is inspected
- THEN a comment line referencing `devkey`/`secret` and `livekit-server --dev` MUST appear immediately above the `LIVEKIT_API_KEY` line

#### Scenario: .env.local.example uses real dev values

- GIVEN `.env.local.example` exists
- WHEN the LiveKit block is read
- THEN `LIVEKIT_API_KEY` MUST be `devkey`
- AND `LIVEKIT_API_SECRET` MUST be `secret`

#### Scenario: key/secret mismatch fails fast

- GIVEN `.env.local` has `LIVEKIT_API_KEY=devkey` and `LIVEKIT_API_SECRET=wrong-secret`
- WHEN the Next.js server calls `getRoomToken`
- THEN the LiveKit SDK MUST reject the token sign call
- AND the audit log entry MUST NOT be written (the token was never issued)

### Requirement: Public URL and TLS Exemption

The `NEXT_PUBLIC_LIVEKIT_URL` environment variable MUST be `ws://localhost:7880` in development. The `ws://` scheme (NOT `wss://`) is correct for dev: the LiveKit dev container has no TLS, and `ws://` works because `localhost` is exempt from the browser's secure-context rule for WebRTC. Every modern browser treats `localhost` as a secure context, so `getUserMedia()` works without `wss://` and without a real certificate.

The `NEXT_PUBLIC_LIVEKIT_URL` is a `NEXT_PUBLIC_*` env var, so it is inlined into the client bundle at build time. The value MUST be set in `.env.local` (git-ignored) — NOT in `.env.example` directly, because real values for the dev environment should not be committed.

Production deployment MUST override this env var to `wss://<your-livekit-host>` with a real certificate. Production override is out of scope for this change but MUST be documented in `docs/livekit.md`. _(Resolved 2026-06-20 by `livekit-tls-prod` change — see REQ-LI-PROD-1 below.)_

#### Scenario: dev URL is ws://localhost:7880

- GIVEN the dev environment
- WHEN `.env.local` is read
- THEN `NEXT_PUBLIC_LIVEKIT_URL` MUST be `ws://localhost:7880`
- AND it MUST NOT be `wss://` (no TLS in dev)

#### Scenario: ws:// works on localhost in a modern browser

- GIVEN the user opens `/citas/[id]/llamada` on `http://localhost:3000` (the dev Next.js port)
- WHEN the call page tries to call `getUserMedia()` and connect to `ws://localhost:7880`
- THEN the browser MUST NOT raise a secure-context error
- AND the camera and microphone prompts MUST appear

#### Scenario: tunneling away from localhost breaks the call

- GIVEN a developer tunnels the Next.js port via `ngrok` and the browser loads the app from `https://abc.ngrok.io`
- WHEN the call page tries to connect to `ws://localhost:7880`
- THEN the browser MUST raise a secure-context error (WebRTC requires a secure context, and the LiveKit host is not on a secure context from the browser's point of view)
- AND this scenario is documented as a dev experience caveat (out of MVP to fix)

### Requirement: Boot-Time Env Validation

The `LiveKitServerClient` wrapper at `src/infrastructure/livekit/livekit-server.ts` MUST validate the env vars at module load time, NOT per-request. Validation at boot means a missing `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` surfaces immediately when the Next.js server starts, not on the first user's first call. The error MUST be loud (a thrown `Error`) so the dev sees the missing-var message in the boot log.

If `LIVEKIT_API_KEY` is missing OR `LIVEKIT_API_SECRET` is missing, the module MUST throw an `Error` with the exact message: `"LiveKit env vars missing. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local. See docs/livekit.md for setup."` The message MUST name both vars (not just one) and MUST point at the doc so the dev can self-serve.

If both vars are present, the module MUST instantiate the `LiveKitServerClient` once and export a singleton. Subsequent imports of the module MUST return the same instance (Node's module cache handles this).

#### Scenario: missing API key fails at boot

- GIVEN `LIVEKIT_API_KEY` is unset in the environment
- WHEN the Next.js server boots and imports `livekit-server.ts`
- THEN the import MUST throw an `Error`
- AND the error message MUST contain `"LiveKit env vars missing"`
- AND the message MUST contain `"LIVEKIT_API_KEY"`
- AND the message MUST contain `"LIVEKIT_API_SECRET"`
- AND the message MUST point to `docs/livekit.md`

#### Scenario: missing secret fails at boot

- GIVEN `LIVEKIT_API_SECRET` is unset
- WHEN the Next.js server boots
- THEN the import MUST throw an `Error` with the documented message

#### Scenario: present vars instantiate the singleton

- GIVEN both env vars are set to `devkey` / `secret`
- WHEN `livekit-server.ts` is imported
- THEN a `LiveKitServerClient` instance MUST be exported
- AND a second import MUST return the same instance (Node module cache)

#### Scenario: no per-request env check

- GIVEN the module loaded successfully (vars present)
- WHEN `getRoomToken` is called 100 times
- THEN the env-var check MUST run at most once (the singleton was created at boot)

### Requirement: Documentation

A short setup section MUST be added to `docs/livekit.md` (or as a top-of-file comment block in `docker-compose.yml` if `docs/livekit.md` does not exist). The section MUST cover:

1. **How to start LiveKit locally**: `docker compose up -d livekit`. The command MUST be copy-pasteable.
2. **The dev key/secret are `devkey` / `secret`**. This MUST be called out verbatim because it is the most common footgun.
3. **The same values MUST be in `.env.local`** as `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`. The doc MUST show the exact `.env.local` snippet.
4. **Production requires `wss://` + a real certificate**. The doc MUST say this is out of MVP scope and point to a future change ("livekit-tls-prod").

The doc MUST be in English (spec body language) but the user-facing strings (e.g. error messages) it references are in Spanish per the project convention.

#### Scenario: docs cover the four required topics

- GIVEN `docs/livekit.md` exists
- WHEN the doc is read
- THEN a section on starting LiveKit locally MUST be present
- AND the dev key/secret MUST appear as `devkey` / `secret`
- AND a `.env.local` snippet with those values MUST be in the doc
- AND a note about production `wss://` + cert MUST be present

#### Scenario: dev setup is one command from clone

- GIVEN a fresh clone of the repo with no env vars
- WHEN a new dev follows the doc
- THEN the steps MUST be: (1) `cp .env.example .env.local` and edit LiveKit vars, (2) `docker compose up -d livekit`, (3) `pnpm dev`
- AND no manual `livekit-server` install is required (the Docker image is the runtime)
- AND no `mkcert` step is required (dev uses `ws://`)

#### Scenario: README dev section mentions LiveKit

- GIVEN `README.md` exists and has a "Development" or "Getting Started" section
- WHEN the change is applied
- THEN that section MUST mention LiveKit as part of the dev stack
- AND it MUST link to (or include) the `docker compose up -d livekit` command
- AND it MUST list `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` as required env vars

## LiveKit Webhooks Additions (2026-06-19)

The following requirement is ADDED to the livekit-infrastructure spec by the `2026-06-19-livekit-webhooks` change. It closes R5 from the explore phase: the self-hosted LiveKit container currently runs with `--dev --bind 0.0.0.0` only (no `webhook:` block), so webhooks are silently disabled. The webhook receiver at `POST /api/livekit/webhook` (see `video-calls-api/spec.md` REQ-VCA-WH-1) is reachable but useless without this config — both ship in the same PR. The full reasoning for the config shape is in D11 / AD-13 / AD-14 of the proposal.

### Requirement: REQ-LI-WH-1 — Webhook Configuration

The self-hosted LiveKit container MUST be configured to deliver webhooks. The configuration is split across four surfaces and ALL of them MUST be present for the webhook to fire in dev.

First, a new file `docker/dev/livekit.yaml` MUST be created at the project root with this exact shape:

```yaml
port: 7880
bind_addresses:
  - ""
rtc:
  tcp_port: 7881
  udp_port: 7882
turn:
  enabled: false
webhook:
  api_key: devkey
  urls:
    - ${LIVEKIT_WEBHOOK_URL:-http://host.docker.internal:3000/api/livekit/webhook}
keys:
  devkey: <base64 of "secret">
```

The `webhook:` block MUST use `api_key: devkey` (matching the dev token key in `.env.local.example`) and MUST list at least one URL under `urls:`. The `keys:` block MUST use the base64-encoded form of `secret` (the `devkey: <secret>` shorthand only works under `--dev` without `--config`; once `--config` is added the base64 form is required by the LiveKit config schema).

Second, the `livekit` service in `docker-compose.yml` MUST mount `./docker/dev/livekit.yaml` to `/etc/livekit.yaml:ro` (`volumes: - ./docker/dev/livekit.yaml:/etc/livekit.yaml:ro`). The container's `command` MUST include `--config /etc/livekit.yaml` in addition to the existing `--dev --bind 0.0.0.0` flags. Without `--config`, the mounted file is ignored.

Third, the `livekit` service MUST include `extra_hosts: - "host.docker.internal:host-gateway"`. Mac and Windows Docker Desktop provide `host.docker.internal` out of the box; Linux does not. The `extra_hosts` entry is harmless on Mac/Windows (host-gateway resolves to the same address) and required on Linux to reach the Next.js dev server from inside the container. The entry MUST be applied unconditionally (NOT platform-conditional) — the cost is zero on Mac/Windows and the cost of forgetting it on Linux is a silent 24h debug session (R8).

Fourth, the env var `LIVEKIT_WEBHOOK_URL` MUST be documented in BOTH `.env.example` and `.env.local.example` with the default `http://host.docker.internal:3000/api/livekit/webhook`. The `livekit.yaml` references it via `${LIVEKIT_WEBHOOK_URL:-<default>}` so the same YAML works for staging/prod with different URLs (no re-mount needed). A comment MUST explain the cross-platform `host.docker.internal` caveat for Linux users.

#### Scenario: livekit.yaml is mounted at /etc/livekit.yaml

- GIVEN `docker/dev/livekit.yaml` exists at the project root with the documented shape
- WHEN the `livekit` service in `docker-compose.yml` is inspected
- THEN a `volumes:` entry MUST mount `./docker/dev/livekit.yaml` to `/etc/livekit.yaml:ro`

#### Scenario: livekit command includes --config flag

- GIVEN the `livekit` service in `docker-compose.yml`
- WHEN the `command` is inspected
- THEN it MUST contain `--config /etc/livekit.yaml`
- AND it MUST still contain `--dev` AND `--bind 0.0.0.0` (existing flags preserved)

#### Scenario: extra_hosts is set for host.docker.internal cross-platform

- GIVEN the `livekit` service in `docker-compose.yml`
- WHEN the `extra_hosts` block is inspected
- THEN a `host.docker.internal:host-gateway` entry MUST be present
- AND the entry MUST be set unconditionally (NOT behind a platform conditional)

#### Scenario: LIVEKIT_WEBHOOK_URL env var has a documented default

- GIVEN `.env.example` and `.env.local.example`
- WHEN the LiveKit env var block is inspected
- THEN `LIVEKIT_WEBHOOK_URL` MUST be present
- AND the default value MUST be `http://host.docker.internal:3000/api/livekit/webhook`
- AND a comment MUST explain the cross-platform `host.docker.internal` caveat for Linux

## LiveKit Production TLS Additions (2026-06-20)

The following requirement was ADDED to the livekit-infrastructure spec by the `livekit-tls-prod` change (archived 2026-06-20). It closes the placeholder at line 135 of this spec: the production deployment of the self-hosted LiveKit container with TLS termination (Caddy), cert automation (Let's Encrypt via ACME), and prod-grade resource limits (healthcheck, restart, mem_limit). Doc-only delta — no application code, no LiveKit server code, no DB changes.

## ADDED Requirements

### Requirement: REQ-LI-PROD-1 — LiveKit Production TLS Deployment

The system SHALL document and configure production deployment of the self-hosted LiveKit container with TLS termination, cert automation, and prod-grade resource limits.

The deployment SHALL satisfy ALL of the following:

#### Production environment variables

A `docs/livekit-prod.md` file SHALL exist AND it SHALL document the following env vars with default values and rationale:

- `LIVEKIT_API_KEY` — alphanumeric, ≥8 chars, matches the `keys.<key>` entry in prod `livekit.yaml`.
- `LIVEKIT_API_SECRET` — base64-encoded (NOT the raw secret), matches the value in prod `livekit.yaml`.
- `NEXT_PUBLIC_LIVEKIT_URL` — `https://livekit.angelina-consultoria.com`, set at BUILD time on Vercel (not runtime).
- `LIVEKIT_WEBHOOK_URL` — `https://angelina-consultoria.com/api/livekit/webhook` (the Vercel app URL).
- `CADDY_DOMAIN` — `livekit.angelina-consultoria.com`.
- `CADDY_EMAIL` — `ops@angelina-consultoria.com` (for Let's Encrypt ACME registration).
- `LIVEKIT_NODE_IP` — the VPS public IP (or empty if using DDNS).

#### Dev flag removal

A `docker/prod/docker-compose.override.yml` file SHALL exist AND it SHALL:

- Start the LiveKit service WITHOUT the `--dev` flag.
- Use the prod `livekit.yaml` config (mounted from `docker/prod/livekit.yaml`).
- Set `restart: always`.
- Set `mem_limit: 512m` (or higher; documented in `docs/livekit-prod.md`).
- Include a healthcheck on port 7880 (HTTP GET `/` returning 200).

The `docs/livekit-prod.md` SHALL include a pre-deployment checklist that explicitly calls out removing `--dev`.

#### TLS termination and cert automation

A `docker/prod/Caddyfile` SHALL exist AND it SHALL:

- Listen on `:443` (HTTPS) and `:80` (HTTP, ACME challenge only — redirect to 443 otherwise).
- Auto-provision and auto-renew Let's Encrypt certs via Caddy's built-in ACME.
- Reverse-proxy all HTTPS traffic to the `angelina-livekit:7880` service.
- Set HSTS header with `max-age=31536000; includeSubDomains; preload`.

The `docs/livekit-prod.md` SHALL document the Caddy ACME HTTP-01 challenge requirement (port 80 open on VPS firewall).

#### Production webhook URL

The prod `docker/prod/livekit.yaml` `webhook.urls` array SHALL use the public Vercel URL (`https://angelina-consultoria.com/api/livekit/webhook`), NOT `host.docker.internal`.

The `docs/livekit-prod.md` SHALL include a smoke-test command that verifies the webhook reaches Vercel:

```bash
curl -X POST https://angelina-consultoria.com/api/livekit/webhook \
  -H "Authorization: Bearer test" -d '{}'  # expect 401 (bad signature)
```

#### Healthcheck and resource limits

The prod `docker-compose.override.yml` SHALL configure:

- `healthcheck.test: ["CMD", "curl", "-f", "http://localhost:7880/"]`
- `healthcheck.interval: 30s`
- `healthcheck.timeout: 5s`
- `healthcheck.retries: 3`
- `mem_limit: 512m`
- `restart: always`

#### Node IP for WebRTC SDP

The prod `docker/prod/livekit.yaml` SHALL include:

```yaml
rtc:
  node_ip: ${LIVEKIT_NODE_IP}
  # ... (other rtc config from existing dev livekit.yaml)
```

When `LIVEKIT_NODE_IP` is empty, the `docs/livekit-prod.md` SHALL document the DDNS alternative.

#### UDP port 7882 firewall

The `docs/livekit-prod.md` SHALL include a "Prerequisites" section with explicit `ufw` (or equivalent) commands:

```bash
sudo ufw allow 80/tcp    # ACME challenge
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 7882/udp  # WebRTC media (cannot be reverse-proxied)
```

#### Secrets rotation runbook

The `docs/livekit-prod.md` SHALL include a "Secrets Rotation" section with step-by-step instructions for rotating `LIVEKIT_API_SECRET`:

1. Generate new secret: `openssl rand -base64 32`
2. Update `docker/prod/livekit.yaml` `keys.<key>` value.
3. Update `LIVEKIT_API_SECRET` env var on Vercel.
4. Redeploy Vercel (the new env var MUST be set at build time).
5. Restart LiveKit container: `docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml restart angelina-livekit`.
6. Verify with `curl https://livekit.angelina-consultoria.com/ping`.

#### Scenario: Dev to prod migration

- GIVEN a developer has the dev `docker-compose.yml` running locally
- WHEN they follow the `docs/livekit-prod.md` migration checklist
- THEN they end up with a prod-grade deployment:
  - Caddy is reverse-proxying HTTPS → LiveKit:7880.
  - LiveKit runs without `--dev` (auth enabled).
  - Certs are auto-renewed.
  - Webhooks reach the public Vercel URL.
  - Healthcheck passes.
  - UDP 7882 is reachable.

#### Scenario: Cert renewal verification

- GIVEN the LiveKit deployment is running
- WHEN 60 days pass (less than the 90-day Let's Encrypt cert lifetime)
- THEN Caddy automatically renews the cert without manual intervention
- AND the `docker compose logs caddy` shows successful renewal.

#### Scenario: Webhook reachability

- GIVEN the prod `livekit.yaml` has `webhook.urls: [https://angelina-consultoria.com/api/livekit/webhook]`
- WHEN a LiveKit `room_finished` event fires in prod
- THEN the Vercel route handler at `/api/livekit/webhook` receives the event
- AND verifies the signature using `LIVEKIT_API_SECRET` from Vercel env
- AND returns 200 OK after auto-completing the cita.

#### Scenario: Dev flag accidentally left on

- GIVEN the LiveKit container is started with `--dev` flag in prod
- WHEN any unauthenticated client attempts to mint a token
- THEN the server accepts it (auth is disabled)
- AND the prod deployment is COMPROMISED.

Mitigation: The `docker/prod/docker-compose.override.yml` MUST NOT include `--dev`. The `docs/livekit-prod.md` SHALL include a pre-deployment checklist that grep's for `--dev` in the running container's command and fails the deploy if found.

#### Scenario: NEXT_PUBLIC_LIVEKIT_URL set at runtime on Vercel

- GIVEN the user sets `NEXT_PUBLIC_LIVEKIT_URL=https://livekit.angelina-consultoria.com` in Vercel runtime env vars
- WHEN the Next.js app builds
- THEN the URL is NOT inlined (because NEXT_PUBLIC_ vars are inlined at build time)
- AND the client fails to connect to LiveKit.

Mitigation: The `docs/livekit-prod.md` SHALL have a dedicated section "Vercel Build-Time Env Vars" that explains this and instructs setting it in Vercel's "Environment Variables" page under "Build Command" scope.

#### Scenario: UDP 7882 blocked by firewall

- GIVEN the VPS firewall blocks port 7882/UDP
- WHEN a participant in the video call sends media
- THEN the connection fails with "ICE failed" or "no viable candidate"
- AND the call cannot establish.

Mitigation: `docs/livekit-prod.md` Prerequisites section includes the explicit `ufw allow 7882/udp` command.

#### Scenario: Missing base64 encoding on secret

- GIVEN the user edits `docker/prod/livekit.yaml` and pastes the raw secret (not base64) into `keys.<key>`
- WHEN LiveKit starts without `--dev`
- THEN the container exits with an error like "invalid key format"
- AND the deployment is broken.

Mitigation: `docs/livekit-prod.md` includes the exact `echo -n "secret" | base64` command and shows the expected output format.

#### Scenario: Static IP not configured with node_ip

- GIVEN the VPS does NOT have a static public IP AND `LIVEKIT_NODE_IP` is empty in `livekit.yaml`
- WHEN the LiveKit server returns ICE candidates (SDP) to clients
- THEN the candidates include the docker bridge IP (172.17.0.x) which is unreachable from the public internet
- AND the call fails to negotiate.

Mitigation: `docs/livekit-prod.md` documents the static IP requirement AND the DDNS alternative for dynamic-IP deployments.

## LiveKit Eager Init Additions (2026-06-23)

The following requirement was ADDED to the livekit-infrastructure spec by the `videollamadas-mvp-e2e` change (archived 2026-06-23). It codifies the eager-init contract: the `LiveKitServerClient` is instantiated as a module-level constant at import time, so configuration errors surface at boot instead of three hours later in production. The delta's section header is preserved as `## MODIFIED Requirements` to match the original delta's framing (the requirement REQ-LI-INIT-1 itself was new; no existing requirement was modified in place — this is a `MODIFIED` section in the OpenSpec sense because it changes the module's initialization contract relative to the prior lazy `getLiveKitServerClient()` accessor).

## MODIFIED Requirements

### Requirement: REQ-LI-INIT-1 — LiveKitServerClient is instantiated eagerly at module load

The `LiveKitServerClient` wrapper in `src/infrastructure/livekit/livekit-server.ts` MUST be instantiated eagerly as a module-level constant, NOT lazily on first access. The exported binding MUST be a `const` named `livekitServerClient`, declared and assigned at the top level of the module (e.g. `export const livekitServerClient = new LiveKitServerClient();`), so that the constructor — and therefore the env-var validation inside it — runs at the moment any module imports `livekit-server.ts`.

The previous lazy accessor pattern (`function getLiveKitServerClient() { if (!_instance) _instance = new LiveKitServerClient(); return _instance; }`) MUST be removed. No function-call accessor that wraps the construction MUST remain in the module surface. The `livekitServerClient` export MUST be usable as a value (not a function) at every call site — i.e., `livekitServerClient.createToken(...)` and `livekitServerClient.verifyWebhook(...)` MUST be valid call shapes.

A missing `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, or `NEXT_PUBLIC_LIVEKIT_URL` MUST cause the Next.js server boot to fail with a thrown `Error` whose message identifies which vars are missing and points to `docs/livekit.md` for setup. The failure MUST be observable in the `pnpm dev` boot log within 2 seconds of the import being triggered (typically the first request to the tRPC router or the first server-side import chain). A missing env var MUST NOT surface as a per-request `INTERNAL_SERVER_ERROR` from `getRoomToken` after the server has booted — the boot itself MUST have failed first.

This change is a deliberate trade-off: any page that transitively imports the bookings router (and therefore `livekit-server.ts`) will fail to boot if LiveKit env vars are missing. The pre-change lazy behavior allowed such pages to render and only failed when a user actually clicked "Join call". The eager behavior is preferred because (a) configuration errors surface immediately to the operator instead of three hours later in production, and (b) the same module is now imported once at boot instead of once per request, simplifying reasoning about side effects.

The Vitest unit-test runner (`pnpm test:run`) is unaffected by this change because the existing unit tests do NOT import the LiveKit module (they mock `livekitServerClient` at the test boundary). The E2E test (`pnpm test:e2e -- LIVEKIT_E2E=1`) is gated on `LIVEKIT_E2E=1` and is only run when the operator has intentionally configured the env.

#### Scenario: livekitServerClient is a module-level const, not a function

- GIVEN `src/infrastructure/livekit/livekit-server.ts` after the change
- WHEN the module is parsed
- THEN an `export const livekitServerClient` declaration MUST be present at the top level of the module
- AND `livekitServerClient` MUST be assigned a `new LiveKitServerClient(...)` expression
- AND no `getLiveKitServerClient` function declaration or `export function getLiveKitServerClient` MUST remain in the module

#### Scenario: Call sites use the const directly, not a function accessor

- GIVEN the call sites in `src/infrastructure/api/routers/bookings.ts` (inside `getRoomToken`) and `src/app/api/livekit/webhook/route.ts` (inside the POST handler)
- WHEN the files are inspected
- THEN both MUST reference `livekitServerClient` as a value (e.g. `livekitServerClient.createToken(...)` or `livekitServerClient.verifyWebhook(...)`)
- AND neither MUST call `getLiveKitServerClient()` (the function form)
- AND `pnpm tsc --noEmit` MUST pass with no `getLiveKitServerClient is not a function` or similar errors

#### Scenario: Missing LIVEKIT_API_KEY fails at boot, not per-request

- GIVEN `.env.local` exists but does NOT contain `LIVEKIT_API_KEY`
- WHEN `pnpm dev` is executed
- THEN the boot process MUST terminate (or the first request MUST fail with a non-recoverable error) within 2 seconds
- AND an `Error` whose message contains `"LiveKit env vars missing"` MUST be logged to stderr
- AND the error message MUST name `LIVEKIT_API_KEY` AND `LIVEKIT_API_SECRET`
- AND the message MUST point to `docs/livekit.md` (or the updated `docs/dev-setup.md` per `dev-setup/spec.md`)
- AND no request to `/citas/[id]/llamada` is required to observe the failure — the failure is at import time

#### Scenario: Missing LIVEKIT_API_SECRET fails at boot with the same message shape

- GIVEN `.env.local` has `LIVEKIT_API_KEY=devkey` but is missing `LIVEKIT_API_SECRET`
- WHEN `pnpm dev` is executed
- THEN the boot MUST fail with an `Error` whose message contains `"LiveKit env vars missing"`
- AND the message MUST name `LIVEKIT_API_SECRET` so the operator can fix the specific missing var

#### Scenario: Present vars produce a single shared instance

- GIVEN both `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set to `devkey` / `secret`
- WHEN `livekit-server.ts` is imported once at boot
- THEN `livekitServerClient` MUST be assigned exactly once (the `const` initializer runs once)
- AND a second import of the module MUST return the same `livekitServerClient` reference (Node module cache guarantees this; the test verifies identity via `===`)
- AND the existing boot-time validation scenarios from `livekit-infrastructure/spec.md` (the "Boot-Time Env Validation" requirement — "present vars instantiate the singleton") MUST continue to pass

#### Scenario: Unset LIVEKIT_API_KEY surfaces in <2 seconds without a livekit call

- GIVEN `LIVEKIT_API_KEY` is unset
- WHEN the operator runs `pnpm dev` and observes the terminal
- THEN the error message MUST appear in the terminal within 2 seconds of `next dev` starting
- AND no browser navigation, no `getRoomToken` call, and no user action is required to trigger the error
- AND the operator can `Ctrl+C` immediately and fix `.env.local` without waiting for a request to fail

