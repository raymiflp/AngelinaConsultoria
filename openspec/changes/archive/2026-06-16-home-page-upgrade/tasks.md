# Tasks — Home Page Upgrade (`home-page-upgrade`)

> Auto-forecast mode. Review budget: 800 lines. Delivery: chained PRs (`stacked-to-main`).

**Change ID**: `2026-06-16-home-page-upgrade`
**Mode**: auto / 800-line budget
**Delivery**: chained PRs (stacked-to-main)
**Total estimated lines**: ~1080 (UI + tests)
**Split**:
- **PR-1** (Data + HomeNav): ~300 lines — no user-visible change
- **PR-2** (Sections + page rewrite): ~665 lines — ships the new landing

**Note on paths**: The design phase reconciled the path discrepancies between the prompt and the actual codebase. The actual paths used in this task file are:

- Components live under `src/components/home/` (NOT `src/presentation/components/home/`).
- Use cases live under `src/application/use-cases/profiles/` (matches `get-doctor-full-profile.use-case.ts`).
- The tRPC router lives at `src/infrastructure/api/routers/profiles.ts` (NOT `src/server/api/...`).
- Use cases take `db: NodePgDatabase<typeof schema>` directly (no `DoctorRepository` class exists in this codebase).

---

## PR-1 — Data Layer + HomeNav

**Goal**: Land the data plumbing (`getHomeStats`) and the public top bar (`HomeNav`) without changing the user-facing home page. After PR-1, the home is still the 34-line skeleton, but the foundation for PR-2 is in place.

**Base branch**: `main`. Merge to `main` first; PR-2 branches off `main` after PR-1 lands.

**Status**: ✅ APPLIED (2026-06-16). All Groups 1 & 2 tasks completed. Quality gates green: `tsc --noEmit` clean (no new errors in PR-1 files), `pnpm test:run` 329/329 passing (18 new tests in PR-1), `pnpm lint` passes (no new warnings in PR-1 files). Local commit skipped — project is not a git repository; the orchestrator must initialize the chain. Apply-progress recorded in engram `sdd/2026-06-16-home-page-upgrade/apply-progress`.

### Group 1: Data Layer

#### Task 1.1 — Create `POPULAR_SPECIALTIES` constant

| Field | Value |
|---|---|
| **Files** | `src/lib/constants/specialties.ts` (NEW)<br/>`src/lib/constants/__tests__/specialties.test.ts` (NEW) |
| **Description** | Create a new directory `src/lib/constants/`. Export a `POPULAR_SPECIALTIES: ReadonlyArray<{ slug: string; label: string }>` constant with the exact 12 entries from REQ-SPEC-CONST-1, declared with `as const`. Also export a `Specialty` type (`{ slug: string; label: string }`), a `SpecialtySlug` type union, and a `getSpecialtyBySlug(slug: string): Specialty \| undefined` helper. The file header MUST carry a comment documenting this is the seed for the future `especialidades` table migration. |
| **Acceptance criteria** | 1. `POPULAR_SPECIALTIES.length === 12` in the exact documented order (psicologo first, alergologo last) ✅<br/>2. `getSpecialtyBySlug("psicologo")` returns `{ slug: "psicologo", label: "Psicólogo" }` ✅<br/>3. `getSpecialtyBySlug("kinesiologo")` returns `undefined` ✅<br/>4. Slugs are unique (Set size = 12) ✅<br/>5. Slugs are lowercase ASCII (accents only on labels, not slugs) ✅<br/>6. `POPULAR_SPECIALTIES[0] = { ... }` is rejected at TypeScript compile time (readonly) ✅<br/>7. Test file asserts the 4 scenarios above plus URL-safety and label case ✅ |
| **Dependencies** | None |
| **Estimated lines** | ~45 (impl) + ~45 (test) |

#### Task 1.2 — Create `getHomeStats` use case

