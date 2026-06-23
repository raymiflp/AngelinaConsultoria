# Proposal: LiveKit Production TLS Deployment

## Change name

`livekit-tls-prod` (folder: `livekit-tls-prod/`, no date prefix — this change has no temporal urgency and the explore phase already used the `2026-06-20` stamp in engram).

## Intent

The medico-consulta platform self-hosts LiveKit on a VPS (not Vercel, not LiveKit Cloud) so that consultation traffic stays in-house. The dev `livekit` service in `docker-compose.yml` works on `ws://localhost:7880` because the browser exempts `localhost` from the secure-context rule. **Production has no such exemption.** A production browser visiting `medico-consulta.com` would refuse to grant `getUserMedia()` against `ws://livekit.medico-consulta.com` because the WebSocket isn't `wss://`, and the `video-calls-ui` spec promises the call works on Chrome / Firefox / Safari without a custom cert dialog. The `livekit-infrastructure` spec already acknowledges this gap: line 135 reads "Production deployment MUST override this env var to `wss://<your-livekit-host>` with a real certificate. Production override is out of scope for this change but MUST be documented in `docs/livekit.md`." This change closes that open requirement.

The change is **documentation + sample configuration only**. It does not modify any code, does not modify the existing dev `docker-compose.yml`, does not modify the existing `docker/dev/livekit.yaml`, does not modify the Next.js app, does not add migrations, and does not introduce new env vars into the dev workflow. It produces five new files (`docs/livekit-prod.md`, `docker/prod/Caddyfile`, `docker/prod/livekit.yaml`, `docker/prod/docker-compose.override.yml`, `.env.production.example`) and one two-line edit to the existing `docs/livekit.md` plus one new spec requirement on `livekit-infrastructure`. The sample files are reference artifacts the user copies to their VPS — they are never mounted by the dev compose, never imported by the Next.js app, and never executed by CI.

The user-visible outcome: an operator who reads `docs/livekit-prod.md` from a fresh VPS can stand up a TLS-terminated, cert-auto-renewed, memory-bounded, `--dev`-stripped LiveKit deployment in front of the existing Next.js app on Vercel without inventing any architecture. The biggest footgun (`--dev` left on in prod, which disables auth) is removed in the sample `docker-compose.override.yml`, and the second-biggest footgun (`NEXT_PUBLIC_LIVEKIT_URL` set at runtime instead of build time, which silently inlines `ws://localhost:7880` into the client bundle) is called out in the runbook.

## Why

The explore phase (engram id `482`, `sdd/livekit-tls-prod-2026-06-20/explore`, saved 2026-06-20 15:57:38) found twelve concrete gaps. Each one is a real surface in the production deployment that the current dev-only docs do not address:

1. **No HTTPS termination for LiveKit.** The container speaks HTTP on 7880 only. The current `docker-compose.yml` is dev; nothing in the repo handles prod TLS.
2. **No cert automation.** The repo has no `Caddyfile`, `nginx.conf`, `traefik.yml`, or cert-manager manifest. Cert issuance + renewal is unowned.
3. **No domain routing guidance.** The repo's only LiveKit URL reference is `ws://localhost:7880`. There is no documented subdomain strategy.
4. **No TURN-over-TLS guidance** (deferred to `livekit-turn-prod` per scope).
5. **No cert rotation / expiry handling** documented.
6. **No prod env var matrix** — `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` / `LIVEKIT_WEBHOOK_URL` are documented only for dev defaults.
7. **No webhook URL guidance for prod.** Dev points to `host.docker.internal:3000`; prod must point to the public Vercel URL (server-to-server across the public internet).
8. **No memory limits / restart policies for prod.** The dev compose has `restart: unless-stopped` and zero `mem_limit`.
9. **`--dev` flag is the biggest prod footgun.** LiveKit's `--dev` mode disables auth checks. The prod override MUST drop it.
10. **`NEXT_PUBLIC_LIVEKIT_URL` is build-time-inlined.** Setting it as a Vercel runtime env var will NOT work — the build step inlines the value into the client bundle. This is a Vercel gotcha that catches every team once.
11. **UDP port 7882 cannot go through a reverse proxy.** WebRTC media flows over UDP; nginx, Caddy, and Traefik do not proxy UDP. The VPS firewall must open 7882/UDP directly.
12. **`node_ip` / static-IP requirement.** If the VPS is behind NAT, SDP negotiation advertises a private IP and WebRTC fails. The prod `livekit.yaml` must include a `node_ip` block with the VPS public IP, or a DDNS hostname.

