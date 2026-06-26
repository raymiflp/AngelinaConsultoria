# Capability: architecture-decisions

## Purpose

Define the existence, structure, and discoverability of Architecture Decision Records (ADRs) in this repository. ADRs capture the WHY behind significant architectural choices so future contributors (and future agents, post-compaction) can read the rationale without re-deriving it. Each ADR is a small, immutable document that records Context, Decision, Consequences, and Alternatives Considered for a single architectural choice. ADRs are NEVER edited in place once accepted — superseded ADRs are marked and a new ADR is written.

## Requirements

### REQ-ADR-1: Architecture Decision Records live in docs/architecture/decisions/

The repository MUST contain a `docs/architecture/decisions/` directory at the project root. Each ADR MUST be a Markdown file named `NNNN-<slug>.md` where `NNNN` is a zero-padded 4-digit sequence number (e.g., `0001-vercel-only.md`) and `<slug>` is a kebab-case summary of the decision.

The directory MUST contain a `README.md` index file that:
1. Lists every ADR in the directory by filename and one-line title.
2. States the ADR template (MADR) the project follows.
3. States the rule that ADRs are immutable once accepted; superseded ADRs get a new ADR that references them.

Each ADR MUST contain at minimum these four sections, in this order:
1. **Context** — the situation that required a decision. Includes any prior state being changed.
2. **Decision** — the choice made, stated as a single declarative sentence up top.
3. **Consequences** — Positive, Negative, and Neutral subsections.
4. **Alternatives Considered** — at least one rejected alternative with rationale for rejection.

Each ADR MUST end with a "References" section that links to:
- Any related ADRs (e.g., "Superseded by 0002-...").
- Any related OpenSpec changes (`openspec/changes/<change-name>/proposal.md`).
- Any related docs in `docs/`.

#### Scenario: ADR folder exists with README index

- GIVEN the project root
- WHEN the directory `docs/architecture/decisions/` is read
- THEN the directory MUST exist
- AND `README.md` MUST be present in the directory
- AND at least one ADR file (`0001-*.md`) MUST be present

#### Scenario: ADR follows MADR four-section structure

- GIVEN any ADR file at `docs/architecture/decisions/NNNN-*.md`
- WHEN the file is read end-to-end
- THEN it MUST contain a `## Context` section
- AND it MUST contain a `## Decision` section
- AND it MUST contain a `## Consequences` section
- AND it MUST contain a `## Alternatives Considered` section
- AND it MUST contain a `## References` section
- AND the sections MUST appear in that order (Context, Decision, Consequences, Alternatives Considered, References)

#### Scenario: ADR filename uses zero-padded sequence and kebab-case slug

- GIVEN an ADR file at `docs/architecture/decisions/`
- WHEN the filename is read
- THEN the filename MUST match the regex `^\d{4}-[a-z0-9-]+\.md$`
- AND the leading sequence MUST be a 4-digit zero-padded number

#### Scenario: AGENTS.md cross-links to the ADR directory

- GIVEN `AGENTS.md` at the project root
- WHEN the "Architecture facts agents miss" section is read
- THEN a reference to `docs/architecture/decisions/` MUST be present
- AND the reference MUST state that the directory is the source of truth for architectural decisions

#### Scenario: ADR marks superseded status without deletion

- GIVEN an ADR that has been superseded by a newer ADR
- WHEN the file is read
- THEN it MUST contain a `Status: Superseded by NNNN-<slug>` line near the top (under the title)
- AND it MUST NOT be deleted from the directory
- AND the newer ADR MUST contain a reference to the older ADR in its `References` section

### REQ-ADR-2: First ADR captures the Vercel-only deployment decision

The first ADR (`0001-vercel-only.md`) MUST exist and MUST capture the architectural decision that the angelina-consultoria platform deploys exclusively to Vercel + managed equivalents (Vercel Postgres, Upstash REST, LiveKit Cloud, Vercel Blob). The ADR MUST NOT re-derive the decision — it MUST reference `openspec/changes/migrate-managed-services/proposal.md` as the implementation source of truth.

The ADR's `Context` section MUST list the five self-hosted services that were considered (Postgres, Redis, LiveKit, MinIO, MeiliSearch) and MUST state which ones are declared-but-unused dependencies (Socket.io, MeiliSearch, MinIO client) versus actively used (Postgres, Redis, LiveKit).

The ADR's `Decision` section MUST state: "Deploy exclusively to Vercel + managed equivalents. No VPS, no self-hosted Docker in production, no separate Node service for sockets or workers."

The ADR's `Alternatives Considered` section MUST include at least one rejected alternative: "Vercel + separate backend host (Fly.io / Railway / Render) for sockets, workers, and Redis." The rejection rationale MUST cite the dead-weight evidence (three declared-but-unused services) and the operational burden.

The ADR's `References` section MUST link to:
- `openspec/changes/migrate-managed-services/proposal.md` (implementation)
- `openspec/changes/migrate-managed-services/exploration.md` (evidence base)
- `openspec/specs/deployment-pipeline/spec.md` (deploy mechanics, from `deployment-foundation`)

#### Scenario: First ADR exists and declares Vercel-only

- GIVEN `docs/architecture/decisions/0001-vercel-only.md`
- WHEN the file is read
- THEN the `Decision` section MUST contain a declarative sentence that the platform deploys exclusively to Vercel + managed equivalents
- AND the `Alternatives Considered` section MUST contain at least one rejected alternative (Vercel + separate backend)
- AND the `References` section MUST link to `openspec/changes/migrate-managed-services/proposal.md`

#### Scenario: First ADR cites the dead-weight evidence

- GIVEN `docs/architecture/decisions/0001-vercel-only.md`
- WHEN the `Context` section is read
- THEN a table or list MUST enumerate the five self-hosted services
- AND three MUST be marked as "declared but not imported in src/" (socket.io, meilisearch, minio)
- AND two MUST be marked as actively used (postgres, redis, livekit — three if redis counts)

#### Scenario: First ADR references the implementation proposal

- GIVEN `docs/architecture/decisions/0001-vercel-only.md`
- WHEN the `References` section is read
- THEN `openspec/changes/migrate-managed-services/proposal.md` MUST be linked
- AND `openspec/changes/migrate-managed-services/exploration.md` MUST be linked
- AND `openspec/specs/deployment-pipeline/spec.md` MUST be linked