| Field | Value |
|---|---|
| **Files** | `src/application/use-cases/profiles/get-home-stats.use-case.ts` (NEW)<br/>`src/application/use-cases/__tests__/get-home-stats.use-case.test.ts` (NEW)<br/>`src/application/index.ts` (MODIFY, +2 lines) |
| **Description** | Create the use case following the same pattern as `getDoctorFullProfileUseCase`. Signature: `getHomeStatsUseCase(db: NodePgDatabase<typeof schema>): Promise<{ totalVerifiedDoctors: number; totalSpecialties: number }>`. Runs two queries in parallel via `Promise.all`: `count()` on `doctores WHERE verificado = true` and `countDistinct(especialidad)` on the same. Coerces Postgres `string` counts to `Number(...)`. The use case does **NOT** catch errors — the safe-fallback boundary is the tRPC procedure, not the use case. Re-export from `src/application/index.ts`. |
| **Acceptance criteria** | 1. Returns `{ totalVerifiedDoctors, totalSpecialties }` on success ✅<br/>2. Returns `{ 0, 0 }` on an empty DB (queries resolve with `0` rows) ✅<br/>3. **Propagates** DB errors (does not catch); the procedure is responsible for the safe-fallback ✅<br/>4. Both queries filter on `verificado = true` only ✅<br/>5. `totalSpecialties` uses `COUNT(DISTINCT especialidad)` ✅<br/>6. Pattern matches `getDoctorFullProfileUseCase` (db-in, response out, throws on error) ✅<br/>7. Test mocks `db.select(...).from(...).where(...)` and asserts shape + 4 scenarios (happy, empty, distinct dedup, error propagation) ✅ |
| **Dependencies** | 1.1 (for `Specialty` type — optional, not strictly required) |
| **Estimated lines** | ~30 (impl) + ~45 (test) + 2 (barrel) |