The change is small in absolute terms (~400 lines, well under the 800-line review budget) and high-leverage: it closes the only remaining open spec requirement on the existing `livekit-infrastructure` capability and gives the operator a deterministic deploy path.

## Scope

### In scope

- `docs/livekit-prod.md` — NEW, ~280 lines. Seven sections: Prerequisites, Deployment Topology, Caddy + LiveKit compose, LiveKit prod config, Webhook URL, Secrets & Rotation, Runbook & Monitoring, Troubleshooting.
- `docker/prod/Caddyfile` — NEW, ~30 lines. Caddy v2 syntax. Listens on `:443` and `:80` (80 = ACME challenge only). Reverse-proxies `/` to `medico-livekit:7880` over the Docker internal network.
- `docker/prod/livekit.yaml` — NEW, ~40 lines. Prod config: real `keys:` block (base64), `webhook:` block pointing to the public Vercel URL, `rtc:` block with the same ports as dev, `turn.enabled: false`, `node_ip: ${LIVEKIT_NODE_IP}` from env.
- `docker/prod/docker-compose.override.yml` — NEW, ~50 lines. Drops `--dev` from the command, sets `restart: always`, sets `mem_limit: 512m` (documented as a tuning knob), keeps the three ports (7880, 7881, 7882/udp) so the dev compose still works. Adds the `caddy` service.
- `.env.production.example` — NEW, ~30 lines. Documents `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL=https://livekit.medico-consulta.com`, `LIVEKIT_WEBHOOK_URL=https://medico-consulta.com/api/livekit/webhook`, `CADDY_DOMAIN`, `CADDY_EMAIL` (for ACME), `LIVEKIT_NODE_IP`. All values are placeholders — no real secrets.
- `docs/livekit.md` — MODIFIED, +3 lines. Add a one-paragraph bridge link at the top of section 5 (Webhooks) pointing to the new prod doc.
- `openspec/changes/livekit-tls-prod/specs/livekit-infrastructure/spec.md` — NEW (delta). One ADDED requirement: `REQ-LI-PROD-1` covering the prod env var matrix, `--dev` removal, TLS termination, cert automation, prod webhook URL, healthcheck / restart / memory limits, `node_ip`, and UDP 7882 reachability.

### Out of scope

- TURN server (`livekit-turn-prod`).
- Image pin (`livekit-pin-image`).
- Recording / egress webhooks (`livekit-recording`).
- Doctor UX simplification post-auto-complete (`call-page-ux-redesign`).
- Cita eventing to Slack/email (`cita-eventing`).
- Caddy for the Next.js Vercel app (Vercel handles its own TLS).
- k8s / cert-manager / multi-host LiveKit.
- DDoS protection (Cloudflare-in-front is a user choice; the doc mentions it but does not implement it).
- HSTS preload registration (already set in `next.config.ts`; the actual submission to the HSTS preload list is a Chrome-side process).
- Code changes to `src/**`.
- Modifications to `docker-compose.yml` or `docker/dev/livekit.yaml`.
- New env vars in `.env.example` (the dev env matrix is unchanged; prod lives in the new `.env.production.example`).
- Modifications to the Vercel deploy workflow.

## Decisions (D1..D14)

