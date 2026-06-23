# LiveKit Production Deployment

This guide deploys the self-hosted LiveKit SFU to a single VPS with TLS
termination, automatic certificate renewal, and prod-grade resource limits.
The Next.js app stays on Vercel (`angelina-consultoria.com`); only the LiveKit
container moves to the VPS, fronted by a Caddy reverse proxy.

The guide is for the operator running the VPS. It assumes the Next.js app
is already deployed on Vercel and the `/api/livekit/webhook` route handler
exists (see `docs/livekit.md` §5).

## Quick path

1. Provision a VPS (Ubuntu 22.04, ≥1 vCPU / ≥1 GB RAM, static public IP).
2. Point `livekit.angelina-consultoria.com` (DNS A record) at the VPS IP.
3. Open ports `80/tcp`, `443/tcp`, `7882/udp` with `ufw`.
4. Copy `docker/prod/` and `.env.production.example` from this repo.
5. Edit `.env.production` with real values (see §4 and §5).
6. `docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml up -d`.
7. Smoke-test: `curl https://livekit.<domain>/ping` returns 200.
8. Set Vercel env vars (Build scope for `NEXT_PUBLIC_*`) and redeploy.

Detailed steps and footgun mitigations follow.

---

## 1. Prerequisites

Before touching the VPS, the operator MUST have all of the following:

| Requirement | Why |
|-------------|-----|
| **VPS** with Ubuntu 22.04 LTS, ≥1 vCPU, ≥1 GB RAM | LiveKit is the heavy service; Caddy is ~40 MB. 2 GB RAM is recommended for a busy clinic. |
| **Static public IP** (or DDNS, see §4) | ACME HTTP-01 challenge and WebRTC SDP candidates both require a reachable public address. |
| **Domain** with a DNS zone you can edit | The default is `livekit.angelina-consultoria.com`. Any subdomain works; the A record MUST point at the VPS IP before Caddy's first ACME run. |
| **Docker + Docker Compose v2** installed | `docker --version` ≥ 20.10; `docker compose version` MUST show v2 (the `docker compose` CLI plugin, not legacy `docker-compose`). |
| **Non-root sudo user** on the VPS | No root login. Use `angelina-deploy` (or your chosen username) with `sudo` access. |
| **Vercel project** deployed | The Next.js app must be live at `angelina-consultoria.com` (or your custom domain). The prod webhook URL points to it. |

### Open the firewall

```bash
sudo ufw allow OpenSSH    # SSH (assumed already open; safe to re-run)
sudo ufw allow 80/tcp     # ACME HTTP-01 challenge (Caddy renews every 60 days)
sudo ufw allow 443/tcp    # HTTPS (signaling + token minting)
sudo ufw allow 7882/udp   # WebRTC media — CANNOT be reverse-proxied
sudo ufw enable
sudo ufw status           # verify the rules
```

> **Footgun (R11)**: Forgetting `7882/udp` is the #1 prod-call failure mode.
> Calls connect but produce no audio/video. The symptom is "ICE failed" or
> "no viable candidate" in the browser console. Fix: re-run `ufw allow 7882/udp`
> and reload the call page.

> **Why port 7882 is NOT proxied**: TCP-only reverse proxies (Caddy, nginx,
> Traefik) cannot forward WebRTC media. UDP packets from the browser land
> directly on the VPS public IP at port 7882. This is the ONLY reason the
> LiveKit server needs a public IP at all.

---

## 2. Deployment Topology

```
                    +--------------------+
                    |   Let's Encrypt    |
                    |   (ACME HTTP-01)   |
                    +---------+----------+
                              | cert
                              v
+--------+           +------------------+         +-----------------+
| Browser|<--443--> | Caddy (:443)     |<--:7880-| angelina-livekit  |
| (User) |           | + :80 (ACME)     |         | (Docker)        |
+---+----+           +------------------+         +--------+--------+
    |                                                       |
    | 7882/UDP (WebRTC media, direct)                       |
    +-------------------------------------------------------+

              +--------------------------------+
              | Vercel (Next.js app)           |
              | /api/livekit/webhook route     |
              +--------------^-----------------+
                             | HTTPS (server-to-server)
                             |
              +--------------+-----------------+
              | angelina-livekit webhook out     |
              +--------------------------------+
```

Three distinct traffic flows:

1. **Browser → Caddy → LiveKit** (HTTPS/443, WebSocket signaling). Caddy
   terminates TLS, reverse-proxies to `angelina-livekit:7880` on the Docker
   internal network. The browser never sees the LiveKit container directly.