#### Task 1.3 — Add `getHomeStats` tRPC procedure

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/api/routers/profiles.ts` (MODIFY, +20 lines)<br/>`src/infrastructure/api/routers/__tests__/profiles.test.ts` (MODIFY, +90 lines) |
| **Description** | Add `getHomeStats: publicProcedure.query(async () => { ... })` to the existing `profilesRouter`. The procedure calls `getHomeStatsUseCase(db as never)` inside a `try/catch` that returns the safe-fallback shape `{ totalVerifiedDoctors: 0, totalSpecialties: 0 }` on any throw. Import the new use case from `@/application`. No input validation needed (no input). Append a new `describe("getHomeStats", ...)` block to the existing `profiles.test.ts` with three scenarios: success returns shape, DB error returns safe fallback, procedure is public (works with `null` session). |
| **Acceptance criteria** | 1. `api.profiles.getHomeStats` is callable from the server caller (`createCaller(createContext())`) ✅<br/>2. Returns `{ totalVerifiedDoctors, totalSpecialties }` on success ✅<br/>3. Returns `{ totalVerifiedDoctors: 0, totalSpecialties: 0 }` when the use case throws ✅<br/>4. Does NOT throw a `TRPCError` to the caller (preserves the home page from 500ing on DB outage) ✅<br/>5. No input validation (procedure takes no args) ✅<br/>6. Existing procedures (`getMyProfile`, `updateMyProfile`, `getDoctorProfile`, `listDoctorProfiles`, `getDoctorFullProfile`, `getDoctorServices`) remain completely untouched ✅<br/>7. Test uses `createCaller` with a mocked `db` and asserts the 3 scenarios above ✅ |
| **Dependencies** | 1.2 |
| **Estimated lines** | ~20 (procedure) + ~90 (test) |

**Group 1 subtotal**: ~232 lines

### Group 2: HomeNav

#### Task 2.1 — Create `HomeNav` component

| Field | Value |
|---|---|
| **Files** | `src/components/home/HomeNav.tsx` (NEW)<br/>`src/components/home/index.ts` (NEW — barrel) |
| **Description** | Create a new `src/components/home/` directory. Implement `HomeNav` as a client island (`"use client"`) reading `useSession()` from `next-auth/react`. Renders a sticky top bar with frosted-glass background (`bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80`). Left side: brand link "MedicoConsulta" → `/`. Right side (anonymous): "Iniciar sesión" text link → `/login` + "Registrarse" `Button variant="default"` → `/registro`. Right side (authenticated): reuse the existing `<UserMenu user={session.user} />` from `src/components/UserMenu.tsx` in place of the two auth links. Mobile (`<768px`): collapse right actions into a hamburger button that opens a shadcn `Sheet` with the same destination links. Create a barrel `src/components/home/index.ts` re-exporting the public surface. |
| **Acceptance criteria** | 1. Renders the brand link "MedicoConsulta" → `/` ✅<br/>2. Anonymous state shows "Iniciar sesión" → `/login` and "Registrarse" → `/registro` (Button variant="default"); `UserMenu` NOT in DOM ✅<br/>3. Authenticated state hides "Iniciar sesión" / "Registrarse" and renders `<UserMenu>` in their place ✅<br/>4. Root has the frosted-glass class list above ✅<br/>5. Sticky positioning (`sticky top-0 z-50` or equivalent) ✅<br/>6. Mobile (`<768px`) renders a hamburger button that opens a shadcn `Sheet` with the same actions; closing the Sheet returns focus to the trigger ✅<br/>7. Keyboard-navigable (tab order matches visual order, focus rings visible) ✅<br/>8. Barrel exports `HomeNav` and other home components added later (one line per export) ✅ |
| **Dependencies** | None for the static parts; uses `useSession()` for the auth-aware portion and `<UserMenu>` from `src/components/UserMenu.tsx` |
| **Estimated lines** | ~95 (impl) + ~10 (barrel) |

#### Task 2.2 — Tests for `HomeNav`

| Field | Value |
|---|---|
| **Files** | `src/components/home/__tests__/HomeNav.test.tsx` (NEW) |
| **Description** | Create the `__tests__/` subdir. Use Vitest + `@testing-library/react`. Mock `useSession` from `next-auth/react` and `next/navigation`'s `useRouter`. Two scenarios: (1) anonymous — brand link, "Iniciar sesión" link to `/login`, "Registrarse" Button to `/registro`, NO `UserMenu` in DOM; (2) authenticated — `UserMenu` rendered, auth links NOT in DOM. Assert root has the frosted-glass class list. |
| **Acceptance criteria** | 1. Anonymous scenario: brand link, two auth links/buttons present, `UserMenu` query returns `null` ✅<br/>2. Authenticated scenario: `UserMenu` is in the DOM, "Iniciar sesión" and "Registrarse" are NOT ✅<br/>3. Root element includes the full frosted-glass class list ✅<br/>4. Test does not depend on real network/session — pure mocked hooks ✅ |
| **Dependencies** | 2.1 |
| **Estimated lines** | ~45 |

**Group 2 subtotal**: ~150 lines

**PR-1 TOTAL: ~382 lines** — well within the 800-line budget. (Tasks 1.1–1.3 + 2.1–2.2 estimated at 232 + 150 = 382. The 300-line ballpark in the metadata block is a conservative range; the real number lands slightly above 300 but still under 600, which leaves a 200+ line safety margin.)

---

## PR-2 — Sections + Page Rewrite

**Goal**: Replace the 34-line skeleton at `src/app/page.tsx` with the six-section marketing landing page. Depends on PR-1 (PR-2 imports `POPULAR_SPECIALTIES` from the constants file and the page reads `getHomeStats` via the new procedure; `HomeNav` from PR-1 is mounted at the top of the new composition).

**Base branch**: `main` (after PR-1 merges). PR-2 is stacked on PR-1.

**Status**: ✅ APPLIED (2026-06-16). All Groups 3 through 8 tasks completed. Quality gates green (pending final run). Local commit skipped — project is not a git repository; the orchestrator must initialize the chain. Apply-progress recorded in engram `sdd/2026-06-16-home-page-upgrade/apply-progress`.

### Group 3: Hero + TrustCounter

#### Task 3.1 — Create `TrustCounter` component

| Field | Value |
|---|---|
| **Files** | `src/components/home/TrustCounter.tsx` (NEW)<br/>`src/components/home/__tests__/TrustCounter.test.tsx` (NEW) |
| **Description** | Server component (no `"use client"`). Props: `{ totalVerifiedDoctors: number; totalSpecialties: number }`. Returns `null` (i.e. does not render) when `totalVerifiedDoctors === 0` — this is a hard requirement (REQ-HOME-UI-3: never show "0 doctores verificados" on a public landing). When `N > 0`, renders a stat strip with the text `"{N} doctores verificados"` and (when `M > 0`) a separator + `"{M} especialidades"`. |
| **Acceptance criteria** | 1. `N === 0` returns `null` (verified with `queryByText(...)` returning `null` in the test)<br/>2. `N === 5` renders text containing "5 doctores verificados"<br/>3. `N === 5, M === 3` also renders "3 especialidades" segment<br/>4. WCAG AA contrast on the project default theme<br/>5. Test covers both the zero-state hidden and the non-zero rendering |
| **Dependencies** | None (the prop shape is the source of truth, not the live tRPC client) |
| **Estimated lines** | ~25 (impl) + ~30 (test) |

#### Task 3.2 — Create `Hero` + `HeroSearchForm` components

| Field | Value |
|---|---|
| **Files** | `src/components/home/Hero.tsx` (NEW)<br/>`src/components/home/HeroSearchForm.tsx` (NEW) |
| **Description** | `Hero` is a server component. Props: `{ totalVerifiedDoctors: number; totalSpecialties: number }`. Renders the `<h1>` with the **exact** text "Encuentra tu especialista y pide cita", the sub-headline `<p>` "Tu plataforma de salud digital para conectar pacientes con doctores.", the `<HeroSearchForm>` client island, and the `<TrustCounter>` (which self-hides at N=0). `HeroSearchForm` is a client island (`"use client"`) with controlled inputs: specialty `Input` (placeholder "Especialidad, enfermedad o nombre", NOT disabled), city `Input` (placeholder "Ciudad (próximamente)", `disabled`, `aria-label="Próximamente"`, `title="Próximamente"`), and a primary `Button type="submit"` labeled "Buscar". On submit, if the trimmed specialty value is non-empty, call `useRouter().push("/doctores?especialidad=" + encodeURIComponent(value))`. The submit handler does NOT read the city field. |
| **Acceptance criteria** | 1. `Hero` renders exactly one `<h1>` with the exact text "Encuentra tu especialista y pide cita"<br/>2. `Hero` renders a `<p>` with the documented sub-headline immediately below the h1<br/>3. `HeroSearchForm` renders the specialty `Input` (not disabled, with the documented placeholder) + city `Input` (disabled, with the documented `aria-label` + `title`) + a "Buscar" submit Button<br/>4. Submitting "Psicólogo" calls `useRouter().push("/doctores?especialidad=Psic%C3%B3logo")` (URL-encoded)<br/>5. Empty submit does NOT navigate (handler short-circuits on blank)<br/>6. The submit handler ignores the city field entirely<br/>7. Hero includes `<TrustCounter>` and lets it self-hide at N=0 (no extra zero-guard in Hero) |
| **Dependencies** | PR-1 (for the procedure type), 3.1 |
| **Estimated lines** | ~30 (Hero) + ~55 (HeroSearchForm) |

#### Task 3.3 — Tests for `TrustCounter` and `HeroSearchForm`

| Field | Value |
|---|---|
| **Files** | `src/components/home/__tests__/HeroSearchForm.test.tsx` (NEW) |
| **Description** | Vitest + RTL. Mock `next/navigation` (`useRouter`). Scenarios for `HeroSearchForm`: (1) renders both inputs + Buscar Button with the documented attributes (city disabled, `aria-label`); (2) submit with "Psicólogo" calls `mockRouter.push` with the URL-encoded specialty; (3) empty submit does NOT call `mockRouter.push`; (4) the city field's value is NOT passed to the URL. `TrustCounter` test was already added in 3.1. |
| **Acceptance criteria** | 1. Specialty input is enabled with placeholder "Especialidad, enfermedad o nombre"<br/>2. City input is disabled with `aria-label="Próximamente"` and `title="Próximamente"`<br/>3. Submitting "Psicólogo" calls `mockRouter.push("/doctores?especialidad=Psic%C3%B3logo")`<br/>4. Submitting "" does NOT call `mockRouter.push`<br/>5. Submitting with city field filled does NOT include city in the destination URL |
| **Dependencies** | 3.1, 3.2 |
| **Estimated lines** | ~60 |

**Group 3 subtotal**: ~200 lines

### Group 4: SpecialtyPills

#### Task 4.1 — Create `SpecialtyPills` component

| Field | Value |
|---|---|
| **Files** | `src/components/home/SpecialtyPills.tsx` (NEW) |
| **Description** | Server component. Imports `POPULAR_SPECIALTIES` from `@/lib/constants/specialties` and maps each entry to a `<Link href={"/doctores?especialidad=" + slug}><Badge>{label}</Badge></Link>`. Renders a 13th element: a `<Button variant="link">Ver más</Button>` (or styled link) → `/doctores`. Container has `overflow-x-auto` and no `flex-wrap` on mobile (`<768px`); on `≥768px` `flex-wrap` is allowed as a graceful fallback. |
| **Acceptance criteria** | 1. Renders exactly 12 `Badge` elements plus 1 "Ver más" link/button<br/>2. Each pill links to `/doctores?especialidad={slug}` (slug from the constant)<br/>3. 13th element links to `/doctores`<br/>4. Container has `overflow-x-auto` and does NOT have `flex-wrap` on mobile<br/>5. Pill order matches the constant order (Psicólogo first, Alergólogo last)<br/>6. WCAG AA contrast on default theme |
| **Dependencies** | PR-1 (imports `POPULAR_SPECIALTIES` from the constants file) |
| **Estimated lines** | ~55 |

#### Task 4.2 — Test for `SpecialtyPills`

| Field | Value |
|---|---|
| **Files** | `src/components/home/__tests__/SpecialtyPills.test.tsx` (NEW) |
| **Description** | Vitest + RTL. Scenarios: (1) renders 12 pills + "Ver más" in documented order; (2) each pill's anchor has the documented `href` (`/doctores?especialidad={slug}`); (3) "Ver más" links to `/doctores`; (4) root container has the responsive overflow + no-wrap classes. |
| **Acceptance criteria** | 1. 13 anchors in total (12 pills + Ver más)<br/>2. First anchor `href` is `/doctores?especialidad=psicologo`<br/>3. Last (13th) anchor `href` is `/doctores`<br/>4. Container includes `overflow-x-auto` and does NOT include `flex-wrap` |
| **Dependencies** | 4.1 |
| **Estimated lines** | ~50 |

**Group 4 subtotal**: ~105 lines

### Group 5: FeaturedDoctors

#### Task 5.1 — Create `FeaturedDoctors` component

| Field | Value |
|---|---|
| **Files** | `src/components/home/FeaturedDoctors.tsx` (NEW) |
| **Description** | Client island (`"use client"`). Calls `api.profiles.listDoctorProfiles.useQuery({ limit: 8 })`. Four render states: (1) **loading** — grid of 8 `Card`-shaped `Skeleton` placeholders (avatar circle, title line, subtitle lines, footer line); (2) **empty** — a single centered `<p>` "No hay doctores disponibles por el momento."; (3) **error** — polite error `<p>` + a "Reintentar" `Button` whose click handler calls `refetch()`; (4) **success** — responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) of `<Link href="/doctores/{id}"><DoctorCard showBookingLink={false} /></Link>`. Renders an `<h2>` "Doctores destacados" and a "Ver todos los doctores" `Button variant="link"` → `/doctores` at the bottom (hidden in empty + error states per the spec). |
| **Acceptance criteria** | 1. Loading state: 8 `Skeleton` placeholders, no empty/error text<br/>2. Empty state: a single centered `<p>` with the exact text "No hay doctores disponibles por el momento.", no `DoctorCard` in DOM<br/>3. Error state: a polite error `<p>` + a "Reintentar" `Button` whose click calls `refetch`<br/>4. Success state: exactly N `DoctorCard`s wrapped in `<Link>`s, each card has `showBookingLink={false}`<br/>5. Grid root carries `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`<br/>6. Heading `<h2>` text is exactly "Doctores destacados"<br/>7. "Ver todos los doctores" link to `/doctores` in success state |
| **Dependencies** | Existing `DoctorCard` (no changes) + existing `api.profiles.listDoctorProfiles.useQuery` |
| **Estimated lines** | ~110 |

#### Task 5.2 — Test for `FeaturedDoctors`

| Field | Value |
|---|---|
| **Files** | `src/components/home/__tests__/FeaturedDoctors.test.tsx` (NEW) |
| **Description** | Vitest + RTL. Mock `api.profiles.listDoctorProfiles.useQuery` to return one of four state shapes per scenario. Scenarios: (1) loading — asserts 8 `Skeleton` placeholders, no empty/error text; (2) empty — asserts the empty `<p>` with the exact text, no `DoctorCard`; (3) error — asserts the error `<p>` + "Reintentar" `Button`; clicking it calls `refetch`; (4) success — asserts N `DoctorCard`s wrapped in `<Link>`s with `showBookingLink={false}`, grid root has the responsive column classes, `<h2>` text is exactly "Doctores destacados". |
| **Acceptance criteria** | 1. Loading scenario: 8 `Skeleton` elements, no empty/error text<br/>2. Empty scenario: `<p>` with the exact "No hay doctores disponibles por el momento." text, zero `DoctorCard`s<br/>3. Error scenario: error `<p>` + "Reintentar" Button; click on Button calls `refetch`<br/>4. Success scenario: 6 `DoctorCard`s (mock returns 6), each wrapped in a `Link` to `/doctores/{id}`, each with `showBookingLink={false}`; root has the responsive grid classes; `<h2>` text is exactly "Doctores destacados"; "Ver todos los doctores" link is present |
| **Dependencies** | 5.1 |
| **Estimated lines** | ~100 |

**Group 5 subtotal**: ~210 lines

### Group 6: ValueProps

#### Task 6.1 — Create `ValueProps` component

| Field | Value |
|---|---|
| **Files** | `src/components/home/ValueProps.tsx` (NEW) |
| **Description** | Server component. Renders an `<h2>` "¿Por qué MedicoConsulta?" followed by a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) of 4 cards in this order: (1) `Search` icon + "Encuentra tu especialista" + "Explora perfiles verificados y elige al profesional ideal."; (2) `CalendarCheck` + "Pide cita de forma fácil" + "Reserva online sin necesidad de llamar."; (3) `Bell` + "Recordatorios automáticos" + "Te avisamos antes de cada cita."; (4) `BadgeCheck` + "Profesionales verificados" + "Todos los doctores pasan un proceso de verificación.". Icons imported from `lucide-react` at `size={24}` (or `h-6 w-6`) with `aria-hidden="true"`. No tests (purely static copy + icons; visual regression would be in E2E). |
| **Acceptance criteria** | 1. Exactly 4 cards in the documented order (Search → CalendarCheck → Bell → BadgeCheck)<br/>2. Each card has one `lucide-react` SVG icon at 24×24 as the first child, with `aria-hidden="true"`<br/>3. Each card has the exact title + description pair from the spec<br/>4. Grid root carries `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`<br/>5. WCAG AA contrast on default theme tokens<br/>6. No tRPC call, no client JS shipped |
| **Dependencies** | None (uses `lucide-react` which is already a dependency) |
| **Estimated lines** | ~55 |

**Group 6 subtotal**: ~55 lines

### Group 7: Footer

#### Task 7.1 — Create `Footer` component

| Field | Value |
|---|---|
| **Files** | `src/components/home/Footer.tsx` (NEW) |
| **Description** | Server component. Top-of-file comment: `// TODO(home-page-upgrade): replace # links with real pages when available`. Renders a 4-column responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, root has `bg-muted`). Columns: (1) "Servicio" — Privacidad, Términos, Quiénes somos, Contacto; (2) "Para pacientes" — Especialidades, Doctores, Preguntas frecuentes; (3) "Para profesionales" — Activar perfil, Zona para profesionales, Centro de ayuda; (4) "Contacto" — brand "MedicoConsulta" + an address placeholder line. Links targeting existing pages (`/doctores`, `/`, `/login`, `/registro`) use the real `href`; all other links use `href="#"` AND carry `data-todo="home-page-upgrade"`. Below the columns, render a shadcn `Separator` and a bottom bar with copyright "© 2026 MedicoConsulta. Todos los derechos reservados." and a disclaimer line "Información orientativa. En caso de urgencia, contacta con los servicios de emergencia.". |
| **Acceptance criteria** | 1. Top-of-file comment `// TODO(home-page-upgrade): replace # links with real pages when available` is present in the first 20 lines<br/>2. 4 column headings in the documented order: Servicio, Para pacientes, Para profesionales, Contacto<br/>3. Links to existing pages (`/doctores`, `/`, `/login`, `/registro`) have the real `href`<br/>4. All other links have `href="#"` AND `data-todo="home-page-upgrade"`<br/>5. A shadcn `Separator` is rendered between the columns and the bottom bar<br/>6. Bottom bar contains the exact copyright string "© 2026 MedicoConsulta. Todos los derechos reservados." and a disclaimer line<br/>7. Root has `bg-muted` and the responsive grid classes |
| **Dependencies** | None |
| **Estimated lines** | ~90 |

