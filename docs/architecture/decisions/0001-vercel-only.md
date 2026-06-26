# ADR-0001: Vercel-Only Deployment

- Status: Accepted
- Date: 2026-06-25
- Deciders: project lead (ratification of pre-existing implicit decision in `migrate-managed-services`)

## Context

The angelina-consultoria platform is a medical consultation service (doctors + patients + video calls + booking). Its `package.json` declares nine external services; source-code inspection shows only four are actually wired in:

| Dependency | In `package.json` | Imported in `src/` | Notes |
|---|---|---|---|
| `socket.io` + `socket.io-client` | Yes | **0 imports** | Dead dependency — never used. Incompatible with Vercel Functions (no persistent WebSocket). |
| `meilisearch` | Yes | **0 imports** | Dead dependency — never used. |
| `minio` (env-only) | No client lib | **0 imports** | Aspirational — never used. |
| `ioredis` | Yes | Active (cache, rate-limiter, webhookDedupe) | TCP client — pays ~300ms cold-start on Vercel. |
| `livekit-server-sdk` | Yes | Active (eager init in `livekit-server.ts`) | Self-hosted via Docker + Caddy + VPS. |
| `postgres-js` + Drizzle | Yes | Active (whole app) | Self-hosted via Docker; compatible with Vercel Postgres. |
| NextAuth v5 | Yes | Active | Compatible with Vercel. |
| Sentry | Yes | Not configured | Deferred. |
| PostHog | Yes | Active | Client + server. |

A previous archived change (`2026-06-20-livekit-tls-prod`) introduced Caddy + VPS + cert automation to make the self-hosted LiveKit container production-ready. That change was a workaround for the self-hosting assumption, not a ratification of it.

A proposal in flight (`migrate-managed-services`, 2026-06-23) proposes killing self-hosting entirely. It is implementation-ready but lacks an ADR recording the architectural WHY.

## Decision

**Deploy exclusively to Vercel + managed equivalents. No VPS, no self-hosted Docker in production, no separate Node service for sockets or workers.**

The platform's runtime surface:

- **Next.js frontend**: Vercel Functions
- **Postgres**: Vercel Postgres (via `@vercel/postgres` or `postgres-js` with `?pgbouncer=true&connection_limit=1`)
- **Redis**: Upstash REST (via `@upstash/redis`)
- **Video calls (SFU)**: LiveKit Cloud (same `livekit-server-sdk`, same client)
- **Object storage**: Vercel Blob (when storage is actually needed)
- **Search**: dropped (MeiliSearch is dead weight)
- **Real-time push**: dropped (Socket.io is dead weight; LiveKit data channels cover any future need)

Local dev continues to use `docker-compose.yml` for Postgres + Redis only (post-migration). All managed-service integrations degrade gracefully when env vars are unset (existing `ioredis` pattern preserved through the migration).

## Consequences

### Positive

- Single source of truth for the Vercel-only decision (`docs/architecture/decisions/0001-vercel-only.md`).
- Zero VPS operational burden: cert renewal, security patches, backups, monitoring, firewall — all delegated to managed providers.
- Better Vercel cold-start behavior: Upstash REST is zero-connection; Vercel Postgres pooler handles connection bursts.
- ~3 packages deletable from `package.json`: `socket.io`, `socket.io-client`, `meilisearch`.
- Compliance story: managed providers carry SOC 2 / HIPAA BAA (Vercel, Upstash, LiveKit Cloud all offer HIPAA BAA on paid tiers).

### Negative

- **Vendor lock-in** to Vercel + Upstash + LiveKit Cloud. Future migration to a self-hosted stack requires re-deriving the inverse of this ADR (estimated ~2 weeks of focused engineering).
- **Data residency concerns**: Vercel Postgres, Upstash, LiveKit Cloud default to US regions. If EU data residency becomes a requirement, this ADR must be superseded.
- **Per-request cost** instead of fixed VPS cost. At low traffic this is cheaper; at high traffic it can exceed a $20/mo VPS.

### Neutral

- `docker-compose.yml` stays for local dev (Postgres + Redis only post-migration).
- No change to the dev experience.
- The `livekit-tls-prod` archived change becomes historical context; its files (`docker/prod/livekit.yaml`, `docker/prod/Caddyfile`, `docker/prod/docker-compose.override.yml`, `docs/livekit-prod.md`) are deleted by the `migrate-managed-services` apply phase.

## Alternatives Considered

### Vercel + separate backend host (Fly.io / Railway / Render / VPS)

Deploy Next.js on Vercel; deploy a long-running Node service (Socket.io + Redis workers + maybe self-hosted Postgres) on a separate host.

**Why rejected**:
- Three declared-but-unused services (`socket.io`, `meilisearch`, `minio` client) become "we use them now" retroactive justification, hiding that they were dead weight.
- Operational burden (monitoring, deploys, certs, security patches) returns — just shifted from "self-hosted SFU" to "self-hosted sidecar."
- Vercel Functions cannot maintain persistent WebSocket connections; the Socket.io sidecar would still need its own host. That's two hosts instead of zero.
- Cost: $5–$25/mo VPS + Vercel. Not meaningfully cheaper than Vercel-only at low traffic; more expensive at scale due to dual ops burden.

### Vercel + Vercel KV (Redis-compatible, Vercel-native)

Use Vercel KV instead of Upstash REST.

**Why rejected**:
- Vercel KV is built on Upstash under the hood and uses the same REST API. Choosing Upstash REST explicitly gives the same SDK with one fewer vendor (Vercel KV would be a Vercel+Upstash stack anyway).
- The `@upstash/redis` SDK is the canonical client and is what `migrate-managed-services` already proposes.

### Vercel + self-hosted Postgres (Neon, Supabase, or RDS)

Use Vercel for the app, but a managed Postgres (Neon / Supabase / RDS) instead of Vercel Postgres.

**Why rejected**:
- Vercel Postgres integration is first-class (auto-injects `POSTGRES_URL` env var, pgbouncer included, branch databases for previews).
- Neon and Supabase add a second vendor relationship without a clear win for the current scale (zero to low traffic at MVP).

## References

- Implementation: `openspec/changes/migrate-managed-services/proposal.md`
- Evidence base: `openspec/changes/migrate-managed-services/exploration.md`
- Deploy mechanics: `openspec/specs/deployment-pipeline/spec.md` (from `deployment-foundation`)
- Supersedes the implicit decision encoded by: `openspec/changes/archive/2026-06-20-livekit-tls-prod/` (self-hosted LiveKit workaround)
