# Archive Report: Backend Architecture Decision

## Change

`backend-architecture-decision` — formalize the architectural decision that the angelina-consultoria platform deploys exclusively to Vercel + managed equivalents. Ratification ADR (the implicit decision was already encoded in the in-flight `migrate-managed-services` proposal).

## Archived to

`openspec/changes/archive/2026-06-25-backend-architecture-decision/`

## Source of Truth Updated

- `docs/architecture/decisions/0001-vercel-only.md` — **NEW**. The ADR body. ~100 lines. MADR template.
- `docs/architecture/decisions/README.md` — **NEW**. ADR index + template reference + immutability rule.
- `openspec/specs/architecture-decisions/spec.md` — **NEW**. Capability spec (REQ-ADR-1, REQ-ADR-2). 10 scenarios.
- `AGENTS.md` — **MODIFIED**. +1 bullet under "Architecture facts agents miss" cross-linking the ADR directory.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `architecture-decisions` | Created | 2 requirements, 10 scenarios |

## ADR Summary (canonical at `docs/architecture/decisions/0001-vercel-only.md`)

**Decision**: Deploy exclusively to Vercel + managed equivalents. No VPS, no self-hosted Docker in production, no separate Node service for sockets or workers.

**Key evidence**:
- Three declared-but-unused services (`socket.io`, `meilisearch`, `minio` client) are dead weight in `package.json`
- LiveKit self-hosting operational burden is replaceable by LiveKit Cloud (same SDK)
- ioredis TCP cold-start ~300ms is replaceable by Upstash REST (zero-connection)

**Rejected alternatives**:
1. Vercel + separate backend host (Fly.io / Railway / VPS) — doesn't actually reduce ops burden; reintroduces dual-vendor complexity
2. Vercel + Vercel KV — same Upstash underneath, less explicit
3. Vercel + Neon/Supabase Postgres — Vercel Postgres integration is first-class

## Archive Contents

- `proposal.md` ✅
- `specs/architecture-decisions/spec.md` ✅
- `design.md` ✅ (contains the ADR body verbatim for traceability)
- `tasks.md` ✅ (4 tasks, all `[x]`)

## Implementation Files Shipped

- `docs/architecture/decisions/0001-vercel-only.md` — new
- `docs/architecture/decisions/README.md` — new
- `AGENTS.md` — modified (+1 bullet)

## Diff Statistics

- 3 files changed: 2 new (~115 lines), 1 modified (+1 line)
- Total: ~116 lines (well under 800-line review budget)

## Verify Result

PASS. All 4 tasks completed; pnpm lint + pnpm type-check both exit 0; all required sections present in the ADR; AGENTS.md cross-link confirmed.

## SDD Cycle Complete

✅ proposal → specs → design → tasks → apply → verify → archive

## Next Steps

The decision is now formal and discoverable. The next change is `migrate-managed-services` (already in flight at `openspec/changes/migrate-managed-services/`) — its spec/design/tasks/apply/verify/archive cycle will implement the consequences ratified by ADR-0001.
