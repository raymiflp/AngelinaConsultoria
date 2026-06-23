# Tasks: LiveKit Production TLS Deployment

**Change**: `livekit-tls-prod`
**Capability**: `livekit-infrastructure` (delta — REQ-LI-PROD-1)
**Mode**: A2 auto (DO NOT PAUSE) | Artifact store: openspec | Review budget: 800 lines
**Spec**: `openspec/changes/livekit-tls-prod/specs/livekit-infrastructure/spec.md` (145L)
**Proposal**: `openspec/changes/livekit-tls-prod/proposal.md` (D1..D14, AD-1..AD-8)
**Design**: `openspec/changes/livekit-tls-prod/design.md` (677L, 14 sections)

---

## Change overview

This change ships the production TLS deployment for the self-hosted LiveKit SFU that medico-consulta runs in Docker. The dev workflow uses `ws://localhost:7880` (browser exempts `localhost` from the secure-context rule), but a production browser visiting `medico-consulta.com` will refuse `getUserMedia()` against a `ws://` URL. The existing `livekit-infrastructure` spec line 135 already acknowledges the gap ("Production override is out of scope for this change but MUST be documented in `docs/livekit.md`"); this change closes that placeholder.

The change is **documentation + sample configuration only**. It produces 5 new files (`docs/livekit-prod.md`, `docker/prod/Caddyfile`, `docker/prod/livekit.yaml`, `docker/prod/docker-compose.override.yml`, `.env.production.example`) and one 3-line bridge link in the existing `docs/livekit.md`. **Zero Next.js code changes. Zero LiveKit code changes. Zero changes to the dev `docker-compose.yml` or `docker/dev/livekit.yaml`. Zero new env vars in the dev workflow.** The prod artifacts are reference files the operator copies to their VPS — they are never mounted by the dev compose, never imported by the Next.js app, and never executed by CI. Total LOC: **~440 new + 3 modified = ~443**, well under both the 400-line chained-PR soft trigger and the 800-line hard cap.

---

## Review Workload Forecast

| PR | Files | LOC est. | 400-line risk | 800-line risk | Decision |
|----|-------|----------|---------------|---------------|----------|
| **Single PR** | 6 | ~440 + 3 modify = ~443 | OK | OK | **Single PR** |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low
800-line budget risk: Low
```

**Rationale**: All 6 file changes are tightly coupled (the doc references the configs by path; the compose mounts both). The natural seam is docs vs sample-configs, but the seam is shallow — splitting would force the operator to read two PRs to understand the deploy. The change is under both caps with no natural mid-PR split.

---

## Phase 1: Sample Configs (foundation — tasks 1-3 parallel-able)

- [x] **1.1** Create `docker/prod/Caddyfile` (~30L). Caddy v2: `{$CADDY_DOMAIN}` site block with `tls {$CADDY_EMAIL}`, HSTS header (`max-age=31536000; includeSubDomains; preload`), `reverse_proxy medico-livekit:7880`, `:80` block with ACME HTTP-01 + `redir https://{host}{uri} permanent`. Each line annotated with intent.
- [x] **1.2** Create `docker/prod/livekit.yaml` (~45L). Prod config: `port: 7880`, `bind_addresses: ["0.0.0.0"]`, `rtc.node_ip: ${LIVEKIT_NODE_IP}`, `rtc.tcp_port: 7881`, `rtc.udp_port: 7882`, `turn.enabled: false`, `keys.${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}` (base64), `webhook.api_key: ${LIVEKIT_API_KEY}`, `webhook.urls: [${LIVEKIT_WEBHOOK_URL:-https://medico-consulta.com/api/livekit/webhook}]`. **NO `dev: true`**. Explicit R13 base64 footgun callout.
- [x] **1.3** Create `docker/prod/docker-compose.override.yml` (~50L). `livekit` service overrides dev: `command: --node-ip ${LIVEKIT_NODE_IP} --bind 0.0.0.0 --config /etc/livekit.yaml` (**NO `--dev`**, with `DO NOT ADD --dev HERE` comment), `volumes: ./docker/prod/livekit.yaml:/etc/livekit.yaml:ro`, all 4 LiveKit env vars, `restart: always`, `mem_limit: 512m`, `healthcheck.test: ["CMD", "curl", "-f", "http://localhost:7880/"]` (interval 30s / timeout 5s / retries 3). New `caddy` service: `caddy:2-alpine`, Caddyfile mount + `caddy_data` + `caddy_config` persistent volumes, ports 80+443, `CADDY_DOMAIN` + `CADDY_EMAIL` env, `healthcheck.test: ["CMD", "wget", "-qO-", "http://localhost:80/"]`, `depends_on: livekit`, `mem_limit: 128m`.

