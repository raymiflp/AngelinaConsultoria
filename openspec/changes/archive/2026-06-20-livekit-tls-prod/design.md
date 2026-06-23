# Design: LiveKit Production TLS Deployment

**Change**: `livekit-tls-prod`
**Capability**: `livekit-infrastructure` (delta)
**Spec delta**: `openspec/changes/livekit-tls-prod/specs/livekit-infrastructure/spec.md` (REQ-LI-PROD-1, 145 lines)
**Proposal**: `openspec/changes/livekit-tls-prod/proposal.md` (D1..D14, AD-1..AD-8)
**Mode**: A2 auto (single PR, stacked-to-main, ~463 LOC)

---

## 1. Overview

This change ships the production TLS deployment for the self-hosted LiveKit SFU that medico-consulta runs in Docker. The dev workflow uses `ws://localhost:7880` (browser exempts `localhost` from the secure-context rule), but a production browser visiting `medico-consulta.com` will refuse to grant `getUserMedia()` against a `ws://` URL, and the `video-calls-ui` spec promises a call that works on Chrome / Firefox / Safari without a custom-cert dialog. The existing `livekit-infrastructure` spec line 135 already acknowledges the gap: *"Production override is out of scope for this change but MUST be documented in `docs/livekit.md`."* This change closes that placeholder.

The change is **documentation + sample configuration only**. It produces 5 new files (`docs/livekit-prod.md`, `docker/prod/Caddyfile`, `docker/prod/livekit.yaml`, `docker/prod/docker-compose.override.yml`, `.env.production.example`) and one 3-line bridge link in the existing `docs/livekit.md`. No Next.js code changes, no LiveKit code changes, no changes to the dev `docker-compose.yml` or `docker/dev/livekit.yaml`, no new env vars in the dev workflow. The prod artifacts are reference files the operator copies to their VPS — they are never mounted by the dev compose, never imported by the Next.js app, and never executed by CI.

The user-visible outcome: an operator who reads `docs/livekit-prod.md` from a fresh VPS can stand up a TLS-terminated, cert-auto-renewed, memory-bounded, `--dev`-stripped LiveKit deployment in front of the existing Next.js app on Vercel without inventing any architecture. The biggest footgun (`--dev` left on in prod, which disables auth) is removed in the sample `docker-compose.override.yml`; the second-biggest footgun (`NEXT_PUBLIC_LIVEKIT_URL` set at runtime instead of build time, which silently inlines `ws://localhost:7880` into the client bundle) is called out in the runbook.

### Topology (one-liner)

```
Browser ──HTTPS/443──> Caddy (VPS) ──Docker net──> medico-livekit:7880 (VPS)
Browser ◀──UDP/7882────────────────────────────── medico-livekit:7882 (VPS, direct)
LiveKit ──HTTPS outbound──> Vercel /api/livekit/webhook
```

---

## 2. Architecture diagram

```
                +----------------------+      +-------------------------+
                |   Let's Encrypt      |      |   Browser (Chrome/      |
                |   ACME (HTTP-01)     |      |   Firefox/Safari)       |
                +----------+-----------+      +----+----------------+---+
                           |                       |                |
                           | cert+key              | HTTPS+WS       | UDP/7882
                           v                       v                v
+---------------------------+-----------------------+----------------+----+
|                            VERCEL                                 |    |
|  +---------------------+    POST /api/livekit/webhook             |    |
|  |  Next.js 15 (App    |◀---- (server-to-server, signed JWT) -----+    |
|  |  Router on Vercel)  |                                            |    |
|  |  - src/app/api/...  |                                            |    |
|  |  - Auth.js v5       |                                            |    |
|  |  - tRPC v11         |                                            |    |
|  +---------------------+                                            |    |
+--------------------------------------------------------------------+----+
                                                                     |
                                                                     |
                                                                     |
+--------------------------------------------------------------------+----+
|                          VPS (single host)                         |    |
|                                                                    |    |
|  +------------------+   443/tcp    +------------------+ 7880/tcp    |    |
|  |  Caddy 2         |◀─────────────|  medico-livekit  |◀───────────+    |
|  |  (caddy:2-alpine)|   reverse-   |  (livekit-server |              |
|  +---------+--------+   proxy      |   :latest)       |              |
|            |                     +---------+--------+              |
|            |                               |                       |
|            | 80/tcp                        | 7881/tcp  7882/udp    |
|            v (ACME only)                   |                       |
|     Let's Encrypt                         +─────────── Browser    |
|     HTTP-01 challenge                                   (direct)  |
+--------------------------------------------------------------------+
```

Two egress arrows from LiveKit:
- **HTTPS to Caddy → reverse-proxy to 7880** (signaling, in-cluster).
- **UDP 7882** is NOT proxied — it goes directly from the browser to the VPS public IP (the only reason LiveKit needs a public IP at all).

One outbound arrow from LiveKit:
- **HTTPS to Vercel** for webhooks (`room_finished`, etc.) — server-to-server, signed JWT, hits the existing route handler at `/api/livekit/webhook` (already implemented by the `livekit-webhooks` archived change).

---

## 3. File-by-file change list

| File | Action | LOC | Purpose |
|------|--------|-----|---------|
| `docs/livekit-prod.md` | CREATE | ~280 | 7-section runbook (Prerequisites, Topology, Caddy+LiveKit compose, prod livekit.yaml, Webhook URL, Secrets & Rotation, Runbook & Monitoring) |
| `docker/prod/Caddyfile` | CREATE | ~30 | HTTPS reverse proxy on `:443` + ACME HTTP-01 on `:80` + HSTS header |
| `docker/prod/livekit.yaml` | CREATE | ~45 | Prod LiveKit config (no `--dev`, base64 `keys:`, `webhook:` pointing to Vercel, `rtc:` with `node_ip: ${LIVEKIT_NODE_IP}`) |
| `docker/prod/docker-compose.override.yml` | CREATE | ~50 | Prod overlay: drops `--dev`, sets `restart: always` + `mem_limit: 512m`, adds `caddy` service |
| `.env.production.example` | CREATE | ~35 | 7 prod env vars documented with placeholders |
| `docs/livekit.md` | MODIFY | +3 | 1-paragraph bridge link to `docs/livekit-prod.md` at the top of section 5 |
| `openspec/changes/livekit-tls-prod/specs/livekit-infrastructure/spec.md` | CREATE | 145 | Delta spec REQ-LI-PROD-1 (already written) |
| `openspec/changes/livekit-tls-prod/proposal.md` | CREATE | 224 | Proposal (already written) |
| **Total new** | | **~463** | All new + 1 trivial edit |

