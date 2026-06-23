# Archive Report: Home Page Upgrade

**Change name:** `home-page-upgrade`
**Date archived:** 2026-06-16
**Phase:** Phase 1 — Public Landing (Doctoralia-style)
**Verdict:** PASS WITH WARNINGS

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| **Change ID** | `2026-06-16-home-page-upgrade` |
| **Date** | 2026-06-16 |
| **Total lines added (net)** | ~1,536 |
| **PRs** | 2 chained PRs (stacked-to-main): PR-1 (Data + HomeNav, ~487 lines), PR-2 (Sections + page rewrite, ~1,049 lines) |
| **Total tests** | 360 / 360 passing (47 test files) |
| **New tests** | 49 (PR-1: 18, PR-2: 31) |
| **Final verify verdict** | PASS WITH WARNINGS (0 critical, 4 non-blocking warnings) |
| **Pre-flight config** | A2 (auto) / B1 (openspec) / C4 (auto-forecast) / D2 (800-line budget) |
| **Delivery strategy** | `auto-forecast` (chained PRs, stacked-to-main) |
| **Review budget honoured** | Each PR within 800 lines; total ~1,536 lines split across 2 PRs (PR-1 well under, PR-2 above per-PR budget but the chain strategy was accepted at design time) |
| **Repository status** | Not a git repo — intended commit messages recorded in engram `sdd/2026-06-16-home-page-upgrade/apply-progress` |

The home page upgrade replaces the 34-line skeleton at `src/app/page.tsx` with a 6-section server-rendered marketing landing modeled on Doctoralia: auth-aware top bar, hero with search, trust counter, specialty pills, featured doctors grid, value props, and a 4-column footer. The change is purely presentational plus one new tRPC procedure (`getHomeStats`); **zero DB migrations, zero new shadcn primitives**.

---

## 2. What Was Delivered

### 6 new home page sections (under `src/components/home/`)

| # | Section | Type | Notes |
|---|---------|------|-------|
| 1 | `HomeNav.tsx` | Client island | Sticky frosted-glass top bar with `useSession()`-driven auth CTAs; mobile `Sheet` collapse |
| 2 | `Hero.tsx` | Server component | h1 + sub-headline + `HeroSearchForm` client island + `TrustCounter` |
| 3 | `HeroSearchForm.tsx` | Client island | Controlled inputs (specialty functional, city `disabled` decorative); `useRouter().push()` on submit with `encodeURIComponent` |
| 4 | `TrustCounter.tsx` | Server component | Returns `null` when N === 0; renders "N doctores verificados" otherwise |
| 5 | `SpecialtyPills.tsx` | Server component | 12 pills from `POPULAR_SPECIALTIES` + 13th "Ver más" link; `overflow-x-auto` on mobile |
| 6 | `FeaturedDoctors.tsx` | Client island | 4 states (loading skeleton grid, empty, error+Reintentar, success); uses existing `listDoctorProfiles.useQuery({ limit: 8 })` |
| 7 | `ValueProps.tsx` | Server component | 4 cards: Search / CalendarCheck / Bell / BadgeCheck; 24×24 lucide icons with `aria-hidden` |
| 8 | `Footer.tsx` | Server component | 4 columns (Servicio / Para pacientes / Para profesionales / Contacto); real `href` for existing pages, `href="#"` + `data-todo="home-page-upgrade"` for stubs; `Separator` + copyright bar |

### 1 new tRPC procedure

| Procedure | File | Auth | Notes |
|-----------|------|------|-------|
| `getHomeStats` | `src/infrastructure/api/routers/profiles.ts` (additive) | `publicProcedure` | Returns `{ totalVerifiedDoctors, totalSpecialties }`; safe-fallback `{ 0, 0 }` on DB error |

### 1 new use case

| Use case | File | Notes |
|----------|------|-------|
| `getHomeStatsUseCase` | `src/application/use-cases/profiles/get-home-stats.use-case.ts` | Two parallel `count()` queries on `doctores WHERE verificado = true`; **propagates** errors (the procedure is the safe-fallback boundary) |

### 1 new constants file

| File | Notes |
|------|-------|
| `src/lib/constants/specialties.ts` | Exports `POPULAR_SPECIALTIES` (12 entries, `as const satisfies ReadonlyArray<Specialty>`), `Specialty` / `SpecialtySlug` types, `getSpecialtyBySlug` helper |