## Phase 2: Env & Documentation (depends on Phase 1)

- [x] **2.1** Create `.env.production.example` (~35L). Document all 7 vars (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_WEBHOOK_URL`, `CADDY_DOMAIN`, `CADDY_EMAIL`, `LIVEKIT_NODE_IP`) with placeholders + comments explaining build/runtime distinction (R7: `NEXT_PUBLIC_*` MUST be build-time on Vercel), base64 vs raw (R13: VPS side stores base64; Vercel side stores raw), and Vercel vs VPS placement. Section header: `DO NOT COMMIT .env.production — keep secrets out of git`.
- [x] **2.2** Create `docs/livekit-prod.md` (~280L). 7 sections in chronological deploy order: (1) Prerequisites — VPS, DNS, `ufw allow 80/tcp`, `443/tcp`, `7882/udp`; (2) Deployment Topology — ASCII diagram from design §2; (3) Caddy + LiveKit compose — copy-paste `docker compose -f ... -f docker/prod/docker-compose.override.yml up -d`; (4) LiveKit prod config — annotated walkthrough of `docker/prod/livekit.yaml` with `echo -n "secret" | base64` R13 callout; (5) Webhook URL — smoke test `curl -X POST .../webhook -H "Authorization: Bearer test" -d '{}'` expects 401 + live-test instructions; (6) Secrets & Rotation — 8-step runbook for `LIVEKIT_API_SECRET` rotation (openssl rand → edit yaml → edit .env → edit Vercel → redeploy → restart → verify); (7) Runbook & Monitoring — `docker compose logs -f caddy medico-livekit`, `caddy list-certificates`, cert-expiry check, Troubleshooting entries (R7/R11/R12/R13).
- [x] **2.3** Modify `docs/livekit.md` (+3L). At the top of section 5 (Webhooks), add a 1-paragraph bridge link: `> See [docs/livekit-prod.md](./livekit-prod.md) for production deployment (VPS, TLS, cert automation, `--dev` removal, secrets rotation).`

## Phase 3: Verification (depends on Phase 1 + 2)

- [x] **3.1** Run the 8 static checks from design §12:
  - [x] `docs/livekit-prod.md` exists and contains all 7 sections
  - [x] `docker/prod/Caddyfile` parses as valid Caddy v2 (`caddy validate --config ...`)
  - [x] `docker/prod/livekit.yaml` parses as valid YAML AND contains no `dev: true` key
  - [x] `docker-compose.override.yml` parses as valid Compose v2 AND `livekit` service `command:` contains no `--dev`
  - [x] `.env.production.example` documents all 7 env vars
  - [x] `docs/livekit.md` has the +3-line bridge link at the top of section 5
  - [x] `grep -r 'dev: true' docker/prod/` returns no matches
  - [x] `grep -r -- '--dev' docker/prod/docker-compose.override.yml` returns no matches
- [ ] **3.2** (Manual, post-deploy) Run the 13-step smoke test from design §11 on the operator's VPS: provision VPS → set DNS A record → install Docker → `ufw allow 80/tcp 443/tcp 7882/udp` → clone repo → edit `.env.production` → `docker compose up -d` → verify cert issued (`curl -sI https://livekit.<domain>/`) → verify webhook reaches Vercel (`curl -X POST .../webhook -H "Authorization: Bearer test" -d '{}'` expects 401) → set Vercel env vars (BUILD scope for `NEXT_PUBLIC_*`) → redeploy Vercel → end-to-end call test (open ONLINE cita, join from 2 tabs, leave → cita transitions to `COMPLETADA`) → set cert-expiry calendar reminder.

---

## Cross-cutting commit shapes (for when this lands in git)

> **Note**: medico-consulta is NOT currently a git repo. These are the conceptual commit shapes for the git-import moment. Each is a logical work unit that could become a commit on the day the repo is `git init`'d.

| Task | Commit shape |
|------|--------------|
| 1 | `feat(docker): add Caddyfile for LiveKit prod HTTPS termination` |
| 2 | `feat(docker): add prod livekit.yaml without --dev flag and base64 keys` |
| 3 | `feat(docker): add prod docker-compose override with caddy and livekit services` |
| 4 | `chore(env): add .env.production.example for LiveKit prod deployment` |
| 5 | `docs(livekit): add livekit-prod.md runbook for production deployment` |
| 6 | `docs(livekit): add bridge link to livekit-prod.md` |
| 7 | *(verification gate — no commit; static checks + manual smoke test)* |

**Single-PR strategy**: the entire change is one logical unit ("stand up prod TLS"). Splitting into 7 micro-commits would force 7 PRs of ~30-280 lines each — review overhead exceeds the savings. On the day medico-consulta becomes a git repo, the recommended move is `git init && git add . && git commit -m "feat(infra): livekit prod TLS deployment (Caddy + ACME + --dev removed)"` as a single squashed commit, with the per-file attribution preserved in the commit body.

---

## Open dependencies

**None.** All required changes are within this change. Adjacent changes are explicitly OUT of scope:

- `livekit-webhooks` (archived 2026-06-19) — provides the `/api/livekit/webhook` route handler that the prod webhook URL points to. Already in place.
- `livekit-turn-prod` — follow-up for TURN (coturn) support. OUT of scope here.
- `livekit-recording` — follow-up for egress/recording webhooks. OUT of scope here.
- `livekit-pin-image` — follow-up to pin `livekit-server:latest` to a digest. OUT of scope here.
- `call-page-ux-redesign` — doctor UX simplification. OUT of scope here.
- `cita-eventing` — Slack/email notifications. OUT of scope here.

---

## Out of scope reminders (from design §13 + proposal)

1. **TURN server** (`livekit-turn-prod`) — `turn.enabled: false` in prod YAML is the placeholder.
2. **Image pin** (`livekit-pin-image`) — `livekit-server:latest` rolling tag is accepted risk (R9).
3. **Recording / egress** (`livekit-recording`) — webhook infra already in place from `livekit-webhooks`.
4. **call-page-ux-redesign** — doctor UX post-auto-complete.
5. **cita-eventing** — Slack/email notifications on cita state changes.
6. **k8s / cert-manager / multi-host** — single-VPS + docker compose is the dev-stage target. k8s port noted as future work.

Additional non-goals (also out of scope): Caddy for the Next.js Vercel app (Vercel handles its own TLS), DDoS protection (Cloudflare-in-front is a user choice), HSTS preload registration (Chrome-side process), multi-region LiveKit, code changes to `src/**`, modifications to `docker-compose.yml` or `docker/dev/livekit.yaml`, new env vars in `.env.example`.

---

## Decisions made during planning

**None.** All 14 implementation decisions (D1-D14) and 8 architecture decisions (AD-1-AD-8) from the proposal are honored verbatim. All 8 sub-rules + 9 scenarios from the spec map 1:1 to the 7 tasks. No new decisions introduced at the tasks phase.

---

## Summary for orchestrator

- **Tasks file**: `openspec/changes/livekit-tls-prod/tasks.md` (this file)
- **Mode**: auto / 800-line budget / stacked-to-main
- **Delivery**: Single PR (~443 lines), under both 400 and 800 caps. No chained PR needed.
- **Total tasks**: 7 (3 sample configs + 3 docs/env + 1 verify)
- **Phases**: 3 (Phase 1: configs, Phase 2: docs, Phase 3: verify)
- **Implementation order**: T1 → T2 → T3 (Phase 1, parallel-able; T1+T2 must precede T3 since the compose mounts both) → T4 → T5 → T6 (Phase 2; T4+T5+T6 can run in parallel after Phase 1) → T7 (Phase 3; static checks then manual smoke test on operator's VPS)
- **Review workload forecast verdict**: Single PR is well under both caps; no chained PR needed. No decision required before apply.
- **Decision needed before apply**: No
- **Chain strategy**: `stacked-to-main` (no chain triggered)
- **Next step**: `sdd-apply` — implement Tasks 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2 in dependency order.

> Archived on 2026-06-20