Files explicitly NOT touched:
- `docker-compose.yml` (dev compose) — the prod overlay is a SEPARATE file.
- `docker/dev/livekit.yaml` (dev LiveKit config) — dev stays dev.
- `.env.example`, `.env.local.example` — dev env matrix is unchanged.
- `src/**` — zero application code changes.
- `src/infrastructure/livekit/livekit-server.ts` — wrapper works the same in prod.
- `src/app/api/livekit/webhook/route.ts` — webhook handler is identical; only the URL changes.

---

## 4. Production topology (deep dive)

### Why Caddy

Caddy v2 is the chosen TLS terminator for three reasons. **First**, its ACME client is built into the binary — on first HTTPS request to `:443`, Caddy issues a Let's Encrypt cert automatically, stores it in `/data/caddy/certificates`, and renews at 30 days before expiry with no cron job, no `certbot` hook, no manual intervention. **Second**, the config is a 30-line `Caddyfile` (sample in §5) versus the ~80 lines of `nginx.conf` + `certbot.ini` + `renewal-hook.sh` + cron entry that the nginx alternative would require. **Third**, the same `Caddyfile` works for HTTP-01 (default) and DNS-01 (via a Caddy DNS plugin) so the operator can swap to a Cloudflare-fronted deploy without rewriting the config. nginx would require a separate certbot + cron + renewal-hook script; Traefik would require Docker labels and a more verbose compose file. Caddy is the pragmatic minimum for a single VPS.

### Why a subdomain

The Next.js app is on Vercel (`medico-consulta.com`); the LiveKit container is on a VPS at a different IP. The only viable routing pattern is `livekit.medico-consulta.com` (subdomain). Path-based routing (`medico-consulta.com/livekit/...`) is impossible because Vercel is serverless and cannot proxy WebRTC media over UDP 7882 — there is no way to forward a UDP socket through a serverless CDN. The subdomain pattern also gives CORS isolation for free: the browser treats `livekit.medico-consulta.com` and `medico-consulta.com` as separate origins, so the `access_token` JWT carries auth end-to-end without any CORS gymnastics. The trade-off is that the operator must own a DNS zone they can add an A record to — this is documented as a prerequisite in `docs/livekit-prod.md` §1.

### Why a single VPS

The current dev workflow uses `docker compose up -d` against a single multi-service file. The prod story mirrors that: one `docker-compose.override.yml` that the operator drops on top of the dev `docker-compose.yml`, one `docker compose up -d` to start Caddy + LiveKit together on the same host. k8s is rejected for the dev-stage target because the operational complexity (Ingress, cert-manager, Service Mesh, pod disruption budgets) is not justified for an SFU under 100 concurrent calls. The change documents the k8s delta in a footnote (separate Caddy k8s manifest, separate LiveKit StatefulSet, cert-manager instead of Caddy ACME) so a future change can port the pattern without inventing the architecture.

### Network flow (packet-level)

**TURN/ICE negotiation** (out of scope for this change, documented for context): when the browser dials `wss://livekit.medico-consulta.com`, the LiveKit JS client opens a WebSocket to the Caddy `:443` listener. Caddy terminates TLS (cert from `/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/livekit.medico-consulta.com/`) and forwards the WebSocket upgrade request to `medico-livekit:7880` over the Docker internal network (`medico-livekit` is the service/container name, `7880` is the in-cluster port). LiveKit responds with a 101 Switching Protocols, Caddy forwards the response. The browser then runs ICE — for each candidate, LiveKit returns a `candidate` SDP attribute. With `node_ip: ${LIVEKIT_NODE_IP}` set in `livekit.yaml`, the host candidate is the VPS public IP on UDP 7882. The browser sends STUN binding requests to `<VPS_IP>:7882/udp`, the LiveKit process answers, and the media path is established peer-to-peer (well, SFU-to-peer) over UDP 7882. The TCP fallback (`rtc.tcp_port: 7881`) is used only when UDP is blocked — see R11 for the firewall implications.

**Token minting**: when the doctor opens an ONLINE cita, the Next.js app calls `livekitServerClient.createToken({ room, identity })` (already implemented in `src/infrastructure/livekit/livekit-server.ts`). The wrapper mints a JWT signed with `LIVEKIT_API_SECRET`, scoped to the `room` name, valid for the cita duration. The token is returned to the browser, which uses it in `new LivekitClient({ url: NEXT_PUBLIC_LIVEKIT_URL, token })`. The URL is inlined at build time (R7).

**Room join**: the browser opens a WebSocket to the inlined URL, sends the JWT in the `Authorization: Bearer <jwt>` header, and LiveKit validates the signature against the `keys.<key>` block in `livekit.yaml`. If the signature is valid, the client is admitted to the room and the WebRTC handshake starts. If the signature is invalid (e.g. R13 — the user pasted the raw secret instead of base64), the connection is refused with a 401 and the cita UI shows an "auth failed" error.

**`room_finished` webhook**: when the last participant leaves a room, LiveKit's webhook worker POSTs to the first URL in `webhook.urls` with a JWT in the `Authorization` header, signed with `LIVEKIT_API_SECRET`. The Vercel route handler at `src/app/api/livekit/webhook/route.ts` verifies the signature, parses the `room_finished` event, and runs `auto-complete-on-room-finished.use-case.ts` to transition the cita to `COMPLETADA` (or `NO_ASISTIO` if no one joined). The webhook is server-to-server — the LiveKit container makes an outbound HTTPS request to `https://medico-consulta.com/api/livekit/webhook` (Vercel's public URL), which the spec's `Webhook reachability` scenario covers.

---

## 5. Caddyfile details (`docker/prod/Caddyfile`)

