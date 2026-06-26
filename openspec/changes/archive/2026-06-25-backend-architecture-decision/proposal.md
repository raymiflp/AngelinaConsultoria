# Proposal: Backend Architecture Decision — Vercel-Only

## Change name

`backend-architecture-decision` (folder: `backend-architecture-decision/`, no date prefix — this is a ratification change, not an implementation; the implementation lives in `migrate-managed-services`).

## Intent

This change formalizes the architectural decision that has been implicit in the project since the first deploy attempt: **the angelina-consultoria platform deploys exclusively to Vercel + managed equivalents**. There is no separate backend host, no long-running server process outside Vercel's serverless runtime, and no VPS for application workloads. The LiveKit SFU and Redis and Postgres and object storage are either Vercel-managed or third-party SaaS.

The decision was already encoded in the existing `openspec/changes/migrate-managed-services/proposal.md` (167 lines, written before this proposal), which proposes killing self-hosted Postgres, Redis, LiveKit, MinIO, and MeiliSearch in favor of Vercel Postgres, Upstash REST, LiveKit Cloud, Vercel Blob, and (for the dropped services) deletion. That proposal has been in flight since 2026-06-23 with no specs/tasks/apply yet. This ratification ADR closes the decision-making loop BEFORE the implementation cycle resumes, so future contributors and the migration team have a single canonical record of why the project is Vercel-only.

The user-visible outcome of this change: a new Architecture Decision Record at `docs/architecture/decisions/0001-vercel-only.md` that future contributors can cite when they ask "why don't we run our own Redis / our own SFU / a separate Node service for sockets?" The ADR also becomes the source of truth that the `migrate-managed-services` change's apply phase must conform to — if the apply drifts from the ADR's implications, that's a verification failure.

This change produces **one new file** (the ADR) and **one doc cross-link edit** (the `AGENTS.md` deployment section gets a pointer to the ADR). No code changes. No env var changes. No package.json changes. The implementation work stays in `migrate-managed-services`.

## Why

The architecture question has surfaced three times in the project so far:

1. **Initial scaffold** (`2026-06-12-init-infra`): chose Docker Compose for local dev. Self-hosting for prod was not explicitly decided — it was assumed.
2. **LiveKit TLS prod** (`2026-06-20-livekit-tls-prod`): archived change introduced Caddy + VPS + cert automation for the self-hosted LiveKit container. This was a workaround for "we self-host LiveKit," not a decision that we should self-host it.
3. **migrate-managed-services** (`2026-06-23`, in flight): proposed killing self-hosting in favor of managed services. The proposal exists but the architectural WHY was buried in a 167-line implementation document. No ADR.

The cost of NOT having an ADR is concrete: every new contributor (and every future me, after a context gap) re-asks "why don't we just run our own Postgres on a $5/mo VPS?" without a single document to point them at. The `livekit-tls-prod` change is a fossil of a previous assumption (self-host LiveKit) that is now being reversed. Without an ADR, the next contributor who reads `docs/livekit-prod.md` will assume self-hosting is the direction.

The decision is also grounded in **evidence about what the code actually uses today**:

| Dependency | Declared in `package.json` | Imported in `src/` | Verdict |
|------------|----------------------------|---------------------|---------|
| `socket.io` + `socket.io-client` | Yes | **Zero imports** | Dead dependency — never used |
| `meilisearch` | Yes | **Zero imports** | Dead dependency — never used |
| `minio` client | No client lib (env-only) | **Zero imports** | Aspirational — never used |
| `ioredis` | Yes | Active (cache, rate-limiter, webhookDedupe) | Replaceable with Upstash REST |
| `livekit-server-sdk` | Yes | Active (eager init in `livekit-server.ts`) | Replaceable with LiveKit Cloud (same SDK) |
| `postgres-js` + Drizzle | Yes | Active (whole app) | Compatible with Vercel Postgres via `?pgbouncer=true&connection_limit=1` |

Three of the five "self-hosted services" are **declared but never used**. They are dead weight masquerading as architecture. The ADR ratifies the decision to delete them, replacing the live ones with managed equivalents.

## Scope

### In scope

- **`docs/architecture/decisions/0001-vercel-only.md`** — NEW. The ADR body. ~80 lines. Follows the MADR template (Context, Decision, Consequences, Alternatives Considered). References the `migrate-managed-services` proposal as the implementation source.
- **`docs/architecture/decisions/README.md`** — NEW. ~15 lines. Index of ADRs (currently just one). Explains the ADR process for future decisions.
- **`AGENTS.md`** — MODIFIED. Add one bullet under the "Architecture facts agents miss" section pointing to `docs/architecture/decisions/0001-vercel-only.md` as the source of truth for the Vercel-only decision.
- **`openspec/changes/backend-architecture-decision/specs/architecture-decisions/spec.md`** — NEW (delta spec). One ADDED requirement: `REQ-ADR-1` covering the ADR's existence, content, and cross-link from `AGENTS.md`.
- **`openspec/changes/backend-architecture-decision/design.md`** — The ADR content (the design IS the decision).
- **`openspec/changes/backend-architecture-decision/tasks.md`** — Implementation tasks (write ADR, update AGENTS.md, write spec, verify).

### Out of scope

