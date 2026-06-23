# Delta for LiveKit Infrastructure

## LIVEKIT WEBHOOKS ADDITIONS (2026-06-19)

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