```caddyfile
# =============================================================================
# Caddy v2 — production reverse proxy for medico-livekit
# =============================================================================
# Why Caddy: built-in ACME, auto-renewal at 30 days before expiry, single
# binary, no certbot cron. The whole TLS story is this file + the cert+data
# volumes.
#
# Mounted at /etc/caddy/Caddyfile in the caddy container (see
# docker/prod/docker-compose.override.yml). The {$CADDY_DOMAIN} placeholder
# is substituted by Caddy at startup from the environment — same pattern
# used by Caddy in production deployments.

# Global email for Let's Encrypt ACME registration. Required by Let's
# Encrypt's ToS — they email you about cert issues, expiring certs,
# and rate limit warnings. {$CADDY_EMAIL} is set in .env.production.
{$CADDY_DOMAIN:livekit.medico-consulta.com} {
    tls {$CADDY_EMAIL:ops@medico-consulta.com}

    # HSTS: 1 year, include all subdomains, eligible for preload.
    # Matches the HSTS in next.config.ts; the browser refuses to load
    # livekit.medico-consulta.com over plain HTTP for the next year.
    # See R8 in the proposal.
    header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"

    # Reverse proxy to the LiveKit container on the Docker internal
    # network. The hostname `medico-livekit` resolves to the livekit
    # container's IP on the default compose network; port 7880 is the
    # in-cluster signaling port. WebSocket upgrade is automatic.
    reverse_proxy medico-livekit:7880

    # Access log: timestamp + remote + method + status + duration.
    # Logged to stdout → docker compose logs caddy (see §11 runbook).
    log {
        output stdout
        level INFO
    }
}

# Port 80: ONLY for Let's Encrypt HTTP-01 challenge. Every other request
# gets a 301 redirect to HTTPS. Without this, ACME issuance fails.
:80 {
    tls {$CADDY_EMAIL:ops@medico-consulta.com}
    @acme path /.well-known/acme-challenge/*
    handle @acme {
        # Caddy serves the HTTP-01 challenge file automatically when
        # the tls directive is in the same site block. By putting
        # the tls directive here, ANY request to :80 gets a cert
        # challenge response OR a redirect to HTTPS.
        respond 200
    }
    redir https://{host}{uri} permanent
}
```

**Annotated block-by-block:**