| ID | Decision | Rationale |
|---|---|---|
| **D1** | TLS terminator = **Caddy v2** (single binary, built-in ACME, zero-config renewal). | Caddy's ACME support is built in (no `certbot` cron, no `acme.sh` hook). One binary, one config file, automatic cert issuance + renewal on first HTTPS request. The same single-VPS pattern the explore report recommended. nginx would require a separate certbot + cron + renewal-hook config; Traefik would require Docker labels and a more verbose config. Caddy is the pragmatic minimum. |
| **D2** | Domain = **`livekit.medico-consulta.com`** (subdomain, separate origin from the Vercel-hosted Next.js app). | Subdomain gives CORS isolation for free (the browser treats `livekit.medico-consulta.com` and `medico-consulta.com` as separate origins, so no CORS gymnastics). Path-based routing (`medico-consulta.com/livekit/...`) is impossible because Vercel is serverless and cannot proxy WebRTC media over UDP 7882. Subdomain is the only viable pattern when the Next.js app lives on Vercel. |
| **D3** | Cert issuer = **Caddy's built-in ACME / Let's Encrypt via HTTP-01 challenge**. | HTTP-01 requires port 80 open to the public internet and the A record pointing at the VPS. DNS-01 is more flexible (works behind Cloudflare, supports wildcards) but requires a DNS provider plugin. For a single VPS with a public IP, HTTP-01 is the simplest path. The doc explains both and shows how to swap to a DNS-01 plugin if the user fronts the VPS with Cloudflare. |
| **D4** | Deploy target = **single VPS with `docker compose`** (assumed; deltas for k8s noted but not implemented). | Matches the project's dev maturity (dev already uses `docker-compose.yml`; the prod override is a single file the user copies to the VPS). k8s is documented as "do not use this for a self-hosted SFU under 100 concurrent calls" — not worth the operational complexity at the dev-stage. The override file structure is designed so a k8s port would only need new manifests, not a new Caddyfile. |
| **D5** | UDP port 7882 = **VPS firewall (e.g., `ufw allow 7882/udp`) opens the port directly; no reverse proxy for UDP**. | nginx, Caddy, and Traefik cannot proxy UDP. WebRTC media flows over UDP. The doc explicitly states that the VPS firewall must allow 7882/UDP to the public internet. Optional: restrict the source IP range to known WebRTC clients (impractical at scale; the doc notes this is rarely worth doing). |
| **D6** | Static public IP = **documented as a requirement, with a DDNS alternative note**. | LiveKit's `node_ip` config block must contain either the VPS public IP or a DNS name that resolves to it. If the VPS has a dynamic IP, the user must use a DDNS provider (e.g., `duckdns`, `no-ip`, `afraid.org`) and set `node_ip: <ddns-hostname>` in the prod `livekit.yaml`. The Caddyfile still needs the A record to be valid for ACME — DDNS + Caddy HTTP-01 works because Caddy re-checks the A record on every renewal. |
| **D7** | New file = **YES, `docs/livekit-prod.md`** is a separate file from the dev-focused `docs/livekit.md`. | The dev doc is 160 lines. The prod doc would push it to ~600 lines and confuse new devs who only need the `docker compose up -d livekit` instructions. Separate files keep the dev path short and the prod path deep. The dev doc gets a single-paragraph link to the prod doc in section 5. |
| **D8** | Sample configs = **YES, committed to `docker/prod/`** (Caddyfile + `docker-compose.override.yml` + `livekit.yaml` prod variant). | The alternative — inlining the configs into the markdown — works for one-time deploys but breaks when the user wants to fork or version their own prod config. Committing to `docker/prod/` means the user can `git diff` their changes against the reference and the CI / dev workflow never sees the file (no volume mount, no `extends:`). |
| **D9** | Caddy reverse-proxies `https://livekit.medico-consulta.com:443` → `medico-livekit:7880` (Docker internal network). LiveKit → Caddy → exit → public internet → Vercel for the webhook. | The 7880 port is NOT exposed to the host (only to the `livekit` Docker network). Caddy is the only surface listening on 443. The webhook is server-to-server: the LiveKit container makes an outbound HTTPS call to the Vercel URL; Caddy is not involved in that path. |
| **D10** | Prod webhook URL = **`https://medico-consulta.com/api/livekit/webhook`** (the Vercel app URL, since Next.js is on Vercel). | The Next.js app lives on Vercel, not on the VPS. The dev URL `http://host.docker.internal:3000/api/livekit/webhook` is meaningless in prod (the VPS has no Next.js dev server). The webhook is a server-to-server call from the LiveKit container to the Vercel app; the container must have outbound HTTPS access to the public internet. |
| **D11** | **`--dev` flag MUST be removed** in `docker/prod/docker-compose.override.yml`'s `command:` block. | `--dev` enables permissive defaults and disables some auth checks. Running `--dev` in prod is a security hole. The override file shows the exact command without `--dev`. |
| **D12** | Use **base64-encoded `keys:` block** in prod `livekit.yaml` (the `devkey: <secret>` shorthand is `--dev`-only and becomes invalid when `--dev` is removed). | LiveKit's config schema requires the base64 form once `--config` is set without `--dev`. The dev `docker/dev/livekit.yaml` already uses the base64 form (livekit-webhooks D11). The prod doc shows `echo -n "your-secret" | base64` as the generation step. |
| **D13** | `restart: always` and `mem_limit: 512m` (or user-tunable) in the prod `livekit` service. | The dev compose uses `restart: unless-stopped` and zero `mem_limit` — both are dev-friendly but prod-fragile. `restart: always` ensures the SFU comes back after a host reboot. `mem_limit: 512m` bounds OOM risk; documented as a tuning knob (a busy clinic may need 1g). |
| **D14** | Document the **`LIVEKIT_API_SECRET` rotation runbook**: (1) generate a new secret + base64, (2) update `livekit.yaml` + `LIVEKIT_API_SECRET` env on the VPS, (3) update `LIVEKIT_API_SECRET` in Vercel env, (4) restart the LiveKit container, (5) redeploy Vercel (new env inlines at build). Order matters: rotating only on one side causes all token-issuance calls to fail. | The secret is the only auth surface between the Next.js app and the LiveKit SFU. If compromised, an attacker can mint tokens and join any room. Rotation cadence is a user choice; the doc shows the mechanical steps. |