- **Killing self-hosted services** — owned by `migrate-managed-services`.
- **Replacing Redis with Upstash** — owned by `migrate-managed-services`.
- **Replacing LiveKit with LiveKit Cloud** — owned by `migrate-managed-services`.
- **Replacing MinIO with Vercel Blob** — owned by `migrate-managed-services`.
- **Deleting `docker-compose.yml`** — owned by `migrate-managed-services` (it removes the `livekit`, `minio`, `meilisearch` services but keeps `postgres` and `redis` for local dev; that's the migrate change's call to make).
- **Deleting `docs/livekit-prod.md`** — owned by `migrate-managed-services`.
- **Migrating `NEXT_PUBLIC_LIVEKIT_URL` from `ws://localhost:7880` to `wss://...`** — owned by `migrate-managed-services` (values change; the build-time-inlined warning was already documented by `deployment-foundation`).
- **Custom domain** — explicitly a non-goal per the migrate-managed-services proposal (`use .vercel.app preview URL`).

## Decisions (D1..D4)

| ID | Decision | Rationale |
|---|---|---|
| **D1** | **Deployment topology is Vercel-only.** Next.js on Vercel Functions; Postgres on Vercel Postgres; Redis on Upstash REST; LiveKit on LiveKit Cloud; object storage on Vercel Blob. No VPS, no Docker in prod. | Three of five self-hosted services are declared-but-unused (socket.io, meilisearch, minio client). The two active ones (Redis, LiveKit) have drop-in managed replacements with the same SDK surface. A medical consultation platform benefits from managed-service SLAs over self-host reliability — uptime matters more than infrastructure control at this stage. |
| **D2** | The ADR is **ratification, not origination**. The decision was implicit in `migrate-managed-services/proposal.md` since 2026-06-23; this change makes it explicit and adds the ADR document future contributors can cite. | Re-deriving the decision in this proposal would create two competing rationale documents. Ratification is honest about the timeline and avoids drift between the ADR's "why" and the migrate proposal's "what." |
| **D3** | **ADR lives at `docs/architecture/decisions/NNNN-<slug>.md`** following the MADR template (https://adr.github.io/madr/). The folder is referenced from `AGENTS.md`. | MADR is a widely-recognized template; the `NNNN-` prefix keeps ADRs in chronological order; the `docs/` location is consistent with `docs/dev-setup.md`, `docs/deployment.md`, `docs/livekit.md`. `AGENTS.md` is the entry point every contributor (and agent) reads first. |
| **D4** | **Implementation stays in `migrate-managed-services`.** This change does NOT modify `src/`, `docker-compose.yml`, `package.json`, env files, or any deploy artifact. | Keeping the ratification cycle pure (doc-only) means a single reviewable diff and zero risk of touching the runtime. The migrate-managed-services change handles all the breaking-work in its own PR. |

## Capabilities

This change creates one new capability:

- **`architecture-decisions`** — NEW. Covers the existence, structure, and discoverability of Architecture Decision Records in this repo. The first ADR (`0001-vercel-only.md`) is referenced but its content is captured in this change's `design.md` for traceability, not duplicated into the spec.

No existing capabilities are MODIFIED.

## Consequences

### Positive

- **Single source of truth** for the Vercel-only decision. Future contributors (and future me, post-compaction) can read `docs/architecture/decisions/0001-vercel-only.md` and not re-derive the rationale.
- **Reduced dead-weight in `package.json`**: `socket.io`, `socket.io-client`, `meilisearch` (and the `serverExternalPackages` entry in `next.config.ts`) become candidates for deletion by `migrate-managed-services`.
- **No VPS operational burden**: cert renewal, security patches, backups, monitoring, firewall — all delegated to managed providers.
- **Better Vercel cold-start behavior**: Upstash REST is zero-connection; Vercel Postgres pooler handles connection bursts; LiveKit Cloud absorbs the SFU operational cost.

### Negative

- **Vendor lock-in to Vercel + Upstash + LiveKit Cloud**. Migration to a self-hosted stack in the future would require re-deriving the inverse of this ADR. Cost: ~2 weeks of focused engineering (estimated by reading the `migrate-managed-services` proposal in reverse).
- **Data residency concerns** for a medical platform. Vercel Postgres + Upstash + LiveKit Cloud are US-default regions; if EU data residency becomes a requirement, the ADR must be revisited (livekit-infrastructure spec already documents the cert + region constraints).
- **Per-request cost** instead of fixed VPS cost. At low traffic this is cheaper; at high traffic it can exceed a $20/mo VPS. Documented as a tradeoff in the ADR body.

### Neutral

- The `docker-compose.yml` stays for local dev (postgres + redis only after migrate-managed-services lands). No change to the dev experience.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Future contributor ignores the ADR and re-proposes self-hosting | Medium | The ADR is referenced from `AGENTS.md` (the entry point). Any new proposal that contradicts the ADR must explicitly call out the override. |
| `migrate-managed-services` implementation drifts from the ADR's implications | Low | The verify phase of `migrate-managed-services` will check that the apply respects the ADR (no leftover VPS files, no `socket.io` import restored). |
| ADR becomes stale as the platform evolves | Medium | Future architectural pivots MUST add a new ADR (`0002-...`) rather than editing `0001` in place. The ADR template records "Date" and "Status" fields; an ADR marked "Superseded by 0002" stays in the folder for history. |
| Data residency / compliance review rejects Vercel-only | Low | Out of scope for MVP. If a compliance review rejects, the ADR is superseded; this is the planned escape hatch. |

## Rollback plan

This change produces 2 new files (`0001-vercel-only.md`, `README.md`) and 1 modified file (`AGENTS.md`, +1 line). All reversible by `git revert`. No data loss, no runtime impact, no migration to roll back. The ADR is pure documentation.

If `migrate-managed-services` is later abandoned (decision reversed), this ADR must be either superseded by `0002-self-hosted.md` or marked as "Superseded" — it must NOT be deleted. History is the point of an ADR.