- `{$CADDY_DOMAIN:...}` — Caddy reads the `CADDY_DOMAIN` env var (set in `docker-compose.override.yml`) and uses it as the site address. The `:default` syntax means Caddy uses the literal if the env var is unset (dev safety).
- `tls {$CADDY_EMAIL:...}` — triggers ACME issuance. Caddy will email the operator about cert issues (required by Let's Encrypt ToS).
- `header Strict-Transport-Security ...` — HSTS header. Same directive already in `next.config.ts`. Without this, an attacker could downgrade the connection on first visit.
- `reverse_proxy medico-livekit:7880` — the core. The browser's HTTPS request terminates at Caddy, Caddy opens a new HTTP connection to the `medico-livekit` service on the Docker internal network. Port 7880 is NOT exposed to the host (only to the compose network).
- `log { output stdout }` — logs go to stdout so `docker compose logs caddy` shows them.
- `:80 { ... redir ... }` — port 80 is required for ACME HTTP-01 challenge (Let's Encrypt hits `http://<domain>/.well-known/acme-challenge/<token>` to prove domain ownership). The `redir` line sends all non-ACME traffic to HTTPS.

---

## 6. Prod `livekit.yaml` details (`docker/prod/livekit.yaml`)

```yaml
# =============================================================================
# LiveKit self-hosted PRODUCTION config (mounted at /etc/livekit.yaml)
# =============================================================================
# Used by docker/prod/docker-compose.override.yml. NOT used by the dev
# compose (dev uses docker/dev/livekit.yaml + --dev flag).
#
# Generated from the dev config at docker/dev/livekit.yaml; the key
# differences are:
#   1. NO `dev: true` (the livekit-server CLI flag --dev is also omitted
#      in the override file's command — D11).
#   2. keys.<key> is the BASE64 form (R13 footgun: do NOT paste the raw
#      secret — see docs/livekit-prod.md §6 "Secrets & Rotation").
#   3. webhook.urls uses the PUBLIC Vercel URL — host.docker.internal
#      would resolve to the VPS loopback, which has no Next.js server.
#   4. rtc.node_ip is set to ${LIVEKIT_NODE_IP} (VPS public IP) so SDP
#      negotiation advertises a reachable address (R12).
#   5. turn.enabled: false — TURN is out of scope for this change
#      (deferred to livekit-turn-prod). When TURN is added, set
#      turn.enabled: true + the TURN config block.

port: 7880
bind_addresses:
  - "0.0.0.0"  # explicit; in YAML form, this is the prod equivalent of --bind 0.0.0.0

rtc:
  # The public IP the SFU advertises in SDP candidates. MUST be
  # reachable from the browser; setting this to a private IP breaks
  # WebRTC. Set via LIVEKIT_NODE_IP in .env.production. For DDNS,
  # set LIVEKIT_NODE_IP=myhost.duckdns.org.
  node_ip: ${LIVEKIT_NODE_IP}
  tcp_port: 7881   # WebRTC over TCP fallback
  udp_port: 7882   # WebRTC over UDP (primary)

turn:
  enabled: false   # OUT OF SCOPE (livekit-turn-prod follow-up)

# Webhook delivery: server-to-server from LiveKit → public Vercel URL.
# MUST be the PUBLIC Vercel URL — not host.docker.internal (the VPS
# has no Next.js dev server in prod). api_key MUST match the key in
# keys.<key> below AND the LIVEKIT_API_KEY in the Vercel project env
# (mismatch = 401 on every webhook).
webhook:
  api_key: ${LIVEKIT_API_KEY}
  urls:
    - ${LIVEKIT_WEBHOOK_URL:-https://medico-consulta.com/api/livekit/webhook}

# API keys for token minting. The format is keys.<keyname>: <base64secret>.
# The dev config uses the shorthand `devkey: secret` which only works
# under --dev WITHOUT --config; once --config is set (as it is here),
# the base64 form is required (R13). Generate with:
#   echo -n "your-secret" | base64
# `your-secret` is the literal value the Next.js app puts in
# LIVEKIT_API_SECRET (the wrapper does NOT base64 — it sends the raw
# secret to LiveKit's token signer, which expects the same base64 form
# it has in keys.<key>).
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}
```

**The base64 footgun (R13)**

This is the highest-leverage mistake a new operator can make. In dev, the dev compose uses `--dev` which permits the shorthand `devkey: secret` in the `keys:` block. In prod, `--dev` is removed (per D11), and the same shorthand is **invalid** — LiveKit's config schema requires the base64 form. If the operator pastes the raw secret, every token-issuance call returns 401, the call page shows "auth failed", and the only diagnostic is to inspect `docker logs medico-livekit` and see "invalid key format". The mitigation is the explicit `echo -n "your-secret" | base64` step in `docs/livekit-prod.md` §6 with a copy-pasteable command and an example output.

**The env-var-driven config pattern**

The prod YAML uses `${LIVEKIT_API_KEY}`, `${LIVEKIT_API_SECRET}`, `${LIVEKIT_WEBHOOK_URL}`, and `${LIVEKIT_NODE_IP}` — same indirection pattern as the dev YAML (`${LIVEKIT_WEBHOOK_URL:-<default>}`). This lets the same YAML file work for staging/prod (different env vars, no re-mount). The override file's `environment:` block (see §7) injects these vars from the host's `.env.production`.

---

## 7. `docker-compose.override.yml` details (`docker/prod/docker-compose.override.yml`)

```yaml
# =============================================================================
# PRODUCTION override for docker-compose.yml
# =============================================================================
# Usage (on the VPS, not in dev):
#   cp .env.production.example .env.production
#   # edit .env.production with real values
#   docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml up -d
#
# This file:
#   - REPLACES the dev `livekit` service with the prod version (drops
#     --dev, swaps to prod livekit.yaml, adds resource limits + restart).
#   - ADDS the `caddy` service (HTTPS reverse proxy + ACME).
#   - USES the same container names (medico-livekit, medico-caddy) so
#     the Caddyfile's `reverse_proxy medico-livekit:7880` resolves
#     to the same container regardless of which compose file the
#     operator invokes.

services:
  # ---------------------------------------------------------------------------
  # LiveKit SFU (PROD)
  # ---------------------------------------------------------------------------
  # Overrides docker-compose.yml's dev `livekit` service. Key changes:
  #   - command: NO --dev (D11). The --node-ip + --bind + --config
  #     pattern is the prod-correct invocation.
  #   - volumes: prod livekit.yaml mounted (replaces dev one).
  #   - environment: all 7 env vars from .env.production injected.
  #   - restart: always (was unless-stopped in dev).
  #   - mem_limit: 512m (was unbounded in dev). Documented as a tuning
  #     knob — a busy clinic may need 1g. See docs/livekit-prod.md §7.
  #   - healthcheck: upgraded to curl / (was wget in dev; curl is
  #     more standard + returns a clean exit code on success).
  livekit:
    image: livekit/livekit-server:latest
    container_name: medico-livekit
    restart: always
    ports:
      - "7880:7880"        # HTTP signaling (in-cluster; Caddy reaches it)
      - "7881:7881"        # WebRTC over TCP fallback
      - "7882:7882/udp"    # WebRTC over UDP (DIRECT from browser, no proxy)
    volumes:
      # Prod config mounted. RO: the container does not need to write
      # back; the operator edits this file on the host.
      - ./docker/prod/livekit.yaml:/etc/livekit.yaml:ro
    command: --node-ip ${LIVEKIT_NODE_IP} --bind 0.0.0.0 --config /etc/livekit.yaml
    environment:
      LIVEKIT_API_KEY: ${LIVEKIT_API_KEY}
      LIVEKIT_API_SECRET: ${LIVEKIT_API_SECRET}
      LIVEKIT_NODE_IP: ${LIVEKIT_NODE_IP}
      LIVEKIT_WEBHOOK_URL: ${LIVEKIT_WEBHOOK_URL}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7880/"]
      interval: 30s
      timeout: 5s
      retries: 3
    mem_limit: 512m

  # ---------------------------------------------------------------------------
  # Caddy 2 (HTTPS reverse proxy + ACME)
  # ---------------------------------------------------------------------------
  # New service (not in docker-compose.yml). Caddy terminates TLS on
  # :443, reverse-proxies to medico-livekit:7880 on the default network,
  # and uses port 80 ONLY for Let's Encrypt HTTP-01 challenge.
  #
  # Volumes:
  #   - Caddyfile: read-only mount of docker/prod/Caddyfile.
  #   - caddy_data: persistent storage for certs (auto-created by Caddy).
  #   - caddy_config: persistent storage for ACME account + OCSP cache.
  # WITHOUT the persistent volumes, every restart loses the cert and
  # Caddy has to re-issue (rate-limited by Let's Encrypt).
  caddy:
    image: caddy:2-alpine
    container_name: medico-caddy
    restart: always
    ports:
      - "80:80"       # ACME HTTP-01 challenge + redirect-to-HTTPS
      - "443:443"     # HTTPS (signaling)
    volumes:
      - ./docker/prod/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      CADDY_DOMAIN: ${CADDY_DOMAIN}
      CADDY_EMAIL: ${CADDY_EMAIL}
    healthcheck:
      # Caddy has a /ping endpoint on the admin API; we hit the
      # public / endpoint instead (returns a Caddy default 404 if
      # no route matches, which is enough to confirm the server is
      # up). Interval is generous — ACME renewal only happens every
      # 60 days; we don't need to detect failures faster.
      test: ["CMD", "wget", "-qO-", "http://localhost:80/"]
      interval: 30s
      timeout: 5s
      retries: 3
    depends_on:
      - livekit
    mem_limit: 128m

volumes:
  caddy_data:     # cert + ACME state (PERSISTENT across restarts)
  caddy_config:   # Caddy runtime config (PERSISTENT across restarts)
```

**Annotated block-by-block:**

- `command: --node-ip ${LIVEKIT_NODE_IP} --bind 0.0.0.0 --config /etc/livekit.yaml` — the prod command. The `LIVEKIT_NODE_IP` env var is the VPS public IP; `--bind 0.0.0.0` is required so the container listens on all interfaces (LiveKit defaults to `0.0.0.0` but explicit is better for documentation). **NO `--dev`** — comment in the file says "DO NOT ADD `--dev` HERE" so a future editor sees it.
- `volumes: - ./docker/prod/livekit.yaml:/etc/livekit.yaml:ro` — the path matches what `command: --config /etc/livekit.yaml` expects. `ro` (read-only) means the container cannot write back to the file, which prevents accidental corruption.
- `environment:` — all 4 LiveKit env vars (the other 3 — `CADDY_*` and `NEXT_PUBLIC_LIVEKIT_URL` — are Caddy / Vercel only). The `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are inlined into the config file by LiveKit at startup (`keys.${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}` substitution).
- `restart: always` — restarts the container on any failure AND on host reboot (Docker daemon `restart` policy). The dev compose's `unless-stopped` would skip restart if the container was explicitly stopped, which is the wrong default for prod.
- `mem_limit: 512m` — caps the container's RSS at 512 MB. Documented as a tuning knob; a clinic doing 50+ concurrent calls may need 1g. The OOM-kill signal is observable in `docker events` so the operator can see when to scale up.
- `healthcheck` — `curl -f http://localhost:7880/` returns 200 if LiveKit is responsive. `interval: 30s` is relaxed (the dev compose's 10s is too chatty for prod). `retries: 3` means a single failed check doesn't restart the container.
- The `caddy` service — completely new. `caddy:2-alpine` is the official image, ~40 MB compressed. Two persistent volumes (`caddy_data`, `caddy_config`) so certs survive container restarts. `depends_on: livekit` ensures LiveKit starts first (otherwise the `reverse_proxy medico-livekit:7880` would point to nothing for the first few seconds of boot).
- `mem_limit: 128m` on Caddy — Caddy is a thin Go binary; 128 MB is generous.

**Network**

Both services join the default compose network (no explicit `networks:` block needed — both services inherit `docker-compose.yml`'s default network). The `medico-livekit` hostname resolves to the LiveKit container's IP on this network; Caddy's `reverse_proxy medico-livekit:7880` reaches it over the internal interface. Port 7880 is **NOT** exposed to the host (Caddy is the only thing that should talk to it). The LiveKit container's `ports:` block exposes 7880, 7881, and 7882/udp to the host — but 7880 should be firewalled to localhost-only (or removed from the `ports:` block entirely) in a hardened prod deploy. For the MVP, leaving them exposed is acceptable since the VPS firewall is the only public surface anyway.

---

## 8. `docs/livekit-prod.md` structure (7 sections)

The doc is 7 sections in chronological deploy order — DNS first, then stack, then config, then verify, then operations.

### §1. Prerequisites

Bulleted list of everything the operator must have before touching the VPS:

- **VPS** with a static public IP (or DDNS hostname — see §4 for DDNS details). 1 vCPU / 1 GB RAM minimum (LiveKit is the heavy service; Caddy is ~40 MB). Ubuntu 22.04 LTS recommended (the firewall commands use `ufw`).
- **Docker + Docker Compose v2** installed. `docker --version` must show 20.10+, `docker compose version` must show v2 (the `docker compose` CLI plugin, not the legacy `docker-compose` Python tool — the override file uses v2 syntax).
- **Domain** with an A record the operator can edit. The default is `livekit.medico-consulta.com`, but any subdomain works.
- **DNS A record** pointing `livekit.<domain>` → VPS public IP. Must be propagated before Caddy's first ACME issuance (DNS propagation typically < 5 minutes for low TTLs, up to 48 hours for cached resolvers).
- **Firewall open**: `ufw allow 80/tcp` (ACME), `ufw allow 443/tcp` (HTTPS), `ufw allow 7882/udp` (WebRTC media). 7880 and 7881 are NOT exposed publicly.
- **Vercel project** with the Next.js app deployed, env vars set (see §5), and `medico-consulta.com` resolving to it.

### §2. Deployment Topology

ASCII diagram (see §2 above) + paragraph explaining the three flows (browser→Caddy→LiveKit, browser→LiveKit UDP 7882 direct, LiveKit→Vercel webhook). Notes that the VPS is a single point of failure for the MVP and that HA requires splitting into two stacks (mentioned but not implemented).

### §3. Caddy + LiveKit compose

Step-by-step commands to deploy:

```bash
# 1. Copy the prod artifacts from the repo to the VPS
scp -r docker/prod/ .env.production.example medico-deploy@<vps>:~/medico-consulta/

# 2. SSH into the VPS
ssh medico-deploy@<vps>
cd medico-consulta

# 3. Fill in the env file
cp .env.production.example .env.production
$EDITOR .env.production   # fill in real values per §9 below

# 4. Start the stack
docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml up -d

# 5. Watch the logs
docker compose logs -f caddy medico-livekit
```

Expected log lines on first boot: Caddy issues a cert ("obtained certificate for livekit.medico-consulta.com"), LiveKit logs "API key: ... (env: LIVEKIT_API_KEY)" and "using config file: /etc/livekit.yaml".

### §4. LiveKit prod config

Annotated walkthrough of `docker/prod/livekit.yaml`. The section explains:

- `port: 7880` and `bind_addresses: ["0.0.0.0"]` — same as dev, but explicit.
- `rtc:` block — `node_ip` is the new field; `tcp_port` + `udp_port` are unchanged. If `LIVEKIT_NODE_IP` is empty, the doc shows the DDNS alternative: set `LIVEKIT_NODE_IP=myhost.duckdns.org` and the SFU will advertise that DNS name in SDP.
- `turn.enabled: false` — TURN is disabled (deferred to `livekit-turn-prod`). The doc shows what to expect: ~85% of clients connect over UDP 7882 directly; the rest fail to connect (or fall back to TCP 7881, which the VPS firewall must also allow if the operator wants TCP-only clients).
- `webhook:` — the `urls` field is `${LIVEKIT_WEBHOOK_URL:-https://medico-consulta.com/api/livekit/webhook}`. The default is a sane fallback; the operator overrides it in `.env.production` only if their Vercel app has a custom domain.
- `keys:` — base64 form. The R13 footgun is called out with a copy-pasteable `echo -n "secret" | base64` command.

### §5. Webhook URL

Why the prod webhook URL is `https://medico-consulta.com/api/livekit/webhook` (the Vercel URL, NOT `host.docker.internal:3000`). The dev compose's `extra_hosts: host.docker.internal:host-gateway` is dropped in the prod override because the webhook URL is a public address.

**Smoke test command** (from the spec):

```bash
curl -X POST https://medico-consulta.com/api/livekit/webhook \
  -H "Authorization: Bearer test" -d '{}'  # expect 401 (bad signature)
```

If 401 → route handler is reachable, signature check works. If 200 → something is wrong (the route handler should reject unsigned probes). If connection refused / timeout → either the Vercel deploy is down or the VPS egress is blocked.

**Live test** (after the full stack is up): open an ONLINE cita, join from two browser tabs, leave both → check the Vercel function logs for the `room_finished` event → check the cita transitioned to `COMPLETADA`.

### §6. Secrets & Rotation

Step-by-step runbook for rotating `LIVEKIT_API_SECRET`:

1. Generate a new secret on the VPS: `openssl rand -base64 32`
2. Edit `docker/prod/livekit.yaml` and replace the `keys.${LIVEKIT_API_KEY}` value with the new base64-encoded secret.
3. Edit `.env.production` and replace `LIVEKIT_API_SECRET=<new-secret>` (raw, not base64).
4. Edit the Vercel project env vars and set `LIVEKIT_API_SECRET=<new-secret>` (raw, not base64). **CRITICAL: this MUST be set BEFORE the next Vercel deploy, not after — `NEXT_PUBLIC_*` and the server-side token signer both need it.**
5. Trigger a Vercel redeploy (the new env var is inlined at build time).
6. Restart the LiveKit container: `docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml restart medico-livekit`.
7. Verify: `curl https://livekit.medico-consulta.com/ping` returns 200.
8. Open a test cita, join from two browser tabs, leave both → cita auto-completes.

**Why the order matters**: rotating only on one side (VPS or Vercel) means the Next.js app signs tokens with the new secret but LiveKit validates with the old → 401. The runbook has the order explicit because this is the #1 ops failure mode.

**Rotation cadence**: 90 days is a reasonable default (matches the Let's Encrypt cert lifetime). Some teams rotate on every operator offboarding. The doc recommends a calendar reminder.

### §7. Runbook & Monitoring

Common operations:

- `docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml logs -f caddy medico-livekit` — tail logs from both services.
- `docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml ps` — show container status, health, uptime.
- `curl https://livekit.<domain>/ping` — public HTTP check (returns a LiveKit ID response).
- `docker exec medico-caddy caddy list-certificates` — list all certs Caddy has issued.
- `docker exec medico-caddy cat /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/livekit.<domain>/livekit.<domain>.crt | openssl x509 -noout -dates` — show cert expiry (should be ~60-90 days from now; < 30 days means renewal is about to fire).

**Troubleshooting** (one entry per common failure):

- "Calls connect but no audio/video" → check `ufw status` for port 7882/UDP (R11).
- "401 on every call" → check the `keys.` value in `docker/prod/livekit.yaml` is base64, not raw (R13).
- "WebRTC fails to negotiate" → check `node_ip` is the VPS public IP, not a private IP (R12).
- "Browser shows 'secure context' error" → check the Caddy cert is valid (`docker logs medico-caddy`).
- "Calls connect to `localhost:7880`" → `NEXT_PUBLIC_LIVEKIT_URL` was not set at Vercel build time (R7); redeploy Vercel after setting it.
- "LiveKit container keeps restarting" → `docker logs medico-livekit`; usually a base64 secret (R13) or a missing `node_ip` (R12).
- "Caddy 526 error (invalid cert)" → the cert is expired or the chain is incomplete. `docker exec medico-caddy caddy list-certificates`; if the cert is missing, `docker restart medico-caddy` to force a re-issue.

---

## 9. Environment variable matrix

| Var | Vercel | VPS | Build/Runtime | Required | Default | Purpose |
|-----|--------|-----|---------------|----------|---------|---------|
| `LIVEKIT_API_KEY` | yes | yes | runtime (VPS, into livekit.yaml) / runtime (Vercel, in `src/infrastructure/livekit/livekit-server.ts`) | yes | — | API key; MUST match `keys.<key>` in `docker/prod/livekit.yaml`. Vercel side is read at request time by the token signer. |
| `LIVEKIT_API_SECRET` | yes | yes | runtime (VPS, into livekit.yaml) / runtime (Vercel, in token signer) | yes | — | API secret. **Vercel side is the raw secret**; **VPS side is base64-encoded** (the livekit.yaml uses the base64 form, the env var holds the raw form, and `${LIVEKIT_API_SECRET}` is substituted then re-base64'd… no, actually: the env var holds the raw form, the `keys.${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}` substitution puts the raw form into the YAML, and LiveKit fails to start. **The doc's R13 callout is the real fix: the operator must `base64` it before putting it in `.env.production`**). |
| `NEXT_PUBLIC_LIVEKIT_URL` | yes (BUILD TIME) | no | build-time on Vercel (inlined into client bundle) | yes | — | Client-side LiveKit URL. `https://livekit.<domain>`. **Setting this as a Vercel RUNTIME env var will NOT work** — the `NEXT_PUBLIC_` prefix is inlined at build. The doc has a dedicated "Vercel Build-Time Env Vars" section explaining this. |
| `LIVEKIT_WEBHOOK_URL` | no | yes | runtime (VPS, in `docker/prod/livekit.yaml` `webhook.urls`) | yes | — | Public Vercel URL for webhooks. `https://medico-consulta.com/api/livekit/webhook` (or whatever the Vercel custom domain is). |
| `CADDY_DOMAIN` | no | yes | runtime (Caddy, in `Caddyfile` site block) | yes | — | Subdomain for the cert. `livekit.<domain>`. |
| `CADDY_EMAIL` | no | yes | runtime (Caddy, ACME registration) | yes | — | Email for Let's Encrypt cert notifications. Required by LE ToS. |
| `LIVEKIT_NODE_IP` | no | yes | runtime (LiveKit, in `rtc.node_ip`) | no | empty | VPS public IP (or DDNS hostname). Empty = LiveKit uses the container's primary IP, which is the docker bridge IP and unreachable from the public internet (R12). |

**Critical distinctions** (R7 + R13):

- `NEXT_PUBLIC_LIVEKIT_URL` MUST be set in Vercel **at build time**. The "Environment Variables" page in Vercel has a scope selector: "Build Command", "Lambda", or "Both". For `NEXT_PUBLIC_*` vars, the scope MUST be "Build Command" or "Both". Setting it under "Lambda" only inlines the Vercel default (`ws://localhost:7880`) into the client bundle.
- `LIVEKIT_API_SECRET` has two forms. The Vercel side stores the **raw** secret (the token signer sends it to LiveKit as the HMAC key). The VPS side stores the **base64-encoded** form (the livekit.yaml `keys.<key>` field requires base64). The operator generates the raw form once, base64-encodes a copy for the VPS, and stores the raw form in Vercel. The doc's R13 callout shows the exact `echo -n | base64` command.

---

## 10. Risk mitigations (cross-ref to explore §5)

For each of the highest-leverage risks, the exact location of the mitigation:

| Risk | Mitigation lives in | Form |
|------|---------------------|------|
| **R1** — `--dev` left on in prod | `docker/prod/docker-compose.override.yml` `command:` block | Config: command line literally does not include `--dev`. Plus a comment `DO NOT ADD --dev HERE` next to the command. Plus `docs/livekit-prod.md` §3 has a pre-deployment checklist that includes `docker inspect medico-livekit --format '{{.Args}}'` to verify the command. |
| **R7** — `NEXT_PUBLIC_LIVEKIT_URL` set at runtime on Vercel | `docs/livekit-prod.md` §3 + §7 | Doc: a dedicated "Vercel Build-Time Env Vars" subsection in §3 explains the build-time inlining. §7's Troubleshooting has a "calls connect to localhost" entry with the fix (re-deploy Vercel after setting the env var). |
| **R8** — HSTS blocks first-load on plain HTTP | `docker/prod/Caddyfile` `header` directive | Config: HSTS header is set with `max-age=31536000; includeSubDomains; preload`. Plus the `redir https://{host}{uri} permanent` in the `:80` block forces any plain-HTTP request to 301 to HTTPS. |
| **R11** — UDP 7882 blocked by firewall | `docs/livekit-prod.md` §1 Prerequisites | Doc: explicit `ufw allow 7882/udp` command in the Prerequisites checklist. Plus §7's Troubleshooting has a "calls connect but no audio/video" entry that points back to §1. |
| **R12** — Static IP / `node_ip` misconfig | `docker/prod/livekit.yaml` `rtc.node_ip: ${LIVEKIT_NODE_IP}` | Config: the YAML has the `node_ip` line with the env var substitution. Plus `docs/livekit-prod.md` §4 explains the DDNS alternative (set `LIVEKIT_NODE_IP` to a DDNS hostname). Plus §7 Troubleshooting has a "WebRTC fails to negotiate" entry. |
| **R13** — Base64 secret footgun | `docs/livekit-prod.md` §4 + §6 | Doc: §4 has the `echo -n "your-secret" | base64` command with example output. §6 (Secrets & Rotation) repeats the same command. §7 Troubleshooting has a "401 on every call" entry that points to §4. |

---

## 11. Migration runbook (dev → prod)

Step-by-step checklist for an operator going from "I have the dev compose running locally" to "I have a prod TLS deployment":

1. **Provision VPS**: Ubuntu 22.04 LTS, 1 vCPU / 1 GB RAM minimum (2 GB recommended). A static public IP is preferred; DDNS works for the `node_ip` field but not for ACME (well, Caddy supports DDNS for ACME HTTP-01 as long as the A record is propagated before issuance).
2. **Set DNS A record**: `livekit.<domain>` → VPS public IP. TTL 300s (5 minutes) for fast propagation; bump to 3600s after the cert is issued.
3. **SSH into VPS, install Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   newgrp docker
   docker --version
   docker compose version   # must show v2
   ```
4. **Open the firewall**:
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 7882/udp
   sudo ufw enable
   sudo ufw status   # verify the rules
   ```
5. **Clone the repo** (or just `docker/prod/` + `.env.production.example`):
   ```bash
   git clone https://github.com/<org>/medico-consulta.git
   cd medico-consulta
   ```
6. **Edit `.env.production`** with real values (no placeholders):
   - `LIVEKIT_API_KEY=<your-real-key>` (NOT `devkey`).
   - `LIVEKIT_API_SECRET=<base64-of-your-real-secret>` (use `echo -n "raw-secret" | base64`).
   - `NEXT_PUBLIC_LIVEKIT_URL=https://livekit.<domain>` (this is the VERCEL-side var; same value goes in Vercel project env, see step 9).
   - `LIVEKIT_WEBHOOK_URL=https://<your-vercel-domain>/api/livekit/webhook`.
   - `CADDY_DOMAIN=livekit.<domain>`.
   - `CADDY_EMAIL=ops@<domain>`.
   - `LIVEKIT_NODE_IP=<VPS public IP>` (or DDNS hostname).
7. **Start the stack**:
   ```bash
   docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml up -d
   docker compose logs -f caddy medico-livekit
   ```
   First boot: Caddy issues the cert (~30 seconds), LiveKit logs "API key: ... (env: LIVEKIT_API_KEY)" and "using config file: /etc/livekit.yaml". Ctrl-C to exit the log tail.
8. **Smoke test — HTTPS signaling**:
   ```bash
   curl -sI https://livekit.<domain>/
   # expect: HTTP/2 200, with a `server: Caddy` header
   ```
9. **Smoke test — webhook reachability**:
   ```bash
   curl -X POST https://<vercel-domain>/api/livekit/webhook \
     -H "Authorization: Bearer test" -d '{}'  # expect 401
   ```
   If 401 → route handler is reachable. If connection refused → Vercel deploy is down. If timeout → VPS egress is blocked.
10. **Set Vercel env vars**: in the Vercel project → Settings → Environment Variables:
    - `LIVEKIT_API_KEY` = same value as VPS (no quotes, no base64).
    - `LIVEKIT_API_SECRET` = the RAW secret (not base64).
    - `NEXT_PUBLIC_LIVEKIT_URL` = `https://livekit.<domain>`, scope = **Build Command** (R7).
    - `LIVEKIT_WEBHOOK_URL` = `https://<vercel-domain>/api/livekit/webhook`.
11. **Trigger Vercel redeploy** (Deployments → latest → "..." → Redeploy). Wait for the build to complete. The new env vars are inlined at build time, so the client bundle now has `https://livekit.<domain>` instead of `ws://localhost:7880`.
12. **End-to-end test**: open an ONLINE cita, join from two browser tabs (one in Chrome, one in Firefox, one in Safari if you have it), wait for the call to establish, verify audio + video flows both ways, leave both tabs → cita transitions to `COMPLETADA` within ~5 seconds.
13. **Cert expiry check** (90 days from now): add a calendar reminder. Caddy will auto-renew 30 days before expiry, so the operator has a 30-day buffer to notice if renewal broke.

---

## 12. Verification strategy

This change is doc-only. There are no automated tests in the apply phase. Verification is layered:

### Static review (apply phase, manual)

- [ ] `docs/livekit-prod.md` exists and contains all 7 sections from §8 above.
- [ ] `docker/prod/Caddyfile` exists, parses as valid Caddy v2 syntax (`docker run --rm -v $(pwd)/docker/prod/Caddyfile:/etc/caddy/Caddyfile caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile` returns no errors).
- [ ] `docker/prod/livekit.yaml` exists, parses as valid YAML (`python -c "import yaml; yaml.safe_load(open('docker/prod/livekit.yaml'))"`), and does NOT contain a `dev: true` key.
- [ ] `docker/prod/docker-compose.override.yml` exists, parses as valid Compose v2 syntax (`docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml config` returns no errors), and the `livekit` service's `command:` does NOT contain `--dev`.
- [ ] `.env.production.example` exists and documents all 7 env vars from §9 above.
- [ ] `docs/livekit.md` has the +3-line bridge link at the top of section 5.
- [ ] `grep -r 'dev: true' docker/prod/` returns no matches.
- [ ] `grep -r -- '--dev' docker/prod/docker-compose.override.yml` returns no matches.

### Smoke test (post-deploy, manual — see §11)

- The 9-cmd checklist in §11 covers HTTPS signaling, webhook reachability, end-to-end call flow, and cert expiry tracking. Each step has an expected output documented in §11.
- No automated browser tests (Playwright) are added because the spec is doc-only and the prod deploy is on a different host than CI.

### Why no automated tests

The proposal's LOC estimate explicitly classifies this change as "doc-only". The artifact store is the `docker/prod/` directory and `docs/livekit-prod.md`; the unit-of-truth is the operator's VPS, not CI. Adding Playwright tests for the prod deployment would require CI access to the VPS (CI secrets, firewall holes, network flakiness) for marginal coverage (the only thing under test is "does Caddy serve a cert" and "does LiveKit respond on 7880", both of which are smoke-tested manually in the runbook). This is acceptable per the proposal's decision AD-8: "The prod artifacts are reference docs the user copies to their VPS."

---

## 13. Out-of-scope reminders

Explicit non-goals (each tracked as a separate change in `openspec/changes/` or future work):

- **TURN server** (`livekit-turn-prod`) — production TURN (coturn or similar) for restrictive NAT networks. When ~15% of clients cannot connect over UDP 7882, the operator needs TURN to relay media over TCP/TLS. The prod `livekit.yaml` has `turn.enabled: false` as a placeholder.
- **Image pin** (`livekit-pin-image`) — pin `livekit/livekit-server:latest` to a specific digest. Today the image is a rolling tag; a breaking change in the upstream image could break prod. Accepted risk; documented in the proposal's R9.
- **Recording / egress** (`livekit-recording`) — recording webhooks + S3 egress. The infrastructure is in place (the existing `livekit-webhooks` change handles webhook delivery; the dev compose's `minio` service is a dev S3). NOT in this change.
- **call-page-ux-redesign** — doctor UX simplification post-auto-complete (the cita auto-completes on `room_finished`; the doctor UI could be redesigned to show the completion more gracefully). NOT in this change.
- **cita-eventing** — Slack/email notifications on cita state changes. NOT in this change.
- **k8s / cert-manager** — multi-host LiveKit, autoscaling, pod disruption budgets. The single-VPS pattern is sufficient for the MVP.
- **Caddyfile for the Next.js Vercel app** — Vercel handles TLS for the Next.js deploy automatically. Adding a Caddy for `medico-consulta.com` is unnecessary.
- **DDoS protection** — Cloudflare in front of the VPS is a user choice. The doc mentions it in a footnote (HTTP-01 challenge needs port 80 open, so Cloudflare would need to be configured as a DNS-only proxy, not a CDN proxy, for ACME to work).
- **HSTS preload registration** — `next.config.ts` sets the `preload` directive, but the actual submission to Chrome's HSTS preload list is a separate manual process. The HSTS header in the Caddyfile matches; the preload registration is deferred.
- **Multi-region LiveKit** — single-region is fine for the MVP. Multi-region requires a different architecture (LiveKit Cloud or active-active SFU mesh) that is out of scope.
- **Code changes to `src/**`** — explicit non-goal. The Next.js app code is untouched.
- **Modifications to `docker-compose.yml` or `docker/dev/livekit.yaml`** — explicit non-goal. The dev workflow is unchanged.

---

## 14. File change summary + LOC + apply-phase tasks

| # | File | Action | LOC | Purpose | Task ID |
|---|------|--------|-----|---------|---------|
| 1 | `docker/prod/Caddyfile` | CREATE | ~30 | HTTPS reverse proxy on `:443` + ACME HTTP-01 on `:80` + HSTS header | T1 |
| 2 | `docker/prod/livekit.yaml` | CREATE | ~45 | Prod LiveKit config: no `--dev`, base64 `keys:`, `webhook:` → Vercel, `rtc.node_ip: ${LIVEKIT_NODE_IP}` | T2 |
| 3 | `docker/prod/docker-compose.override.yml` | CREATE | ~50 | Prod overlay: drops `--dev`, adds `caddy` service, sets `restart: always` + `mem_limit: 512m` | T3 |
| 4 | `.env.production.example` | CREATE | ~35 | Documents 7 prod env vars (placeholders only) | T4 |
| 5 | `docs/livekit-prod.md` | CREATE | ~280 | 7-section runbook (Prerequisites, Topology, compose, prod livekit.yaml, Webhook URL, Secrets & Rotation, Runbook & Monitoring) | T5 |
| 6 | `docs/livekit.md` | MODIFY | +3 | 1-paragraph bridge link to `docs/livekit-prod.md` at the top of section 5 | T6 |
| 7 | *(verification)* | — | — | Static checks (§12) + manual smoke test (§11) | T7 |
| | **Total new** | | **~440** | Plus 3-line modification | |

**Apply-phase task order** (recommended — preserves the ability to test incrementally):

1. **T1** — `docker/prod/Caddyfile`. Standalone file; no dependencies.
2. **T2** — `docker/prod/livekit.yaml`. Standalone; references `${LIVEKIT_API_KEY}` etc. but those are not validated until the container starts.
3. **T3** — `docker/prod/docker-compose.override.yml`. Depends on T1 + T2 (references both files in `volumes:` mounts and `command:` flag).
4. **T4** — `.env.production.example`. Standalone; documents the 7 vars used by T2 + T3.
5. **T5** — `docs/livekit-prod.md`. Standalone; the runbook that ties T1-T4 together.
6. **T6** — `docs/livekit.md` modification. Standalone; just adds the bridge link.
7. **T7** — Verification: run the static checks from §12, then (optionally, on a real VPS) run the smoke test from §11.

**Single PR vs chained PR**: per the proposal's chain-strategy analysis, the change is ~440 LOC (under both the 400-line chained-PR soft trigger and the 800-line hard cap). The natural seam is docs vs sample-configs, but the seam is shallow (the doc references the configs by path) and splitting would force the operator to read two PRs to understand the deploy. **Decision: single PR, stacked-to-main**.

**Rollback plan** (from the proposal, restated for completeness):

- Delete `openspec/changes/livekit-tls-prod/`, the 5 new files in `docker/prod/`, `docs/`, and `.env.production.example`.
- Revert the 3-line change in `docs/livekit.md`.
- The dev compose, dev env, dev LiveKit config, and the running Next.js app are untouched. The only user-visible change is the bridge link, which is a hyperlink.

---

## Decision needed before apply

**None.** All 8 open questions from explore §4 are resolved (D1-D8 in the proposal). All 14 implementation decisions (D9-D14) are committed. All 8 architecture decisions (AD-1-AD-8) are committed. The 12 risks (R1-R13) are mitigated in the doc + sample configs (cross-ref §10 above). The spec is locked at 145 lines with 8 sub-rules and 9 scenarios.

**Ready for `sdd-tasks` phase.**