2. **Browser → LiveKit UDP 7882** (WebRTC media, direct). UDP cannot be
   proxied; the browser sends STUN/media packets straight to the VPS public
   IP. This is the only reason LiveKit needs a public IP.
3. **LiveKit → Vercel** (HTTPS outbound, server-to-server webhooks).
   `room_finished` events fire when the last participant leaves a room;
   Vercel's route handler verifies the signature and auto-completes the
   cita. Implemented by the `livekit-webhooks` change.

### Why these choices

- **Caddy over nginx/Traefik**: built-in ACME (no certbot cron), auto-renew
  30 days before expiry, single 40-line binary, one config file.
- **Subdomain (`livekit.<domain>`)**: Vercel is serverless and cannot proxy
  UDP 7882; path-based routing is impossible. The subdomain also gives CORS
  isolation for free — `livekit.<domain>` and `<domain>` are separate
  origins, so the `access_token` JWT carries auth end-to-end without CORS
  gymnastics.
- **Single VPS + docker compose**: the operational complexity of k8s
  (Ingress, cert-manager, Service Mesh, pod disruption budgets) is not
  justified for an SFU under 100 concurrent calls. The change is portable
  to k8s in a follow-up.

---

## 3. Caddy + LiveKit compose

### 3.1 Set up the directory

```bash
# On the VPS, as the deploy user:
mkdir -p /opt/angelina-livekit
cd /opt/angelina-livekit

# Copy these files from the angelina-consultoria repo:
#   docker/prod/Caddyfile
#   docker/prod/livekit.yaml
#   docker/prod/docker-compose.override.yml
#   .env.production.example
#
# Either clone the repo, or scp the files:
scp docker/prod/Caddyfile docker/prod/livekit.yaml \
    docker/prod/docker-compose.override.yml .env.production.example \
    angelina-deploy@<vps>:/opt/angelina-livekit/
```

The base `docker-compose.yml` is the same file used in development. If the
repo is not on the VPS, create a minimal one at `/opt/angelina-livekit/docker-compose.yml`:

```yaml
services:
  angelina-livekit:
    image: livekit/livekit-server:latest
  angelina-caddy:
    image: caddy:2-alpine
```

The override file (`docker/prod/docker-compose.override.yml`) extends both
services with prod-specific config (resource limits, prod livekit.yaml mount,
caddy config mount, persistent volumes).

### 3.2 Fill in the env file

```bash
cp .env.production.example .env.production
chmod 600 .env.production
$EDITOR .env.production
```

See §4 for what each value means and how to generate the base64 secret,
and §5 for the Vercel-side env vars. All 7 vars are required except
`LIVEKIT_NODE_IP` (empty = DDNS, but most VPS providers give a static IP).

### 3.3 Bring the stack up

```bash
cd /opt/angelina-livekit
docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml up -d

# Tail the logs to verify first boot:
docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml logs -f caddy angelina-livekit
```

**Expected first-boot log lines**:

- Caddy: `obtained certificate for livekit.angelina-consultoria.com`
- LiveKit: `using config file: /etc/livekit.yaml` and `API key: ... (env: LIVEKIT_API_KEY)`

The cert issuance takes ~30 seconds. If you see `acme: error: 403 ...`,
the DNS A record is not yet pointing at the VPS — wait for propagation
(usually < 5 minutes for low TTLs) and retry.

### 3.4 Pre-deployment checklist (MANDATORY)

Before pointing any traffic at the deployment, verify these six items.
**If any FAILS, stop and fix it before continuing.**

```bash
cd /opt/angelina-livekit

# 1. --dev is absent from the livekit container's command (R1 — auth MUST be enabled)
docker inspect angelina-livekit --format '{{.Args}}' | grep -q -- '--dev' \
  && echo "FAIL: --dev found in container args" \
  || echo "PASS: --dev absent"

# 2. dev: true is absent from the prod config file
grep -E "^\s*dev:\s*true" docker/prod/livekit.yaml \
  && echo "FAIL: dev: true found" \
  || echo "PASS: dev: true absent"

# 3. node_ip is set (R12 — SDP candidates MUST be a reachable IP)
grep -E "node_ip:\s+\\\${LIVEKIT_NODE_IP}" docker/prod/livekit.yaml \
  && echo "PASS: node_ip uses env var" \
  || echo "FAIL: node_ip missing"

# 4. webhook.urls points at the PUBLIC Vercel URL (NOT host.docker.internal)
grep -E "host.docker.internal" docker/prod/livekit.yaml \
  && echo "FAIL: webhook uses host.docker.internal" \
  || echo "PASS: webhook uses public URL"

# 5. keys.<key> uses ${LIVEKIT_API_SECRET} substitution (R13 base64 footgun)
grep -E "keys:" docker/prod/livekit.yaml -A 1 | grep -q "\\\${LIVEKIT_API_SECRET}" \
  && echo "PASS: keys use env substitution" \
  || echo "FAIL: keys do not use env substitution"

# 6. restart: always + mem_limit: 512m on the livekit service
grep -E "restart:\s+always" docker/prod/docker-compose.override.yml \
  && echo "PASS: restart: always" \
  || echo "FAIL: restart policy wrong"
grep -E "mem_limit:\s+512m" docker/prod/docker-compose.override.yml \
  && echo "PASS: mem_limit set" \
  || echo "FAIL: mem_limit missing"
```