### Files modified

| File | Change |
|------|--------|
| `src/app/page.tsx` | 34-line skeleton → 6-section RSC composition with `force-dynamic` and `createCaller(createContext())` |
| `src/infrastructure/api/routers/profiles.ts` | Added `getHomeStats` procedure (+~20 lines) |
| `src/application/index.ts` | Re-export `getHomeStatsUseCase` (+2 lines) |
| `src/infrastructure/api/routers/__tests__/profiles.test.ts` | New `describe("getHomeStats")` block (+~90 lines) |

### Files created (per `verify-report.md` §8)

**PR-1 (Data + HomeNav):** `specialties.ts` (38) · `specialties.test.ts` (61) · `get-home-stats.use-case.ts` (45) · `get-home-stats.test.ts` (75) · `HomeNav.tsx` (110) · `HomeNav.test.tsx` (108)

**PR-2 (Sections + Page):** `Hero.tsx` (40) · `HeroSearchForm.tsx` (78) · `TrustCounter.tsx` (38) · `SpecialtyPills.tsx` (59) · `FeaturedDoctors.tsx` (118) · `ValueProps.tsx` (77) · `Footer.tsx` (109) · `index.ts` (9) · `TrustCounter.test.tsx` (45) · `HeroSearchForm.test.tsx` (125) · `SpecialtyPills.test.tsx` (63) · `FeaturedDoctors.test.tsx` (198) · `Footer.test.tsx` (81)

**Counts:** 0 new shadcn components · 0 DB migrations · 1 new public tRPC procedure (additive) · 1 new use case · 1 new constants module.

---

## 3. Test Results

| Metric | Value |
|--------|-------|
| **Total tests** | 360 / 360 passing |
| **Test files** | 47 (no skipped) |
| **New tests in this change** | 49 across 9 test files |
| **PR-1 tests** | 18 (6 × `specialties`, 4 × `get-home-stats`, 5 × `HomeNav`, 3 × `profiles.getHomeStats`) |
| **PR-2 tests** | 31 (6 × `TrustCounter`, 6 × `HeroSearchForm`, 4 × `SpecialtyPills`, 10 × `FeaturedDoctors`, 5 × `Footer`) |
| **Pre-existing tests** | 311 (regression-safe — all green) |
| **Type check** | `pnpm type-check` — PASS with 3 pre-existing TS errors (`DoctorExperience.test.tsx:57`, `DoctorHero.test.tsx:224,236`) owned by the previous `doctor-profile-page` change; **0 new TS errors** from this change |
| **Lint** | `pnpm lint` — exit 0; only pre-existing import-order warnings, none in this change's new files |
| **Build** | `pnpm build` — PASS; home page compiles as `ƒ (Dynamic)` at 37 kB / 226 kB First Load JS |

---

## 4. Architecture Decisions (link + 1-line summary)

Full ADs are in [`design.md`](./design.md). Mini-ADR table:

| ID | Decision (1 line) |
|----|-------------------|
| **AD-1** | Add new public tRPC procedure `getHomeStats` returning `{ totalVerifiedDoctors, totalSpecialties }` via a new use case; procedure catches errors and returns safe-fallback `{ 0, 0 }` so the home page never 500s on DB outage. |
| **AD-2** | Home page is an **async RSC** that uses `createCaller(await createContext())` server-side; `FeaturedDoctors` and `HeroSearchForm` are client islands for loading/error UI; `HomeNav` is a client island for `useSession`. |
| **AD-3** | Reuse `DoctorCard` (existing) in the featured grid wrapped in a `Link` with `showBookingLink={false}`; no new card variant. |
| **AD-4** | No new shadcn primitives — reuse `Button`, `Input`, `Card`, `Badge`, `Separator`, `Skeleton`, `DropdownMenu`, `Sheet`, plus `lucide-react`. |
| **AD-5** | New public-only top bar `HomeNav` (not `Shell`); reuses `<UserMenu>` from `src/components/UserMenu.tsx` for the authenticated branch. |
| **AD-6** | Hard-coded specialty pills via `src/lib/constants/specialties.ts` (12 entries) with `as const satisfies ReadonlyArray<Specialty>`; the future `especialidades` table seeds from this constant. |
| **AD-7** | `TrustCounter` is rendered **only** when `getHomeStats().totalVerifiedDoctors > 0` — never shows "0 doctores verificados". |
| **AD-8** | Footer renders real `href` for existing pages and `href="#"` + `data-todo="home-page-upgrade"` for missing pages; no stub pages are created. |
| **AD-9** | Hero city input is decorative in v1: `<Input disabled placeholder="Ciudad (próximamente)" aria-label="Próximamente" />`; submit reads only the specialty field. |
| **AD-10** | `export const dynamic = "force-dynamic"` on `src/app/page.tsx` (matching the root layout) so the trust counter and featured grid see fresh data per request; no new caching layer. |

