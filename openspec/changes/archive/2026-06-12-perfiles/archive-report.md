# Archive Report: perfiles

**Archived**: 2026-06-12
**Source**: `openspec/changes/perfiles/` → `openspec/changes/archive/2026-06-12-perfiles/`

## Summary

| Field | Value |
|-------|-------|
| Change | Perfiles (Doctor & Patient Profiles) |
| Tasks total | 12 |
| Tasks complete | 12 |
| Verification | PASS WITH WARNINGS |
| Specs synced | 2 (`profiles-ui`, `profiles-api`) |

## Specs Synced to Main

| Delta Spec | Main Spec | Action |
|------------|-----------|--------|
| `changes/perfiles/specs/profiles-ui/spec.md` | `specs/profiles-ui/spec.md` | Created (new spec) |
| `changes/perfiles/specs/profiles-api/spec.md` | `specs/profiles-api/spec.md` | Created (new spec) |

## Artifacts Preserved

| Artifact | Path |
|----------|------|
| Proposal | `archive/2026-06-12-perfiles/proposal.md` |
| Design | `archive/2026-06-12-perfiles/design.md` |
| Tasks | `archive/2026-06-12-perfiles/tasks.md` |
| Verify Report | `archive/2026-06-12-perfiles/verify-report.md` |
| Specs (delta) | `archive/2026-06-12-perfiles/specs/profiles-ui/spec.md` |
| Specs (delta) | `archive/2026-06-12-perfiles/specs/profiles-api/spec.md` |

## Verification Notes

All 12 tasks completed. Build passed (`tsc --noEmit` zero errors). All 202 tests passed (27 test files, including 19 schema tests, 12 integration tests, 10 component smoke tests). API spec scenarios 10/12 compliant — `getPatientProfile` deliberately excluded by design decision (functionality covered via `getMyProfile` for PACIENTE role). UI spec 13/14 compliant — price uses `<span>` instead of `<Badge>` component. No CRITICAL issues.

## Warnings Recorded

1. **`getPatientProfile` spec/design misalignment**: The requirement exists in `profiles-api/spec.md` but was deliberately excluded from implementation. Design chose a single `getMyProfile` with role branch instead. Spec vs design need alignment in a future change — either remove the requirement from the spec or add the procedure.
2. **Price display deviation**: `precioConsulta` renders as `<span>` instead of `<Badge>` component as specified in `profiles-ui/spec.md`.

## Risks Logged

- Profile form (`ProfileForm`) has no dedicated unit tests — task 3.3 noted pending tRPC mock complexity
- No page-level tests for `/perfil` or `/doctores/[id]` pages