---

## 4. LiveKit prod config

`docker/prod/livekit.yaml` is the production LiveKit configuration,
mounted at `/etc/livekit.yaml` inside the container. Annotated walkthrough:

```yaml
port: 7880                              # signaling port (Caddy reaches it)
bind_addresses:
  - "0.0.0.0"                           # listen on all interfaces

rtc:
  node_ip: ${LIVEKIT_NODE_IP}           # VPS public IP for SDP candidates (R12)
  tcp_port: 7881                        # WebRTC TCP fallback
  udp_port: 7882                        # WebRTC UDP (primary; direct from browser)

turn:
  enabled: false                        # OUT OF SCOPE — see livekit-turn-prod

webhook:
  api_key: ${LIVEKIT_API_KEY}           # must match the key in keys.<key>
  urls:
    - ${LIVEKIT_WEBHOOK_URL:-https://angelina-consultoria.com/api/livekit/webhook}

keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}   # base64 form — see R13 below
```

### 4.1 The base64 footgun (R13)

This is the highest-leverage mistake a new operator can make. The dev
config uses the shorthand `devkey: secret`, which only works under `--dev`.
In prod, `--dev` is removed and the `keys.<key>` value MUST be the
base64-encoded form.

**Generating the base64 secret**:

```bash
# Generate a raw secret (32 random bytes, base64-encoded for transport):
RAW=$(openssl rand -base64 32)
echo "Raw secret: $RAW"

# The value that goes in .env.production (VPS side):
echo -n "$RAW" | base64
# Example output: c2VjcmV0Y2FjY2FjYWM0MWM0...

# Verify the round-trip:
echo -n "$RAW" | base64 | base64 -d
# Should print the original $RAW
```

**Where each form goes**:

| Side | Form | Env var |
|------|------|---------|
| VPS (`docker/prod/livekit.yaml` `keys.<key>`) | Base64-encoded | `LIVEKIT_API_SECRET` in `.env.production` |
| Vercel (Next.js token signer) | Raw | `LIVEKIT_API_SECRET` in Vercel project env |

The token signer on Vercel sends the raw secret to LiveKit's HMAC algorithm.
LiveKit validates against the base64 form in `keys.<key>`. Both forms encode
the same bytes — but the env var contract is: VPS = base64, Vercel = raw.

If you paste the raw secret into the VPS side, the container exits with
`invalid key format` and the call page shows 401 on every token request.
The fix: regenerate using `echo -n "$RAW" | base64` and restart the container.

### 4.2 The `--dev` footgun (R1)

`docker-compose.override.yml` runs the LiveKit container with:

```yaml
command: --node-ip ${LIVEKIT_NODE_IP} --bind 0.0.0.0 --config /etc/livekit.yaml
```

**There is no `--dev` flag.** The `--dev` flag in LiveKit disables auth,
which means any client that can reach the server can mint tokens for any
room. In prod, that is a complete compromise of the platform. The comment
above the `command:` line says `DO NOT ADD --dev HERE` — read it before
editing the file.

### 4.3 DDNS alternative for `LIVEKIT_NODE_IP`

If the VPS has a dynamic IP, use a DDNS provider (DuckDNS, No-IP, etc.):

```bash
# In .env.production, instead of an IP, set the DDNS hostname:
LIVEKIT_NODE_IP=myhost.duckdns.org
```

LiveKit will advertise that hostname in SDP candidates. The browser
resolves it and connects to the current IP. Caddy's ACME HTTP-01 challenge
also works with DDNS as long as the A record is propagated before the
first cert issuance (usually < 5 minutes for DuckDNS).

---

## 5. Webhook URL

The prod webhook URL is `https://angelina-consultoria.com/api/livekit/webhook`
(the public Vercel URL). When a `room_finished` event fires, LiveKit makes
an outbound HTTPS POST from the VPS to Vercel's route handler.