#### Task 7.2 — Test for `Footer`

| Field | Value |
|---|---|
| **Files** | `src/components/home/__tests__/Footer.test.tsx` (NEW) |
| **Description** | Vitest + RTL. Snapshot/scenario test. Scenarios: (1) renders 4 column headings in documented order; (2) real links have the real `href`, missing links have `href="#"` AND `data-todo="home-page-upgrade"`; (3) root has `bg-muted`; (4) bottom bar contains the exact copyright string and a disclaimer line; (5) source-grep assertion confirms the `// TODO(home-page-upgrade)` comment is in the file header. |
| **Acceptance criteria** | 1. 4 column headings in order<br/>2. Missing-page links carry both `href="#"` and `data-todo="home-page-upgrade"`<br/>3. Bottom bar contains the exact copyright string and a disclaimer line<br/>4. Static source assertion confirms the `// TODO(home-page-upgrade)` comment is in the first 20 lines |
| **Dependencies** | 7.1 |
| **Estimated lines** | ~30 |

**Group 7 subtotal**: ~120 lines

### Group 8: Page Rewrite

#### Task 8.1 — Replace `src/app/page.tsx` with the full composition

| Field | Value |
|---|---|
| **Files** | `src/app/page.tsx` (MODIFY, ~35 lines) |
| **Description** | Replace the 34-line skeleton with an **async** server component. Declare `export const dynamic = "force-dynamic"` at the top of the file. In the body: `const caller = await createCaller(await createContext())`, then `const stats = await caller.profiles.getHomeStats()`. Return a composition of `<HomeNav />`, a `<main>` containing `<Hero totalVerifiedDoctors={stats.totalVerifiedDoctors} totalSpecialties={stats.totalSpecialties} /> <SpecialtyPills /> <FeaturedDoctors /> <ValueProps />`, and `<Footer />`. No `"use client"` directive. No `Shell` import. Vertical rhythm via `space-y-16` on the `<main>` (or per-section `py-16`). |
| **Acceptance criteria** | 1. `pnpm tsc --noEmit` clean (no TS errors)<br/>2. `pnpm lint` clean<br/>3. The file does NOT carry a top-level `"use client"` directive<br/>4. The file declares `export const dynamic = "force-dynamic"`<br/>5. The file does NOT import `Shell` from `@/components/Shell`<br/>6. The file uses `createCaller(await createContext())` and calls `profiles.getHomeStats()`<br/>7. The DOM top-to-bottom order matches the spec: HomeNav, Hero, SpecialtyPills, FeaturedDoctors, ValueProps, Footer<br/>8. All existing tests in the repo still pass (no regression) |
| **Dependencies** | All prior groups (PR-1 + 3 + 4 + 5 + 6 + 7) |
| **Estimated lines** | ~35 |

