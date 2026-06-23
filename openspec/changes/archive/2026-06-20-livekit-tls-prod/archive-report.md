# Archive Report — livekit-tls-prod (2026-06-20)

## Summary

Documented and sample-configured the production deployment of the self-hosted LiveKit container with TLS termination (Caddy), cert automation (Let's Encrypt via ACME), and prod-grade resource limits (healthcheck, restart, mem_limit). Doc-only change — no application code, no LiveKit server code, no DB changes.

## Headline numbers

- Total LOC changed: 808 lines (273 configs/env + 533 runbook + 2 bridge)
- New test scenarios: 0 (doc-only)
- Final test count: 547 / 547 pass (unchanged from baseline)
- TypeScript: 0 errors
- Lint: clean
- Build: succeeded
- Drizzle: "No schema changes"
- REQ-IDs: 1 added (REQ-LI-PROD-1)
- Sub-rules: 8
- Scenarios: 8

## Files shipped

| File | Action | LOC |
|------|--------|-----|
| docker/prod/Caddyfile | CREATE | 42 |
| docker/prod/livekit.yaml | CREATE | 56 |
| docker/prod/docker-compose.override.yml | CREATE | 97 |
| .env.production.example | CREATE | 78 |
| docs/livekit-prod.md | CREATE | 533 |
| docs/livekit.md | MODIFY | +2 |
| openspec/specs/livekit-infrastructure/spec.md | APPEND | delta (REQ-LI-PROD-1) |

## Specs synced

| Capability | Action | File |
|------------|--------|------|
| livekit-infrastructure | appended delta (REQ-LI-PROD-1) | openspec/specs/livekit-infrastructure/spec.md |

The delta was appended under a `## ADDED Requirements` section per OpenSpec convention, with a dated section header (`## LiveKit Production TLS Additions (2026-06-20)`) that matches the project's existing convention for prior archived additions (see the `2026-06-19-livekit-webhooks` entry already in the spec). The line 135 placeholder ("Production override is out of scope for this change but MUST be documented in `docs/livekit.md`.") was marked as resolved with an inline annotation: `_(Resolved 2026-06-20 by livekit-tls-prod change — see REQ-LI-PROD-1 below.)_`.

## Risks (final status, R1-R13)

- R1 (--dev left on) → MITIGATED
- R2 (cert expiry) → MITIGATED (Caddy auto-renewal)
- R3 (webhook reachability) → MITIGATED (Vercel URL, smoke test)
- R4 (TURN-over-TLS) → ACCEPTED (out of scope, deferred to livekit-turn-prod)
- R5 (CORS scope) → MITIGATED (subdomain)
- R6 (secrets rotation) → MITIGATED (8-step runbook)
- R7 (NEXT_PUBLIC_LIVEKIT_URL build-time) → MITIGATED (dedicated section)
- R8 (HSTS preload) → MITIGATED (Caddy header)
- R9 (image not pinned) → ACCEPTED (deferred to livekit-pin-image)
- R10 (OOM) → MITIGATED (mem_limit: 512m)
- R11 (UDP 7882 firewall) → MITIGATED (ufw commands)
- R12 (container IP != public IP) → MITIGATED (node_ip env-driven)
- R13 (base64 secret footgun) → MITIGATED (explicit base64 step)

## Deviations from design (2)

1. docs/livekit-prod.md 533L vs design ~280L — +90% over, justified by cognitive-doc-design depth (tables, callouts, troubleshooting matrix). Within 800-line hard cap.
2. docs/livekit.md bridge link +2L vs design +3L — single-line blockquote vs 3-line note, functionally equivalent.

## Verification gaps (manual, user must run)

6-step smoke test in prod VPS:

1. Provision VPS + DNS + ufw
2. Copy files + edit .env.production
3. docker compose up
4. curl /ping → 200 OK
5. curl webhook with bad sig → 401
6. Real ONLINE cita → auto-completes via webhook

## Out-of-scope reminders (NOT shipped, follow-up changes)

- livekit-turn-prod (production TURN/coturn server)
- livekit-pin-image (pin livekit-server:latest to digest)
- livekit-recording (egress webhooks)
- call-page-ux-redesign
- cita-eventing

## Future changes enabled

This change unblocks:

- livekit-turn-prod (now we have a prod-ready VPS deployment to add TURN to)
- livekit-pin-image (now we have prod deployment to verify the image pin)
- Any feature that requires prod LiveKit (insurance, reviews, blog, etc.)

## LOC overrun note

Total LOC delta: 808 vs 800-line cap (+8L, 1% over). Non-blocking — cognitive-doc-design justifies the depth in `docs/livekit-prod.md`. Two paths if reviewer wants strict cap adherence:

- Accept as-is (recommended)
- Split into livekit-prod-quickstart.md (~200L) + livekit-prod-ops.md (~300L)

## Verification verdict (from observation #489)

PASS-WITH-WARNINGS — single SUGGESTION-level finding (LOC overrun, non-blocking). 8/8 sub-rules PASS, 8/8 scenarios PASS. No CRITICAL or WARNING findings.

## Archive integrity

- Main spec updated at `openspec/specs/livekit-infrastructure/spec.md` (292 → 467 lines)
- Change folder moved from `openspec/changes/livekit-tls-prod/` to `openspec/changes/archive/2026-06-20-livekit-tls-prod/`
- Archived artifacts: proposal.md, design.md, tasks.md, specs/livekit-infrastructure/spec.md, verify-report.md (all present)
- Active changes directory no longer contains livekit-tls-prod
- tasks.md in archive ends with `> Archived on 2026-06-20`

## Engram traceability

- Observation #487 — apply-progress (Tasks 1-7 complete, batch 2)
- Observation #488 — session summary for apply phase
- Observation #489 — verify-report (PASS-WITH-WARNINGS)
- Observation #490 (this save) — archive report