### 5.1 Why the public Vercel URL (NOT `host.docker.internal`)

The dev `docker-compose.yml` sets
`webhook.urls: [http://host.docker.internal:3000/api/livekit/webhook]`. In
dev, that works because `host.docker.internal` resolves to the host machine
where the Next.js dev server is running.

In prod, there is no Next.js server on the VPS. `host.docker.internal`
would resolve to the VPS loopback, which has no Next.js handler, and the
webhook would 404. The fix is the public Vercel URL.

### 5.2 Vercel build-time env vars (R7)

> **CRITICAL**: `NEXT_PUBLIC_LIVEKIT_URL` is inlined at **BUILD TIME** on
> Vercel. Setting it as a runtime-only env var will NOT work — the client
> bundle will have `ws://localhost:7880` (the Vercel default) and every
> call attempt will fail with "secure context error".

To set it correctly:

1. Open the Vercel dashboard → Project → Settings → Environment Variables.
2. Add `NEXT_PUBLIC_LIVEKIT_URL=https://livekit.angelina-consultoria.com`.
3. Set the scope to **Production** (and **Preview** if you want it there too).
   The Vercel UI has three scope buttons: "Build Command", "Lambda", "Both".
   For `NEXT_PUBLIC_*`, you want "Build Command" or "Both" — never Lambda only.
4. Trigger a redeploy: Deployments → click "..." on the latest → **Redeploy**.
   (Editing the env var alone does not inline it into the existing build.)

If the symptom is "calls connect to `localhost:7880` instead of the prod
host", the env var was set Lambda-only or the redeploy was skipped. Fix
the scope and redeploy.

### 5.3 Smoke test — webhook reachability

```bash
# 1. Verify LiveKit is up:
curl -sI https://livekit.angelina-consultoria.com/
# expect: HTTP/2 200 with a `server: Caddy` header

# 2. Verify the webhook route is reachable (should return 401 — bad signature):
curl -X POST https://angelina-consultoria.com/api/livekit/webhook \
  -H "Authorization: Bearer test" \
  -H "Content-Type: application/json" \
  -d '{}'
# expect: 401 (the handler rejects unsigned probes)
```

| Response | Meaning |
|----------|---------|
| `401` | Route handler is up; signature check works. ✅ |
| `200` | Handler accepted an unsigned probe — something is wrong; check the handler. ❌ |
| Connection refused / timeout | Vercel deploy is down, or VPS egress is blocked. ❌ |

### 5.4 Live test — full call flow

After the smoke tests pass:

1. Open an `ONLINE` cita in the Next.js app.
2. Join from two browser tabs (one in Chrome, one in Firefox if available).
3. Verify audio + video flows both ways.
4. Leave both tabs.
5. Within ~5 seconds, the cita should transition to `COMPLETADA` (or
   `NO_ASISTIO` if no one joined).
6. Check Vercel function logs for the `room_finished` event delivery.

---

## 6. Secrets & Rotation

This section covers rotation of `LIVEKIT_API_SECRET`. Rotation of
`LIVEKIT_API_KEY` is rarely needed (only if compromised); it requires
coordinating with all clients, so treat it as a separate operation.

### 6.1 Rotation runbook (8 steps)

```bash
# 1. Generate a new raw secret (32 random bytes):
NEW_RAW=$(openssl rand -base64 32)
echo "New raw secret: $NEW_RAW"

# 2. Base64-encode for the VPS side:
NEW_B64=$(echo -n "$NEW_RAW" | base64)
echo "New base64 (for VPS): $NEW_B64"

# 3. Update docker/prod/livekit.yaml:
#    Replace the value of keys.${LIVEKIT_API_KEY} with $NEW_B64.
#    (You can also use sed:)
sed -i "s|secret:.*|secret: $NEW_B64|" /opt/angelina-livekit/docker/prod/livekit.yaml

# 4. Update .env.production:
sed -i "s|^LIVEKIT_API_SECRET=.*|LIVEKIT_API_SECRET=$NEW_B64|" /opt/angelina-livekit/.env.production

# 5. Update Vercel — set LIVEKIT_API_SECRET = $NEW_RAW (RAW form, NOT base64).
#    In the Vercel dashboard: Project → Settings → Environment Variables →
#    LIVEKIT_API_SECRET → edit → paste $NEW_RAW → Save.

# 6. Trigger a Vercel redeploy (the new env var is inlined at build time):
#    Deployments → latest → "..." → Redeploy.

# 7. Restart the LiveKit container:
cd /opt/angelina-livekit
docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml restart angelina-livekit

# 8. Verify:
curl -sI https://livekit.angelina-consultoria.com/
# expect: 200 OK
# Then open a test cita and confirm a real call connects.
```