## Architecture Decisions (AD-1..AD-8)

| ID | Decision | Rationale | Tradeoffs |
|---|---|---|---|
| **AD-1** | Caddy reverse-proxy listens on `:443` (HTTPS) and `:80` (ACME challenge only). Proxies `/` to `medico-livekit:7880` over the Docker internal network. | Caddy's `reverse_proxy` directive is the documented pattern. Port 80 is open ONLY for ACME challenges; all other traffic is served on 443. The docker-compose network isolation means 7880 is not exposed to the host. | If the user fronts the VPS with Cloudflare, the CF proxy takes port 443 and Caddy moves to a non-standard port — documented in the "Cloudflare in front" footnote. |
| **AD-2** | Caddy and LiveKit run in the same `docker-compose.override.yml`, sharing a Docker network. | One file to copy, one `docker compose up -d` to run. The user does not need to manage two stacks. The Caddy image is `caddy:2-alpine`; the LiveKit image is unchanged (`livekit/livekit-server:latest`). | Slightly larger blast radius (one stack down = both down). For a single VPS this is fine; for HA, the user splits into two stacks. |
| **AD-3** | Prod `livekit.yaml`: removes `dev` mode, adds `rtc:` block (turn off TURN for now per scope), adds `node_ip: ${LIVEKIT_NODE_IP}` if the user has a static IP, otherwise a DDNS hostname. | The `node_ip` block tells LiveKit what to advertise in SDP — without it, SDP carries a private IP and WebRTC fails. TURN stays off (per `livekit-turn-prod` scope). The webhook URL uses `${LIVEKIT_WEBHOOK_URL}` from env (same pattern as the dev YAML). | `node_ip` is set once and rarely changes; if the VPS IP changes, the user must update and restart LiveKit. |
| **AD-4** | Webhook URL in prod `livekit.yaml` points to the **public Vercel URL**, NOT to `host.docker.internal`. | The Next.js app is on Vercel; the VPS has no Next.js server. `host.docker.internal` resolves to the VPS host loopback, which has no Next.js. The prod YAML uses `${LIVEKIT_WEBHOOK_URL:-https://medico-consulta.com/api/livekit/webhook}`. | Requires outbound HTTPS from the VPS to Vercel. Usually trivial but worth noting on locked-down VPSes (doc calls this out). |
| **AD-5** | `.env.production.example` documents: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (placeholders, never real), `NEXT_PUBLIC_LIVEKIT_URL=https://livekit.medico-consulta.com`, `LIVEKIT_WEBHOOK_URL=https://medico-consulta.com/api/livekit/webhook`, `CADDY_DOMAIN=livekit.medico-consulta.com`, `CADDY_EMAIL=ops@medico-consulta.com` (for ACME registration), `LIVEKIT_NODE_IP=<VPS public IP or DDNS hostname>`. | The `.env.production.example` is a single file the user copies to the VPS as `.env.production`. The values are all placeholders; the user fills in their own. `NEXT_PUBLIC_LIVEKIT_URL` is the build-time-inlined Vercel env var (R7) — documented in the runbook as a build-time value, NOT a runtime value. | Vercel has a separate env var list for the Next.js app. The doc explains that `NEXT_PUBLIC_LIVEKIT_URL` must be set in BOTH the VPS `.env.production` (for the LiveKit container) AND the Vercel project env (for the Next.js build). |
| **AD-6** | `docs/livekit-prod.md` structure: 7 sections — (1) Prerequisites (VPS, DNS, ports), (2) Deployment Topology (ASCII diagram), (3) Caddy + LiveKit compose (walk through `docker-compose.override.yml`), (4) LiveKit prod config (walk through `livekit.yaml`), (5) Webhook URL (D10 + how to verify it fires), (6) Secrets & Rotation (D14 runbook), (7) Runbook & Monitoring + Troubleshooting. | One section per decision area, copy-pasteable commands at the end of each section, troubleshooting at the end so the operator does not have to scroll. The order matches a chronological deploy (DNS first, then stack, then config, then verify). | The doc is long (~280 lines). The explore report estimated 200-400; this lands in the middle. |
| **AD-7** | Update existing `docs/livekit.md` to ADD a one-paragraph link "See `docs/livekit-prod.md` for production deployment" at the top of section 5 (Webhooks). | Preserves the dev doc; bridges to prod. Section 5 is the natural place because it already mentions `LIVEKIT_WEBHOOK_URL`, which is the var the user changes between dev and prod. The change is +3 lines (one paragraph + one line break). | Could be more aggressive (e.g., rewrite section 4 entirely) but the principle of minimum-change wins here. The dev doc stays a dev doc. |
| **AD-8** | NO code changes. NO LiveKit config changes that ship in this repo's CI/dev workflow. The prod artifacts (`docker/prod/*`, `.env.production.example`) are **reference docs the user copies to their VPS**. | The dev compose uses `--dev --bind 0.0.0.0`; the prod override drops `--dev`. Modifying the dev compose would break the dev experience. The prod files are committed as reference but NEVER mounted by `docker-compose.yml`. The `.env.production.example` is a SEPARATE file from `.env.example` to keep the dev env clean. | The user must read the doc to know to copy the files. The doc's first section ("Prerequisites") makes this explicit. |

