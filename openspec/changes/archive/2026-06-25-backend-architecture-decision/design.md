# Design: Backend Architecture Decision (ADR-0001)

This design document IS the Architecture Decision Record. The decision is captured at `docs/architecture/decisions/0001-vercel-only.md` (the artifact), and this `design.md` is the OpenSpec-side record for traceability.

## Technical Approach

This change creates the ADR scaffolding (folder + README + first ADR) and links it from `AGENTS.md`. The ADR follows the MADR template. No code changes. The implementation that the ADR ratifies lives in the existing `openspec/changes/migrate-managed-services/` proposal.

## Architecture Decisions

### Decision: ADR template = MADR (Markdown Any Decision Records)

**Choice**: Use the MADR template (https://adr.github.io/madr/).
**Alternatives considered**: (a) Michael Nygard-style ADR (lighter, less structure); (b) Alexandrian pattern (status-led); (c) free-form Markdown.
**Rationale**: MADR's four-section structure (Context, Decision, Consequences, Alternatives Considered) forces the author to write down WHY each alternative was rejected, which is the highest-value part of an ADR. The template is widely recognized and tooling-friendly (some tools auto-extract MADR sections).

### Decision: ADR location = docs/architecture/decisions/, not openspec/specs/

**Choice**: ADRs live in `docs/architecture/decisions/`, NOT in `openspec/specs/`.
**Alternatives considered**: (a) ADRs as OpenSpec capabilities (would force a spec per decision); (b) ADRs in `docs/decisions/` (no `architecture/` parent); (c) ADRs in `openspec/decisions/`.
**Rationale**: ADRs are long-lived documentation, not testable specifications. They belong with `docs/dev-setup.md`, `docs/deployment.md`, `docs/livekit.md`. OpenSpec is for change proposals and requirements; ADRs are for context and rationale that survive spec archival.

### Decision: This change is ratification, not origination

**Choice**: The decision is presented as a ratification of the implicit decision already encoded in `migrate-managed-services/proposal.md` (dated 2026-06-23).
**Alternatives considered**: (a) Originate a new decision in this proposal; (b) Cancel `migrate-managed-services` and restart.
**Rationale**: The migrate-managed-services proposal has been in flight for 2 days. Re-deriving the decision in a new proposal would create competing rationale documents. Ratification is honest about the timeline and avoids drift.

### Decision: Implementation stays in `migrate-managed-services`, this change is doc-only

**Choice**: This change produces 3 new files (ADR, README, spec) and 1 modified file (`AGENTS.md`, +1 line).
**Rationale**: Keeping the ratification cycle pure (doc-only) means a single reviewable diff with zero runtime risk. The migrate-managed-services change handles the breaking-work in its own PR.

## ADR Content (rendered)

The ADR body is reproduced here for the SDD archive; the canonical artifact is at `docs/architecture/decisions/0001-vercel-only.md`.

---

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

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `docs/architecture/decisions/0001-vercel-only.md` | Create | The ADR body (rendered above). ~100 lines. |
| `docs/architecture/decisions/README.md` | Create | Index of ADRs + template reference + immutability rule. ~15 lines. |
| `AGENTS.md` | Modify | Add one bullet under "Architecture facts agents miss" pointing to `docs/architecture/decisions/`. |
| `openspec/changes/backend-architecture-decision/specs/architecture-decisions/spec.md` | Create | Delta spec (REQ-ADR-1, REQ-ADR-2). |
| `openspec/changes/backend-architecture-decision/design.md` | Create | This file (the ADR content + decisions). |

No source code changes. No `package.json` changes. No env var changes. No deploy config changes.

## Interfaces / Contracts

None new. The ADR documents an existing decision; it does not introduce any new external surface.

## Testing Strategy

Strict TDD is OFF per `openspec/config.yaml`. The change is documentation-only; verification is by inspection of the created files against the spec scenarios.

| Layer | Check | Approach |
|-------|-------|----------|
| Manual | ADR exists at correct path | `ls docs/architecture/decisions/0001-vercel-only.md` |
| Manual | ADR has all 5 required sections | grep for `## Context`, `## Decision`, `## Consequences`, `## Alternatives Considered`, `## References` |
| Manual | `AGENTS.md` references the ADR directory | grep for `docs/architecture/decisions` |
| Manual | `pnpm lint` and `pnpm type-check` pass (no src/ changes) | Run both commands |

## Migration / Rollout

No migration. The ADR takes effect on merge. The actual service migration (Postgres → Vercel Postgres, Redis → Upstash, etc.) is owned by `migrate-managed-services` and applied in a follow-up PR.

Rollback: `git revert <merge-sha>` reverts the 4 files in one commit. No data loss, no runtime impact.

## Open Questions

- None. The decision is ratified; the implementation roadmap is in `migrate-managed-services`.