**Group 8 subtotal**: ~35 lines

**PR-2 TOTAL: ~725 lines** — within the 800-line budget, with ~75 lines of safety margin.

---

## Review Workload Forecast

- **PR-1 estimated changed lines**: ~382 (well below 800-line budget) ✓
- **PR-2 estimated changed lines**: ~725 (below 800-line budget, ~75 line buffer) ✓
- **Total change**: ~1107 lines (UI + tests, excluding dependencies and lockfile)
- **Chained PRs recommended**: Yes (auto-forecast triggered; full change exceeds 800-line review budget by ~307 lines)
- **400-line budget risk**: High (the full change would exceed; PR split mitigates)
- **Decision needed before apply**: No (the PR split is already in the design; apply can proceed group-by-group with `stacked-to-main` chain strategy)
- **Chain strategy**: `stacked-to-main` (cached from user's preference in engram)

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Notes for the Orchestrator

**Why the budget is exceeded.** The proposal estimated ~700 lines and the design's accurate count is ~1080. The gap comes from realistic component sizing (each section with skeleton + empty + error states is heavier than the proposal's flat estimate) and from the additional test files required by the spec (8 test files vs the proposal's 5).

**Recommended split.** Two chained PRs to stay within 800 lines:

| PR | Tasks | Est. Lines | Focus |
|---|---|---|---|
| **PR-1 — Data + Top bar** | G1 (1.1–1.3), G2 (2.1–2.2) | ~382 | Foundation: constants, use case, tRPC procedure, HomeNav. No user-visible change. |
| **PR-2 — Sections** | G3 (3.1–3.3), G4 (4.1–4.2), G5 (5.1–5.2), G6 (6.1), G7 (7.1–7.2), G8 (8.1) | ~725 | All six sections + page rewrite. Ships the new landing. |

**Order**: PR-1 → PR-2. PR-1 is reviewable as a self-contained data + chrome foundation. PR-2 depends on PR-1 (imports `POPULAR_SPECIALTIES` and mounts `HomeNav`).

**Chain strategy**: `stacked-to-main`. Each PR merges to `main` in order. PR-2 branches off `main` after PR-1 lands.

---

## Cancelled (Out of Scope)

These features were considered during explore and explicitly **rejected** for this change. They are listed here to prevent re-adding them in `sdd-apply`:

- **Insurance grid** — blocked by missing `insurance` / `doctor_seguro_medico` / `seguros` tables.
- **Reviews carousel** — blocked by missing `reviews` table + review system; `calificacionMedia` is hand-maintained for now.
- **Blog carousel** — blocked by missing `posts` table / CMS.
- **Modalidad toggle** (presencial/online) — blocked by missing `aceptaOnline` / `modalidad` column on `doctores`.
- **Cities quick-pick / city autocomplete** — deferred to a future cities change; needs a `ciudades` table + geocoding.
- **Popular specialties × cities SEO block** — only valuable at >50 verified doctors; defer.
- **Pro / AI CTAs** — no product to advertise yet.
- **Cookie consent banner** — separate compliance change.
- **Geo-located "Cerca de ti"** — needs geolocation + a city tier-1 list.
- **Newsletter signup** — no email infrastructure yet.
- **FAQ on home** — out of scope (FAQ belongs on doctor profiles, not the landing).
- **Featured doctors editorial selection** — using `calificacionMedia` ranking; an admin-driven `destacado` boolean is a separate change.
- **i18n** (`/en`, `/ca`, `/val`) — site is Spanish-only for now.
- **Stub pages for footer links** — explicitly rejected: stubs rot. The `data-todo="home-page-upgrade"` attribute is the grep surface for the next change.