## Open questions resolved (from explore §4)

| # | Question | Chosen option | Rationale |
|---|---|---|---|
| 1 | TLS termination point | **Caddy** | Simplest ACME story, single binary, no cron. |
| 2 | Subdomain strategy | **`livekit.medico-consulta.com`** | CORS isolation; path-based impossible on Vercel. |
| 3 | Cert issuer | **Caddy's built-in ACME / Let's Encrypt HTTP-01** | Zero config; DNS-01 documented as alternative. |
| 4 | Deploy target | **Single VPS with docker compose** | Matches dev maturity; k8s is documented as future. |
| 5 | DNS provider | **n/a — user-supplied** | The doc shows the A record setup generically. Any DNS provider works. |
| 6 | Where does Next.js live in prod? | **Vercel (confirmed)** | Webhook URL is the public Vercel URL. |
| 7 | Memory limits / restart policy | **YES — `mem_limit: 512m`, `restart: always`** | Documented as tuning knobs. |
| 8 | `LIVEKIT_DOMAIN` / `LIVEKIT_NODE_IP` | **`node_ip: ${LIVEKIT_NODE_IP}`** (env-driven) | User sets to VPS public IP or DDNS hostname. |
| 9 | UDP port 7882 exposure | **VPS firewall opens 7882/UDP directly** | Reverse proxies cannot proxy UDP. |
| 10 | Separate `docs/livekit-prod.md` or extend `docs/livekit.md`? | **NEW `docs/livekit-prod.md`** (D7) | Dev doc stays short; prod doc is deep. |
| 11 | Sample config files in-repo or in-docs? | **In-repo at `docker/prod/`** (D8) | Versionable; the user can diff their changes. |
| 12 | `.env.production.example` or extend `.env.example`? | **NEW `.env.production.example`** | Keeps the dev env clean. |

