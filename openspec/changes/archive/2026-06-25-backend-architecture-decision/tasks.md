# Tasks: Backend Architecture Decision (ADR-0001)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150 (3 new files ~120 + AGENTS.md +5 + spec +25) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | ADR scaffolding + AGENTS.md cross-link + spec | PR 1 | Single PR, doc-only, ~150 lines |

## Phase 1: Create the ADR

- [x] 1.1 Create `docs/architecture/decisions/0001-vercel-only.md` with the 5 MADR sections (Context, Decision, Consequences, Alternatives Considered, References) and the Status/Date/Deciders header
- [x] 1.2 Create `docs/architecture/decisions/README.md` indexing the ADR, naming the MADR template, and stating the immutability rule

## Phase 2: Cross-link from AGENTS.md

- [x] 2.1 Add one bullet under "Architecture facts agents miss" in `AGENTS.md` pointing to `docs/architecture/decisions/` as the source of truth for architectural decisions

## Phase 3: Verify

- [x] 3.1 Run `ls docs/architecture/decisions/` and assert `0001-vercel-only.md` and `README.md` are present
- [x] 3.2 grep `0001-vercel-only.md` for `## Context`, `## Decision`, `## Consequences`, `## Alternatives Considered`, `## References`; assert 5 matches
- [x] 3.3 grep `AGENTS.md` for `docs/architecture/decisions`; assert 1 match
- [x] 3.4 Run `pnpm lint` and `pnpm type-check`; assert both exit 0 (no src/ changes, but guard against the AGENTS.md edit breaking anything)
