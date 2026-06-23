# Archive Report: Doctor Profile Page

**Change name:** `doctor-profile-page`
**Date archived:** 2026-06-15
**Phase:** Phase 1 — Professional Data Profile
**Verdict:** PASS WITH WARNINGS

---

## Summary

Upgraded the public doctor profile page at `/doctores/[id]` from a single-card layout (using `DoctorCard` + `getDoctorProfile`) to a rich, multi-section profile page with Hero, Experience, Services, and Treated Conditions sections. The implementation follows Clean Architecture patterns with 3 new DB tables, 5 new columns on `doctores`, 3 new domain entities, 2 new tRPC procedures, 4 new UI components, a full-page skeleton, and a rewritten page layout.

Backward compatibility is fully maintained — `DoctorPublicResponse`, `getDoctorProfile`, `DoctorCard`, and the `/doctores` listing page are completely unchanged.

## Key Stats

| Metric | Value |
|--------|-------|
| **Lines changed (estimated)** | ~1,015 |
| **Files created** | 11 |
| **Files modified** | 5 |
| **New DB tables** | 3 (`doctor_experiencia`, `doctor_servicios`, `doctor_condiciones`) |
| **New DB columns** | 5 (on `doctores`: `foto_url`, `ubicacion_consulta`, `años_experiencia`, `idiomas`, `telefono_consulta`) |
| **New domain entities** | 3 (`DoctorExperience`, `DoctorService`, `DoctorCondition`) |
| **New tRPC procedures** | 2 (`getDoctorFullProfile`, `getDoctorServices`) |
| **New UI components** | 5 (`DoctorHero`, `DoctorExperience`, `DoctorServices`, `DoctorConditions`, `DoctorProfileSkeleton`) |
| **Spec scenarios** | 36 (in delta spec) |
| **Type check (`tsc --noEmit`)** | ✅ PASS |
| **Existing tests** | 254/254 ✅ PASS |
| **New tests** | ⚠️ 0 written |

## Files Created

| File | Purpose |
|------|---------|
| `src/infrastructure/db/schema/doctor-experiencia.ts` | `doctor_experiencia` table Drizzle schema |
| `src/infrastructure/db/schema/doctor-servicios.ts` | `doctor_servicios` table Drizzle schema |
| `src/infrastructure/db/schema/doctor-condiciones.ts` | `doctor_condiciones` table Drizzle schema |
| `src/domain/entities/doctor-experiencia.ts` | `DoctorExperience` domain entity |
| `src/domain/entities/doctor-servicios.ts` | `DoctorService` domain entity |
| `src/domain/entities/doctor-condiciones.ts` | `DoctorCondition` domain entity |
| `src/application/use-cases/profiles/get-doctor-full-profile.use-case.ts` | Use case for `getDoctorFullProfile` |
| `src/components/profiles/DoctorHero.tsx` | Hero section component |
| `src/components/profiles/DoctorExperience.tsx` | Experience timeline component |
| `src/components/profiles/DoctorServices.tsx` | Services & prices component |
| `src/components/profiles/DoctorConditions.tsx` | Conditions tag cloud component |
| `src/components/profiles/DoctorProfileSkeleton.tsx` | Full-page skeleton loader |

## Files Modified

| File | Changes |
|------|---------|
| `src/infrastructure/db/schema/doctores.ts` | Added 5 nullable columns |
| `src/infrastructure/db/schema/index.ts` | Exports + Drizzle relations for new tables |
| `src/domain/entities/doctor.ts` | Added 5 optional readonly fields + validation |
| `src/domain/entities/index.ts` | Exports for 3 new entities |
| `src/infrastructure/profiles/schemas.ts` | Added `DoctorFullProfileResponse` + Zod input schemas |
| `src/application/index.ts` | Export `getDoctorFullProfileUseCase` |
| `src/infrastructure/api/routers/profiles.ts` | Added `getDoctorFullProfile` + `getDoctorServices` procedures |
| `src/app/doctores/[id]/page.tsx` | Rewritten to multi-section layout with `getDoctorFullProfile` |

## Permanent Specs Updated

| Spec | What was synced |
|------|----------------|
| `profiles-api/spec.md` | Added `getDoctorFullProfile` and `getDoctorServices` requirements with scenarios |
| `profiles-ui/spec.md` | Rewrote `/doctores/[id]` requirement from card to multi-section page with all component scenarios |
| `domain-entities/spec.md` | Extended Doctor entity with 5 profile fields; added DoctorExperience, DoctorService, DoctorCondition entity sections |
| `db-schema/spec.md` | Added 3 new table scenarios; added doctores column extension scenario; updated entity counts to 9 |

## Warnings / Known Issues

| # | Issue | Detail |
|---|-------|--------|
| W1 | **No entity tests** | `DoctorExperience.create()`, `DoctorService.create()`, `DoctorCondition.create()` — no unit tests written |
| W2 | **No component tests** | `DoctorHero`, `DoctorExperience`, `DoctorServices`, `DoctorConditions`, `DoctorProfileSkeleton` — no render tests written |
| W3 | **No use case tests** | `getDoctorFullProfileUseCase` — no mocked-DB test written |
| W4 | **Schema test coverage** | `schema.test.ts` only tests original 6 tables, not the 3 new ones |
| W5 | **Component loading skeletons are dead code** | Each section component accepts `isLoading` prop, but the page renders `DoctorProfileSkeleton` instead — individual skeletons are unreachable at runtime |

## Next Steps

1. **Add tokenization for `condiciones` (conditions)** — Currently stored as free-text `nombre` per doctor. A normalized `condiciones` table with FK relationships would prevent duplicates and enable search/filtering across doctors.
2. **Write missing tests** — Unit tests for 3 new domain entities, component tests for all 5 new components, and use case tests with mocked DB.
3. **Phase 2: Reviews & Ratings** — Implement review/rating system for doctors (replaces the hardcoded `totalReviews: 0`).
4. **Phase 2: Insurance accepted** — Add insurance provider data (which insurance companies the doctor works with).
5. **Phase 2: FAQ section** — Doctor Q&A section for common patient questions.
6. **Phase 2: Maps integration** — Embed map showing doctor's consultation location.
7. **Phase 3: Doctor Edit UI** — Admin/doctor UI for managing profile data (sections, services, experience, conditions).
8. **Phase 3: Booking flow integration** — Wire "Reservar" buttons (hero CTA + per-service) to the actual booking flow.

## Archived Artifacts

- `proposal.md` — Original change proposal
- `exploration.md` — Pre-proposal exploration
- `spec.md` — Delta specification (36 scenarios)
- `design.md` — Technical design (architecture decisions, data flow, interfaces)
- `tasks.md` — Task breakdown (18 tasks across 4 groups)
- `verify-report.md` — Verification report with completeness table and correctness verification
- `archive-report.md` — This file