---

## 5. Out-of-Scope (deferred to future changes)

From `tasks.md` § Cancelled — 14 items, each with a one-line rationale:

| # | Item | Blocker / rationale |
|---|------|---------------------|
| 1 | Insurance grid | No `insurance` / `doctor_seguro_medico` / `seguros` table exists; verified-doctor row has no `segurosAceptados` field. |
| 2 | Reviews carousel | No `reviews` table; `calificacionMedia` is hand-maintained. |
| 3 | Blog carousel | No `posts` table / CMS. |
| 4 | Modality toggle (presencial / online) | `doctores` has no `modalidad` / `aceptaOnline` column. |
| 5 | Cities quick-pick / city autocomplete | No `ciudades` table; needs geocoding or seeded list. |
| 6 | Popular specialties × cities SEO block | Only valuable at > 50 verified doctors; defer until the dataset is real. |
| 7 | Pro / AI CTAs | No product offering to advertise yet (marketing decision). |
| 8 | Cookie consent banner | Separate compliance change. |
| 9 | Geo-located "Cerca de ti" | Needs geolocation API + a city tier-1 list. |
| 10 | Newsletter signup | No email infrastructure yet. |
| 11 | FAQ on home | Out of scope — FAQ belongs on doctor profiles, not the landing. |
| 12 | Editorial featured-doctor selection | Using `calificacionMedia` ranking; an admin-driven `destacado` boolean is a separate change. |
| 13 | i18n (`/en`, `/ca`, `/val`) | Site is Spanish-only for now. |
| 14 | Stub pages for footer links | Stubs rot. The `data-todo="home-page-upgrade"` attribute is the grep surface for the next change. |

---

## 6. Follow-up Recommendations (top 3 of 6 SUGGESTIONs from verify-report)

1. **Real `getCities` tRPC procedure for the v2 hero city input** (S1) — Unblocks D4 from the proposal: removing `disabled` + `tabindex={-1}` on the city input becomes a 1-line change. The input's `aria-label` and `title` are already correct.
2. **Tighten `HomeNav` authenticated-state test** (S5) — The "authenticated" describe block only asserts `buttons.length > 0`. Should mock `UserMenu`, assert it was called with the session user, and explicitly assert the absence of the "Iniciar sesión" / "Registrarse" controls. Catches the regression W2 is warning about.
3. **Add a `tier` or `category` field to `POPULAR_SPECIALTIES`** (S4) — Doctoralia surfaces different specialty sets based on page context. A `tier: "top" | "niche"` field on each entry turns the constant into the seed for `tier === "top"` filtering with no API change.

The remaining three (S2 keyboard-focus on city input, S3 `as const satisfies` pattern promotion to `ValueProps` / `Footer` arrays, S6 `mockNextAuth` test helper) are also recorded in `verify-report.md` §6 for future work.

---

## 7. Warnings (non-blocking)

From `verify-report.md` §6 — 4 warnings, none critical:

| # | Warning | Owner / Action |
|---|---------|----------------|
| **W1** | 3 pre-existing TS errors in `DoctorExperience.test.tsx:57` and `DoctorHero.test.tsx:224,236` | Owned by previous `doctor-profile-page` change. Out of scope here. Follow-up change should tighten mock types. |
| **W2** | `HomeNav` authenticated-state test is thin (only asserts brand link + button count) | Source-inspection confirms the implementation is correct. Follow-up: tighten the test per S5 above. |
| **W3** | `ValueProps` has no test (deliberately untested static section per design §6.4 and tasks §6.1) | Source inspection confirms full spec compliance. Future Playwright visual regression is the recommended coverage. |
| **W4** | PR-2 overshot its 725-line estimate (actual ~1,049) — concentrated in test files (685 lines) | 800-line review budget per PR is not respected for PR-2 standalone, but the chained-PR strategy was already accepted at design time. None required for archive. |

