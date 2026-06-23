# LiveKit Infrastructure Specification

## Purpose

Define the runtime surface for the self-hosted LiveKit SFU that powers the video calls. The platform runs LiveKit in Docker (not LiveKit Cloud) to keep consultation traffic in-house. This spec covers the Docker service definition, the environment variables, the dev-mode API key/secret pair, the no-TLS exemption for `localhost`, the boot-time validation of env vars, and the dev documentation. It does NOT cover the call page UI (see `video-calls-ui`) or the procedure (see `video-calls-api`).

## Requirements

### Requirement: Docker Service Definition

The `docker-compose.yml` at the project root MUST include a `livekit` service with the following exact configuration:

```yaml
livekit:
  image: livekit/livekit-server:latest
  container_name: medico-livekit
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

The image MUST be `livekit/livekit-server:latest` (rolling tag — pinned in production via the image digest, out of MVP scope). The `container_name` MUST be `medico-livekit` for predictable scripts (`docker logs medico-livekit`). The `restart: unless-stopped` policy keeps the dev experience frictionless across `docker compose down / up` cycles. The `command: --dev --bind 0.0.0.0` flag enables permissive dev defaults and binds the signaling port to all interfaces (required for cross-platform Docker networking).

The three ports are non-negotiable: 7880 is HTTP signaling, 7881 is WebRTC over TCP (the TURN-over-TCP fallback), 7882/udp is WebRTC over UDP (the primary media path). Missing any of them breaks the call.

The healthcheck MUST call `wget -qO- http://localhost:7880/` every 10 seconds with 5 retries. A `wget` probe is preferred over `curl` because `wget` is in the LiveKit container's base image.

#### Scenario: livekit service is present in docker-compose

- GIVEN `docker-compose.yml` at the project root
- WHEN the file is parsed
- THEN a `livekit` service MUST be defined
- AND its `image` MUST start with `livekit/livekit-server`
- AND its `container_name` MUST be `medico-livekit`

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
- AND `docker ps` MUST show `medico-livekit` in the list
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

Production deployment MUST override this env var to `wss://<your-livekit-host>` with a real certificate. Production override is out of scope for this change but MUST be documented in `docs/livekit.md`.

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
