# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the angelina-consultoria platform. ADRs capture the WHY behind significant architectural choices so future contributors (and future agents, post-compaction) can read the rationale without re-deriving it.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001-vercel-only.md](0001-vercel-only.md) | Vercel-Only Deployment | Accepted | 2026-06-25 |

## Template

This project follows the [MADR template](https://adr.github.io/madr/) (Markdown Any Decision Records). Each ADR MUST contain, in this order:

1. **Context** — the situation that required a decision.
2. **Decision** — the choice made, as a declarative sentence.
3. **Consequences** — Positive, Negative, Neutral subsections.
4. **Alternatives Considered** — at least one rejected alternative with rationale.
5. **References** — links to related ADRs, OpenSpec changes, and docs.

## Immutability Rule

ADRs are **NEVER edited in place once accepted**. When a decision is reversed or superseded:

1. The new decision gets a new ADR (`0002-...`, `0003-...`).
2. The new ADR's `References` section cites the older ADR.
3. The older ADR's status line is updated to `Superseded by NNNN-<slug>`.
4. The older ADR stays in this directory as historical record.

History is the point of an ADR. Deleting ADRs erases institutional memory.
