## ADDED Requirements

### Requirement: LiveKit Production TLS Deployment
The system SHALL document and configure production deployment of the self-hosted LiveKit container with TLS termination, cert automation, and prod-grade resource limits.

The deployment SHALL satisfy ALL of the following:

#### Production environment variables
A `docs/livekit-prod.md` file SHALL exist AND it SHALL document the following env vars with default values and rationale:

- `LIVEKIT_API_KEY` — alphanumeric, ≥8 chars, matches the `keys.<key>` entry in prod `livekit.yaml`.
- `LIVEKIT_API_SECRET` — base64-encoded (NOT the raw secret), matches the value in prod `livekit.yaml`.
- `NEXT_PUBLIC_LIVEKIT_URL` — `https://livekit.medico-consulta.com`, set at BUILD time on Vercel (not runtime).
- `LIVEKIT_WEBHOOK_URL` — `https://medico-consulta.com/api/livekit/webhook` (the Vercel app URL).
- `CADDY_DOMAIN` — `livekit.medico-consulta.com`.
- `CADDY_EMAIL` — `ops@medico-consulta.com` (for Let's Encrypt ACME registration).
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
- Reverse-proxy all HTTPS traffic to the `medico-livekit:7880` service.
- Set HSTS header with `max-age=31536000; includeSubDomains; preload`.

The `docs/livekit-prod.md` SHALL document the Caddy ACME HTTP-01 challenge requirement (port 80 open on VPS firewall).

#### Production webhook URL
The prod `docker/prod/livekit.yaml` `webhook.urls` array SHALL use the public Vercel URL (`https://medico-consulta.com/api/livekit/webhook`), NOT `host.docker.internal`.

The `docs/livekit-prod.md` SHALL include a smoke-test command that verifies the webhook reaches Vercel:
```bash
curl -X POST https://medico-consulta.com/api/livekit/webhook \
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
5. Restart LiveKit container: `docker compose -f docker-compose.yml -f docker/prod/docker-compose.override.yml restart medico-livekit`.
6. Verify with `curl https://livekit.medico-consulta.com/ping`.

#### Scenario: Dev to prod migration
Given a developer has the dev `docker-compose.yml` running locally,
When they follow the `docs/livekit-prod.md` migration checklist,
Then they end up with a prod-grade deployment:
- Caddy is reverse-proxying HTTPS → LiveKit:7880.
- LiveKit runs without `--dev` (auth enabled).
- Certs are auto-renewed.
- Webhooks reach the public Vercel URL.
- Healthcheck passes.
- UDP 7882 is reachable.

#### Scenario: Cert renewal verification
Given the LiveKit deployment is running,
When 60 days pass (less than the 90-day Let's Encrypt cert lifetime),
Then Caddy automatically renews the cert without manual intervention
And the `docker compose logs caddy` shows successful renewal.

#### Scenario: Webhook reachability
Given the prod `livekit.yaml` has `webhook.urls: [https://medico-consulta.com/api/livekit/webhook]`,
When a LiveKit `room_finished` event fires in prod,
Then the Vercel route handler at `/api/livekit/webhook` receives the event
And verifies the signature using `LIVEKIT_API_SECRET` from Vercel env
And returns 200 OK after auto-completing the cita.

#### Scenario: Dev flag accidentally left on
Given the LiveKit container is started with `--dev` flag in prod,
When any unauthenticated client attempts to mint a token,
Then the server accepts it (auth is disabled)
And the prod deployment is COMPROMISED.

Mitigation: The `docker/prod/docker-compose.override.yml` MUST NOT include `--dev`. The `docs/livekit-prod.md` SHALL include a pre-deployment checklist that grep's for `--dev` in the running container's command and fails the deploy if found.

#### Scenario: NEXT_PUBLIC_LIVEKIT_URL set at runtime on Vercel
Given the user sets `NEXT_PUBLIC_LIVEKIT_URL=https://livekit.medico-consulta.com` in Vercel runtime env vars,
When the Next.js app builds,
Then the URL is NOT inlined (because NEXT_PUBLIC_ vars are inlined at build time)
And the client fails to connect to LiveKit.

Mitigation: The `docs/livekit-prod.md` SHALL have a dedicated section "Vercel Build-Time Env Vars" that explains this and instructs setting it in Vercel's "Environment Variables" page under "Build Command" scope.

#### Scenario: UDP 7882 blocked by firewall
Given the VPS firewall blocks port 7882/UDP,
When a participant in the video call sends media,
Then the connection fails with "ICE failed" or "no viable candidate"
And the call cannot establish.

Mitigation: `docs/livekit-prod.md` Prerequisites section includes the explicit `ufw allow 7882/udp` command.

#### Scenario: Missing base64 encoding on secret
Given the user edits `docker/prod/livekit.yaml` and pastes the raw secret (not base64) into `keys.<key>`,
When LiveKit starts without `--dev`,
Then the container exits with an error like "invalid key format"
And the deployment is broken.

Mitigation: `docs/livekit-prod.md` includes the exact `echo -n "secret" | base64` command and shows the expected output format.

#### Scenario: Static IP not configured with node_ip
Given the VPS does NOT have a static public IP AND `LIVEKIT_NODE_IP` is empty in `livekit.yaml`,
When the LiveKit server returns ICE candidates (SDP) to clients,
Then the candidates include the docker bridge IP (172.17.0.x) which is unreachable from the public internet
And the call fails to negotiate.

Mitigation: `docs/livekit-prod.md` documents the static IP requirement AND the DDNS alternative for dynamic-IP deployments.
