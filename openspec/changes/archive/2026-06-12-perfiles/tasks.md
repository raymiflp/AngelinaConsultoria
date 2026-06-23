# Tasks: Perfiles

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~500 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | API + UI + tests | PR 1 | Single PR, under 800 budget |

## Phase 1: Foundation

- [x] 0.1 Install shadcn components: `npx shadcn@latest add form input textarea select card badge` (+ skeleton alert)
- [x] 0.2 Install deps: `npm install react-hook-form @hookform/resolvers` (+ sonner)

## Phase 2: Core Implementation

- [x] 1.1 Create `src/infrastructure/profiles/schemas.ts` — Zod update schemas with `z.discriminatedUnion("rol", [...])` for DOCTOR/PACIENTE
- [x] 2.1 Implement `src/infrastructure/api/routers/profiles.ts` — `getMyProfile` (protected, role-branch), `updateMyProfile` (protected, role-branch), `getDoctorProfile` (public); use Drizzle queries
- [x] 2.2 Create `src/components/profiles/ProfileForm.tsx` — `"use client"`; role-aware form with shadcn Form/Input/Textarea/Select/Button; loading/validation/success states via sonner toast
- [x] 2.3 Create `src/components/profiles/DoctorCard.tsx` — read-only public doctor card using shadcn Card/Badge/Avatar with Skeleton placeholders
- [x] 2.4 Create `src/app/perfil/page.tsx` — `"use client"`; fetches profile via tRPC, renders view/edit with toggle; handles loading (Skeleton), error (Alert + retry), empty (Create profile prompt) states
- [x] 2.5 Create `src/app/doctores/[id]/page.tsx` — `"use client"`; fetches public doctor via tRPC, renders DoctorCard; handles loading (Skeleton) and not-found (Alert + Volver link) states

## Phase 3: Testing

- [x] 3.1 Unit tests for Zod schemas — valid/invalid input per role, cross-role field rejection, edge cases (negative price, empty required fields)
- [x] 3.2 Integration tests for tRPC procedures — getMyProfile returns doctor data for DOCTOR, patient data for PACIENTE, null for missing profile; updateMyProfile persists and returns updated data; getDoctorProfile returns public data; UNAUTHORIZED validation
- [x] 3.3 Component smoke tests for DoctorCard — render states, loading skeletons, error alerts (ProfileForm smoke test pending trpc mock complexity)

## Phase 4: Verification

- [x] 4.1 `npm run type-check` (tsc --noEmit) — 0 errors
- [x] 4.2 `npm run test:run` (vitest run) — 202/202 passed