## Risks (R1..R13, from explore §5)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | `--dev` flag accidentally left on in prod → LiveKit runs with permissive defaults (disables auth checks). | Medium | High | `docker/prod/docker-compose.override.yml` command block does NOT include `--dev`. The doc has a "before you ship" checklist that calls this out explicitly. The override file has a comment `DO NOT ADD --dev HERE` next to the command. |
| **R2** | Cert expiry without auto-renewal → LiveKit signaling goes down → all calls drop. | Low | High | Caddy's built-in ACME auto-renews at 60 days (30 days before expiry). The doc shows how to verify renewal works: `docker logs caddy` shows renewal attempts. The Troubleshooting section covers "cert expired" with the manual recovery steps. |
| **R3** | Webhook URL unreachable from LiveKit container → silent failure → no auto-complete. | Low | Medium | The webhook URL is the public Vercel URL, which is reachable from any VPS with default egress. The doc has a smoke-test step: `docker exec medico-livekit wget -qO- <webhook-url>` returns 401 (which is correct — the route handler rejects unsigned probes). The runbook includes a "verify the webhook fires" section. |
| **R4** | TURN over TLS (RFC 6062) not implemented → users on restrictive networks fail to connect. | Medium | Medium | OUT OF SCOPE per `livekit-turn-prod`. The doc explicitly links to the follow-up change. UDP-direct works for ~85% of clients. |
| **R5** | Subdomain vs shared domain affects cookie scope + CORS. | Low | Low | Subdomain is the default; the doc explains that the browser treats `livekit.medico-consulta.com` as a separate origin. No shared cookies; the `access_token` JWT carries the auth. |
| **R6** | Prod secrets management — `LIVEKIT_API_SECRET` rotation if compromised. | Low | High | D14 documents the rotation runbook. The doc recommends a password manager (1Password, Bitwarden) or Doppler/Vault for the secret. The `.env.production.example` has placeholder values; the real secret never enters the repo. |
| **R7** | `NEXT_PUBLIC_LIVEKIT_URL` is build-time inlined. Setting it as a Vercel runtime env var does NOT work. | High | High | The runbook has a dedicated "Vercel env vars" section that explains build-time vs runtime. The Troubleshooting section covers "calls connect to localhost" with the fix (re-deploy Vercel after setting the env var, not just restart the app). |
| **R8** | HSTS header (`max-age=63072000; includeSubDomains; preload`) in `next.config.ts` means the browser REFUSES to load `livekit.medico-consulta.com` over plain HTTP. | Low | Medium | Caddy forces HTTPS, so the cert must be valid before the first browser load. The doc warns: "make sure Caddy's first cert issuance succeeds BEFORE pointing users at the subdomain". The Troubleshooting section covers "HSTS blocks my dev sandbox" with a `Clear-Site-Data` workaround for dev only. |
| **R9** | `livekit-server` image is `latest` (rolling tag). A breaking change in the image could break prod. | Low | High | OUT OF SCOPE per `livekit-pin-image`. The `.env.production.example` does NOT pin the image; the override file's `image:` field is the same as dev (`livekit/livekit-server:latest`). The user can pin manually by replacing with a digest. |
| **R10** | No memory limits on LiveKit container — OOM risk under load. | Medium | Medium | D13 sets `mem_limit: 512m`. Documented as a tuning knob; a busy clinic may need 1g. The Troubleshooting section covers "LiveKit OOM-killed" with the increase-memory fix. |
| **R11** | UDP port 7882 cannot go through a reverse proxy — misconfigured firewall → WebRTC media fails. | Medium | High | The doc has a dedicated "Firewall" subsection in Prerequisites that shows the exact `ufw` commands: `ufw allow 80/tcp`, `ufw allow 443/tcp`, `ufw allow 7882/udp`. The Troubleshooting section covers "calls connect but no audio/video" → check the firewall. |
| **R12** | Container's internal IP is not the public IP → SDP negotiation advertises a private IP → WebRTC fails. | Medium | High | D6 + AD-3: `node_ip: ${LIVEKIT_NODE_IP}` in `livekit.yaml`. The `.env.production.example` documents the var. The Troubleshooting section covers "WebRTC fails to negotiate" → check `node_ip`. |
| **R13** | Base64-encoded secret requirement (when `--dev` is removed) is a footgun — user pastes literal secret instead of base64 → 401 on every call. | High | Medium | D12: the doc shows the `echo -n "your-secret" | base64` step explicitly, with a copy-pasteable command. The Troubleshooting section covers "401 on every call" → check that the secret is base64-encoded. |