---

## 8. Specs Synced

Three new permanent specs were created in `openspec/specs/` (the spec domains did not exist before this change, so this is a **create**, not a delta merge):

| Permanent spec | Source delta | Path |
|----------------|--------------|------|
| `home-ui/spec.md` | `home-ui/spec.md` (9 requirements, ~30 scenarios) | `openspec/specs/home-ui/spec.md` |
| `home-api/spec.md` | `home-api/spec.md` (3 requirements, ~13 scenarios) | `openspec/specs/home-api/spec.md` |
| `specialties-constants/spec.md` | `specialties-constants/spec.md` (1 requirement, 9 scenarios) | `openspec/specs/specialties-constants/spec.md` |

No existing permanent spec required modification — `home-ui`, `home-api`, and `specialties-constants` are net-new domains. The change is purely additive to the spec store.

---

## 9. Commit Status

The project is **not a git repository** (`.git` directory does not exist). The intended commit messages are recorded in engram `sdd/2026-06-16-home-page-upgrade/apply-progress` and were not executed locally. The orchestrator must initialize the chain on a real `main` branch before pushing. Suggested commit messages (PR-1 then PR-2, stacked-to-main):

```
PR-1: feat(home): add getHomeStats tRPC procedure and HomeNav top bar

- New public tRPC procedure getHomeStats returning { totalVerifiedDoctors, totalSpecialties }
  with safe-fallback on DB error
- New use case getHomeStatsUseCase (router → use case → db)
- New POPULAR_SPECIALTIES constant (12 entries) with as const satisfies typing
- New HomeNav client component with auth-aware CTAs (Iniciar/Registrarse vs UserMenu)
- No user-visible change to the home page (still 34-line skeleton)
- 18 new tests, all green; 329/329 total

PR-2: feat(home): ship 6-section landing page (Hero, TrustCounter, SpecialtyPills, FeaturedDoctors, ValueProps, Footer)

- New Hero + HeroSearchForm + TrustCounter (search hero + zero-state trust counter)
- New SpecialtyPills (12 pills + Ver más, mobile horizontal scroll)
- New FeaturedDoctors (4 states: loading/empty/error+Reintentar/success; uses listDoctorProfiles)
- New ValueProps (4 cards: Search / CalendarCheck / Bell / BadgeCheck)
- New Footer (4 columns with real-href vs data-todo marker; Separator + copyright bar)
- src/app/page.tsx: 34-line skeleton → RSC composition with force-dynamic
  and createCaller(createContext())
- 31 new tests, all green; 360/360 total
```

---

## 10. Archived Artifacts

This archive contains:

- `proposal.md` — Original change proposal (Slice A scope, 5 default decisions, 4 ADs)
- `design.md` — Technical design (10 ADs, ~1080-line estimate, RSC data flow mermaid, file-by-file change table, interface contracts, PR split strategy)
- `tasks.md` — Task breakdown (PR-1 Groups 1–2, PR-2 Groups 3–8; all marked ✅ APPLIED)
- `verify-report.md` — Verification report (PASS WITH WARNINGS, 360/360 tests, 7/7 invariants)
- `archive-report.md` — This file
- `specs/home-ui/spec.md` — Delta spec (9 requirements, ~30 scenarios)
- `specs/home-api/spec.md` — Delta spec (3 requirements, ~13 scenarios)
- `specs/specialties-constants/spec.md` — Delta spec (1 requirement, 9 scenarios)

The full audit trail (proposal → design → tasks → apply → verify → archive) is preserved. The change is closed.

---

## 11. Cycle Closed

The `home-page-upgrade` change is fully archived. The home page at `src/app/page.tsx` is now a 6-section server-rendered landing page with auth-aware top bar, hero with search, trust counter, specialty pills, featured doctors grid, value props, and 4-column footer. Backward compatibility is preserved — `getMyProfile`, `updateMyProfile`, `getDoctorProfile`, `listDoctorProfiles`, `getDoctorFullProfile`, and `getDoctorServices` are untouched. The orchestrator can move on to a new change (or close the session).
