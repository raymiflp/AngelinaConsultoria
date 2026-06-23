# LiveKit (self-hosted video calls)

> Looking for dev setup? See [dev-setup.md](./dev-setup.md) for the linear sequence from clone to two tabs in a call.

The angelina-consultoria platform runs its own LiveKit SFU in Docker so that
consultation audio/video never leaves the platform's infrastructure.

This doc is a short setup guide for local development. Production deployment
(`wss://` + a real TLS certificate + a public TURN server) is out of MVP
scope and is tracked separately as the `livekit-tls-prod` and
`livekit-turn-prod` future changes.

## 1. Starting LiveKit locally

```bash
docker compose up -d livekit
```

The container is named `angelina-livekit`. Verify it is up:

```bash
docker ps --filter name=angelina-livekit
curl -sS http://localhost:7880
```

A running container returns a LiveKit server identification response on
`http://localhost:7880/`.

## 2. Dev API key and secret are `devkey` / `secret`

`livekit-server --dev` requires a specific pair: **`devkey`** as the API
key and **`secret`** as the API secret. This is the documented default in
the [LiveKit repository](https://github.com/livekit/livekit) and is
hard-coded into the `--dev` mode. Using any other pair (e.g. `devsecret`)
makes the container refuse to issue tokens with a confusing "invalid api
key" error.

The `.env.example` carries placeholders (`changeme` / `changeme-in-prod`)
to discourage committing real-looking secrets. The `.env.local.example`
carries the real dev values.

## 3. `.env.local` snippet

The three LiveKit env vars must be in `.env.local` (git-ignored) with the
real dev values:

```bash
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```

If any of `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` is missing when the
Next.js server boots, the `LiveKitServerClient` module throws a clear
error pointing back to this file:

> `LiveKit env vars missing. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local. See docs/livekit.md for setup.`

The check is eager (at module load) — not per-request — so a missing var
surfaces in the boot log instead of on the first user's first call.

## 4. Production requires `wss://` + a real certificate

The dev container has no TLS. `ws://localhost:7880` works because
`localhost` is exempt from the browser's secure-context rule for WebRTC.

Production deployment MUST override `NEXT_PUBLIC_LIVEKIT_URL` to
`wss://<your-livekit-host>` and front the LiveKit container with a real
certificate (e.g. Caddy / Traefik / nginx). This is tracked as the
`livekit-tls-prod` future change.

Additionally, a production deployment needs a real TURN server (coturn or
similar) so WebRTC works for users on networks that block UDP. This is
tracked as the `livekit-turn-prod` future change.

If a developer tunnels the Next.js port via `ngrok` and visits the app
from `https://<subdomain>.ngrok.io`, the browser will raise a
secure-context error when the call page tries to connect to
`ws://localhost:7880`. The dev experience is unaffected for anyone using
`http://localhost:3000` directly.

## 5. Webhooks (auto-complete on `room_finished`)

> **Production deployment**: For production deployment with TLS termination, cert automation, and Caddy reverse proxy, see [`livekit-prod.md`](./livekit-prod.md). This file is focused on local development.

The self-hosted LiveKit container is configured to fire a `room_finished`
webhook to the Next.js app when both participants leave a call. The
handler at `POST /api/livekit/webhook` (Next.js App Router route handler,
NOT a tRPC procedure — the trust boundary sits outside the tRPC schema)
verifies the JWT signature, dedupes by `event.id` in Redis, and
auto-completes the cita end-to-end. **D10 from the video-calls change is
RESOLVED.**

### 5.1 Config block

The container reads `docker/dev/livekit.yaml` (mounted at
`/etc/livekit.yaml`, started with `--config /etc/livekit.yaml`). The
relevant block:

```yaml
webhook:
  api_key: devkey
  urls:
    - ${LIVEKIT_WEBHOOK_URL:-http://host.docker.internal:3000/api/livekit/webhook}
keys:
  devkey: c2VjcmV0
```

`api_key: devkey` MUST match `LIVEKIT_API_KEY` (otherwise every webhook
is a 401). `keys.devkey: c2VjcmV0` is the base64-encoded form of the
literal `secret` (the dev API secret). The `devkey: <secret>` shorthand
only works under `--dev` WITHOUT `--config`; once `--config` is added
(as it is in `docker-compose.yml`), the base64 form is required by
LiveKit's config schema.

### 5.2 The `--config` flag

`docker-compose.yml` runs the container with:

```yaml
command: --dev --bind 0.0.0.0 --config /etc/livekit.yaml
```

`--dev` is preserved (permissive defaults, no cert requirements).
`--config /etc/livekit.yaml` is REQUIRED to enable the `webhook:` block —
without it, the mounted file is ignored.

### 5.3 `host.docker.internal` cross-platform

The default `LIVEKIT_WEBHOOK_URL` is
`http://host.docker.internal:3000/api/livekit/webhook`. Mac and Windows
Docker Desktop resolve `host.docker.internal` natively; Linux does not.

`docker-compose.yml` adds an unconditional `extra_hosts` entry so the
container can reach the Next.js dev server on every platform:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

The entry is harmless on Mac/Windows (the host resolves the same way)
and required on Linux (R8). If you run `next dev --port <other>`, set
`LIVEKIT_WEBHOOK_URL=http://host.docker.internal:<port>/api/livekit/webhook`
in `.env.local` and restart `docker compose up -d livekit`.

### 5.4 Audit log side-effect

When the webhook handler verifies a fresh `room_finished` event for an
`ONLINE` cita in `EN_CURSO`, it:

1. Atomically transitions `citas.estado` to `COMPLETADA` (≥1 participant
   joined) or `NO_ASISTIO` (nobody joined). The transition uses an
   optimistic `UPDATE ... WHERE estado = 'EN_CURSO'` — a race lost (the
   doctor beat the webhook) is a safe no-op.
2. Writes one `audit_logs` row with `usuarioId: null` (system actor —
   the LiveKit server is not a human user), `accion:
   'CITA_AUTO_COMPLETED_BY_WEBHOOK'`, and `detalles: { eventId,
   roomName, participantCount, finalState }`.

The `0005` Drizzle migration makes `audit_logs.usuario_id` nullable so
system-actor rows can be written. The down migration (documented in
`src/infrastructure/db/migrations/0005_*.sql`) reverts the column to
`NOT NULL` and fails if any null rows exist.