### 6.2 Why the order matters

Rotating only on one side (VPS or Vercel) breaks token validation:

- If VPS is updated but Vercel is not: Next.js signs tokens with the OLD
  secret, LiveKit validates against the NEW → every call returns 401.
- If Vercel is updated but VPS is not: Next.js signs tokens with the NEW
  secret, LiveKit validates against the OLD → every call returns 401.

The rotation MUST happen on both sides before any traffic. The order in
the runbook (VPS file → Vercel env → Vercel redeploy → LiveKit restart →
verify) ensures both sides switch together.

### 6.3 Rotation cadence

| Trigger | Cadence |
|---------|---------|
| Routine rotation | Every 90 days (matches the Let's Encrypt cert lifetime) |
| Operator offboarding | Immediate — old credentials may be compromised |
| Suspected leak (logs, screen-share, repo commit) | Immediate |
| Annual key rotation | At minimum, once per year |

Set a calendar reminder 30 days before the next rotation. Caddy will
auto-renew the cert 30 days before expiry; rotate the secret on the same
cadence so the ops calendar has one entry per quarter, not two.

---

## 7. Runbook & Monitoring

### 7.1 Common commands

All commands assume `cd /opt/angelina-livekit` first.

```bash
# Tail both services' logs:
docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml logs -f caddy angelina-livekit

# Tail only Caddy:
docker compose logs -f caddy

# Tail only LiveKit:
docker compose logs -f angelina-livekit

# Container status + health + uptime:
docker compose ps

# Resource usage (one-shot):
docker stats angelina-livekit angelina-caddy --no-stream

# Check cert expiry (should be ~60-90 days from now):
docker exec angelina-caddy caddy list-certificates

# Force cert re-issue (only if auto-renew failed):
docker exec angelina-caddy caddy reload --config /etc/caddy/Caddyfile

# LiveKit healthcheck (HTTP):
curl -sI https://livekit.angelina-consultoria.com/

# Webhook reachability:
curl -X POST https://angelina-consultoria.com/api/livekit/webhook \
  -H "Authorization: Bearer test" -d '{}'   # expect 401
```

### 7.2 What to monitor

- **Cert expiry**: run `docker exec angelina-caddy caddy list-certificates`
  weekly. Caddy auto-renews at 30 days before expiry; if the cert drops
  below 30 days remaining, auto-renew failed. Check
  `docker logs angelina-caddy` for ACME errors.
- **Disk usage**: Caddy's `caddy_data` volume holds certs and ACME state.
  Disk fills slowly (KB per cert), but should still be on the monitoring
  radar. `df -h /var/lib/docker/volumes/angelina-livekit_caddy_data`.
- **Memory pressure**: `docker stats angelina-livekit`. The container is
  capped at 512 MB; if the OOM-killer fires, LiveKit restarts. Scale up
  by editing `mem_limit: 1g` in `docker/prod/docker-compose.override.yml`
  and re-deploying.
- **Call quality**: the `livekit-server` container logs WebRTC stats at
  INFO level. For deeper metrics, run a separate metrics stack (Prometheus
  + Grafana) — out of scope for this change.

### 7.3 Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Calls connect but no audio/video | UDP 7882 blocked by firewall (R11) | `sudo ufw allow 7882/udp` |
| 401 on every call | Raw secret in `keys.<key>` instead of base64 (R13) | Regenerate with `echo -n "$RAW" | base64`, update YAML, restart |
| WebRTC fails to negotiate | `node_ip` is a private IP, not the VPS public IP (R12) | Set `LIVEKIT_NODE_IP=<public-IP>` in `.env.production` |
| Browser shows "secure context" error | Caddy cert invalid or missing | `docker logs angelina-caddy`; if cert missing, `docker restart angelina-caddy` |
| Calls connect to `localhost:7880` | `NEXT_PUBLIC_LIVEKIT_URL` set Lambda-only on Vercel (R7) | Change scope to "Build Command" or "Both", redeploy |
| LiveKit container keeps restarting | Base64 secret wrong (R13) or `node_ip` missing (R12) | `docker logs angelina-livekit`; check error message |
| Caddy returns 526 (invalid cert) | Cert expired or chain incomplete | `docker exec angelina-caddy caddy list-certificates`; if cert is missing, restart caddy |
| Webhook returns 404 instead of 401 | Wrong `LIVEKIT_WEBHOOK_URL` (still pointing at `host.docker.internal`) | Update to public Vercel URL in `.env.production`, restart livekit |