## Capabilities (contract with sdd-spec)

### New Capabilities

None. The change lives entirely inside the existing `livekit-infrastructure` capability, which already has a line (135) that requires this documentation. No new spec is needed; the change adds ONE requirement to the existing spec (see below).

### Modified Capabilities (delta specs)

- `livekit-infrastructure`: ADDED requirement `REQ-LI-PROD-1` — the prod env var matrix (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_WEBHOOK_URL`, `CADDY_DOMAIN`, `CADDY_EMAIL`, `LIVEKIT_NODE_IP`), the `--dev` removal rule, the TLS termination via reverse proxy, the cert automation (Let's Encrypt via ACME), the prod webhook URL pointing to the public Vercel URL, the `restart: always` + `mem_limit: 512m` rules, the `node_ip` config block, the UDP 7882 firewall rule. The requirement MUST also state that the spec line 135 is now RESOLVED.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/livekit-prod.md` | New | Production deploy doc, ~280 lines (D7, AD-6). |
| `docker/prod/Caddyfile` | New | Caddy v2 config, ~30 lines (D1, AD-1). |
| `docker/prod/livekit.yaml` | New | Prod LiveKit config, ~40 lines (D11, D12, AD-3). |
| `docker/prod/docker-compose.override.yml` | New | Prod compose overlay, ~50 lines (D11, D13, AD-2). |
| `.env.production.example` | New | Prod env var matrix, ~30 lines (AD-5). |
| `docs/livekit.md` | Modified | +3 lines, bridge link to prod doc in section 5 (AD-7). |
| `openspec/changes/livekit-tls-prod/specs/livekit-infrastructure/spec.md` | New (delta) | ADDED requirement `REQ-LI-PROD-1`. |
| `openspec/specs/livekit-infrastructure/spec.md` | Reference only | Mark line 135 requirement as RESOLVED in the apply phase (no edit to the live spec until archive). |

## Out of scope / Follow-ups (affirmed from explore §6)

- TURN server (`livekit-turn-prod`) — production TURN (coturn or similar) for restrictive NAT networks. NOT in this change.
- Image pin (`livekit-pin-image`) — pin `livekit-server:latest` to a digest. NOT in this change.
- Recording / egress (`livekit-recording`) — recording webhooks (infra is in place from the webhooks change).
- `call-page-ux-redesign` — doctor UX simplification post-auto-complete.
- `cita-eventing` — Slack/email notifications on cita state changes.
- Caddyfile for the Next.js Vercel app — Vercel handles its own TLS.
- Cert-manager / k8s — single-VPS assumption holds.
- DDoS protection — Cloudflare in front is a user choice; the doc mentions it but does not implement it.
- HSTS preload registration — already set in `next.config.ts`; the actual submission to the HSTS preload list is a Chrome-side process.
- Multi-region LiveKit — single-region is fine for MVP.
- LiveKit autoscaling — VPS + docker compose is the dev-stage target.

## LOC estimate

| File | Lines | Type |
|---|---|---|
| `docs/livekit-prod.md` | ~280 | New doc |
| `docker/prod/Caddyfile` | ~30 | New config |
| `docker/prod/livekit.yaml` | ~40 | New config |
| `docker/prod/docker-compose.override.yml` | ~50 | New config |
| `.env.production.example` | ~30 | New env example |
| `docs/livekit.md` | +3 | Modified (bridge link) |
| `openspec/changes/livekit-tls-prod/specs/livekit-infrastructure/spec.md` | ~30 | New (delta) |
| **Total** | **~463** | All new + 1 trivial edit |

## Review workload forecast

| Files | LOC est. | 400-line risk | 800-line risk | Decision |
|---|---|---|---|---|
| 7 (6 new + 1 modified) | ~463 | OK | OK | **Single PR** (under both caps) |

No chained PR needed. The 400-line chained-pr threshold is the soft trigger; this is comfortably under 800 with a clean natural seam (docs vs sample configs) only if a future amendment requires it. Today, single PR.

## Rollback plan

This change ships docs + sample configs only. The dev workflow is unaffected. To "roll back":

1. Delete the `openspec/changes/livekit-tls-prod/` folder.
2. Delete the 5 new files (`docs/livekit-prod.md`, `docker/prod/Caddyfile`, `docker/prod/livekit.yaml`, `docker/prod/docker-compose.override.yml`, `.env.production.example`).
3. Revert the 3-line change in `docs/livekit.md` (remove the bridge link).
4. The `openspec/specs/livekit-infrastructure/spec.md` reverts to the current state (line 135 reverts from RESOLVED to its current "MUST be documented, out of scope" wording — but since the spec is only updated in the apply phase, this is automatic on rollback).

The dev compose, dev env, dev LiveKit config, and the running Next.js app are untouched. The only user-visible change is the bridge link in `docs/livekit.md`, which is a hyperlink, not a code change.

## Success criteria

- [ ] `docs/livekit-prod.md` exists and covers all 7 sections from AD-6.
- [ ] `docker/prod/Caddyfile` exists, is valid Caddy v2 syntax, and includes ACME config.
- [ ] `docker/prod/livekit.yaml` exists, does NOT use `--dev` shorthand, includes `node_ip` block, includes `webhook:` block with `${LIVEKIT_WEBHOOK_URL}` env indirection.
- [ ] `docker/prod/docker-compose.override.yml` exists, does NOT include `--dev` in the command, sets `restart: always` and `mem_limit: 512m` (or a documented alternative).
- [ ] `.env.production.example` exists and documents all 7 env vars (AD-5).
- [ ] `docs/livekit.md` has a 1-paragraph bridge link to the new prod doc in section 5.
- [ ] `openspec/changes/livekit-tls-prod/specs/livekit-infrastructure/spec.md` exists and contains `REQ-LI-PROD-1` with all 8 sub-rules (env matrix, `--dev` removal, TLS termination, cert automation, prod webhook URL, healthcheck/restart/memory, `node_ip`, UDP 7882).
- [ ] The dev workflow (`docker compose up -d livekit`, `pnpm dev`) is unaffected — the dev compose does NOT mount anything from `docker/prod/`.
- [ ] The 800-line review budget is respected (single PR, ~463 lines).

## Decision needed before apply

No. All 8 open questions are resolved (D1-D8). All 14 implementation decisions are committed (D9-D14). All 8 architecture decisions are committed (AD-1-AD-8). The 12 risks are mitigated in the doc + sample configs.

## Chain strategy

`stacked-to-main` (single PR). The change is under 800 lines, has no natural mid-PR seam, and the dev workflow is unaffected. Single PR is the correct strategy; chained-PR is only triggered if a future amendment pushes the diff over 800.

## Adjacent changes (NOT in scope, see Out of scope)

- `livekit-turn-prod`
- `livekit-pin-image`
- `livekit-recording`
- `call-page-ux-redesign`
- `cita-eventing`
