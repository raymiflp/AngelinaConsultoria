# Proposal: Home Page Upgrade (Doctoralia-style Landing)

## Change Name

`home-page-upgrade`

## Intent

Upgrade the public home page at `/` (`src/app/page.tsx`) from a 34-line skeleton (one H1, one paragraph, three links) to a multi-section landing page modeled on Doctoralia's marketing experience. The current page is functional but uninformative — patients land, read one sentence, and bounce. The target state delivers a real entry point: a search hero, a trust counter, twelve specialty pills, a featured-doctors grid, three value props, and a structured footer. The change is purely presentational plus one new tRPC procedure (`getHomeStats`); no DB schema is touched and no new tables are introduced.

The change is **deliberately scoped to Slice A only**. The Doctoralia reference includes insurance companies, patient reviews, a blog, a modality toggle (presencial / online), city autocomplete, and SEO cross-link blocks. None of those have a backing data model in this codebase — `doctor_insurance`, `reviews`, and `blog_posts` tables do not exist; the verified-doctor row does not yet carry a `modalidad` field; city geocoding requires an external service. Shipping Slice A first proves the visual language and the data plumbing, and unblocks the next change to add each data source as it lands.

The previous change (`2026-06-15-doctor-profile-page`) built the public **detail** page; this change builds the public **landing** page. Both share `DoctorCard` and the public tRPC procedures; both respect the same auth boundary (anonymous-readable).

## Scope

### In Scope — Slice A

| # | Section | What we build | Data source |
|---|---|---|---|
| 1 | **Top bar** (`HomeNav`) | Slim marketing nav: logo, two links (`Buscar doctores`, `Cómo funciona`), theme toggle, `Iniciar sesión` / `Mi cuenta` dropdown (driven by `useSession()`) | Auth.js session, shadcn `Button` + `DropdownMenu` |
| 2 | **Hero** | Headline, sub-headline, two-field search (especialidad + ciudad), primary "Buscar" CTA, decorative doctor illustration placeholder | Hard-coded specialty slug, navigation to `/doctores?especialidad=...` |
| 3 | **Trust counter** | Stat strip — "**N** doctores verificados · **M** especialidades" — rendered only when `N > 0` | `getHomeStats` (new) |
| 4 | **Specialty pills** | Twelve rounded badges linking to `/doctores?especialidad={slug}` | Hard-coded constant |
| 5 | **Featured doctors** | Server-rendered grid of up to 6 verified doctors reusing `DoctorCard` | `listDoctorProfiles` (existing), filtered to `verificado = true` and `calificacionMedia IS NOT NULL`, ordered by rating DESC |
| 6 | **Value props** | Three-column section: "Verificados", "Reserva online", "Datos seguros" | Static copy + Lucide icons |
| 7 | **Footer** | 4-column footer: Producto / Pacientes / Doctores / Legal — with a `// TODO(home-page-upgrade)` block for the links that have no real path | Hard-coded columns |
| 8 | **`getHomeStats`** (new tRPC) | `publicProcedure.query()` returning `{ totalVerifiedDoctors, totalSpecialties }` | `COUNT(*) WHERE verificado = true` + `COUNT(DISTINCT especialidad) WHERE verificado = true` |

**Modified files (2):**

- `src/app/page.tsx` — replace 34-line skeleton with server-component composition
- `src/infrastructure/api/routers/profiles.ts` — add `getHomeStats` (the actual router lives at `src/infrastructure/api/routers/`, not `src/server/api/`; the prompt's path was a hint at the structural location, not the literal path)

**New files (~7):**

| File | Purpose |
|---|---|
| `src/lib/constants/specialties.ts` | Hard-coded array of 12 `{ slug, label }` pairs |
| `src/lib/constants/specialties.test.ts` | Asserts the array is non-empty and slug uniqueness |
| `src/application/use-cases/profiles/get-home-stats.use-case.ts` | Use case for the counts query |
| `src/components/home/HomeNav.tsx` | Client island — top bar with `useSession()` |
| `src/components/home/HeroSearchForm.tsx` | Client island — controlled inputs + submit navigation |
| `src/components/home/FeaturedDoctors.tsx` | Server component — calls `listDoctorProfiles` via `createCaller` |
| `src/components/home/Footer.tsx` | Server component — 4-column footer |
| `src/infrastructure/api/routers/__tests__/profiles.getHomeStats.test.ts` | Unit test for the new procedure |

No new shadcn components. No DB migrations.

### Out of Scope

| Feature | Reason | Future change |
|---|---|---|
| **Insurance companies** | No `doctor_seguro_medico` or `seguros` table exists; the verified-doctor row has no `segurosAceptados` field | After the insurance schema ships |
| **Patient reviews** (list, distribution, write-a-review form) | No `reviews` table exists; `calificacionMedia` is hand-maintained | After the reviews schema ships |
| **Blog / content marketing** | No `posts` table exists | Future content change |
| **Modality toggle** (presencial / online) | `doctores` has no `modalidad` column | After the modality schema ships |
| **City autocomplete** | No `ciudades` table; needs geocoding or seeded list | Future search-quality change |
| **SEO cross-link block** ("Doctores más buscados en Madrid…") | Same city requirement; needs Meilisearch indexing not yet live | After Meilisearch is wired |
| **Pro / AI assistant CTA** | No product offering yet | Marketing decision |
| **Featured doctors editorial selection** | Use ranking by `calificacionMedia` DESC for now; an admin-driven `destacado` boolean is a separate change | After the admin panel grows |
| **i18n** (`/en`, `/ca`, `/val`) | The site is Spanish-only for now | Future i18n change |

## Default Decisions

These five questions were answered during explore. They are committed to the proposal so the spec phase does not have to re-litigate them.

### D1 — Specialty pills source

**Decision:** Hard-coded top-12 array in `src/lib/constants/specialties.ts`, exported as a frozen `readonly` tuple.

```ts
// src/lib/constants/specialties.ts
export const TOP_SPECIALTIES = [
  { slug: "psicologo",       label: "Psicólogo" },
  { slug: "ginecologo",      label: "Ginecólogo" },
  { slug: "traumatologo",    label: "Traumatólogo" },
  { slug: "dermatologo",     label: "Dermatólogo" },
  { slug: "psiquiatra",      label: "Psiquiatra" },
  { slug: "dentista",        label: "Dentista" },
  { slug: "medico-general",  label: "Médico general" },
  { slug: "otorrino",        label: "Otorrino" },
  { slug: "oftalmologo",     label: "Oftalmólogo" },
  { slug: "urologo",         label: "Urólogo" },
  { slug: "podologo",        label: "Podólogo" },
  { slug: "alergologo",      label: "Alergólogo" },
] as const;

export type SpecialtySlug = (typeof TOP_SPECIALTIES)[number]["slug"];
```

**Rationale:** The schema stores `especialidad` as a free-text `varchar` — there is no canonical list, no admin UI to maintain one, and no `especialidades` table. Pulling distinct values from `doctores.especialidad` would surface typos and one-off spellings ("Cardiologo" vs "Cardiólogo"). A hard-coded curated list ships deterministically, has zero runtime cost, and matches Doctoralia's top-12. When an `especialidades` table lands later, this constant becomes the seed file for it.

**Alternative considered:** `SELECT DISTINCT especialidad FROM doctores WHERE verificado = true` ranked by `COUNT(*)` — rejected because the data set is small and dirty; marketing wants editorial control over the top row.

### D2 — Top bar: `HomeNav`, not `Shell`

**Decision:** New public-only component `src/components/home/HomeNav.tsx` (client island). The home is a **marketing page** with a different visual language than authenticated routes; `Shell` is built for the dashboard (sidebar, user menu, role-based nav). We do not import `Shell`. We may import small primitives from `Header` (e.g. the `ThemeToggle`) only if they are independently usable.

**Rationale:** Two layout systems, two purposes. `Shell` assumes the user is inside a session-driven app. `HomeNav` is a thin marketing bar that collapses to logo + hamburger on mobile and surfaces auth state via a dropdown. Mixing them would force the marketing page to render a sidebar it never wanted.

**Alternative considered:** Reuse `Shell` and override its header — rejected because it adds prop-drilling and conditional logic to a component that does not need them.

### D3 — Trust counter hidden when zero

**Decision:** The stat strip is rendered only when `getHomeStats().totalVerifiedDoctors > 0`. If the count is 0 (empty seed, fresh deploy, in a test env), the entire section is not rendered — we do not show "0 doctores verificados".

**Rationale:** A "0 verified doctors" message on the public landing is a trust-destroyer for first impressions. Hiding it keeps the page honest in the empty case; once any verified doctor exists, the counter appears with real data. The implementation is a single conditional in the server component; no `null` vs `{ count: 0 }` branching is needed downstream.

**Alternative considered:** Always render with the count — rejected. Always render with a generic "Confía en MedicoConsulta" copy when zero — rejected because it adds a translation surface and a code path that will be hard to test.

### D4 — Hero city input is decorative in v1

**Decision:** The hero contains two inputs: **especialidad** (functional) and **ciudad** (decorative `<Input disabled>` with placeholder "Ciudad (próximamente)"). On submit, only the specialty field is read — the form pushes `router.push("/doctores?especialidad=" + encodeURIComponent(slug))`. The existing `/doctores` page (`src/app/doctores/page.tsx`) already reads `especialidad` from the URL and filters by it.

**Rationale:** Wiring the city field to anything (table, autocomplete, query param) is out of scope. A `disabled` input signals "we know it should be here" without pretending it works. The submit button is still functional for the one field that does work.

**Alternative considered:** Remove the city input — rejected. Doctoralia's hero has two fields; removing it makes the section look thinner and reduces visual balance. Dropping it later is cheap; adding it back later is not.

### D5 — Footer links: real paths where they exist, `href="#"` + TODO otherwise

**Decision:** The footer renders four columns with real anchor text. Where the destination page exists in this codebase (`/login`, `/registro`, `/doctores`, `/`), the link points at it. Where it does not (e.g. `/terminos`, `/privacidad`, `/como-funciona`, `/ayuda`, `/para-doctores`), the link uses `href="#"` and the top of `Footer.tsx` carries a single multi-line `// TODO(home-page-upgrade): replace "#" with real paths when these pages ship` comment. **No stub pages will be created.**

**Rationale:** Stubs rot. They block reviews, accumulate dead routes, and create a 404 surface for crawlers. A `// TODO` block at the top of one file is a single-source-of-truth the next change can scan. It also keeps this change inside the 800-line budget.

**Alternative considered:** Create thin placeholder pages (`/terminos`, `/privacidad`) — rejected. The legal copy needs legal review; the how-it-works page needs a product decision. Both are separate changes.

## Stakeholders / Impact

| Stakeholder | Impact |
|---|---|
| **PACIENTE** (anonymous visitor) | **Positive.** Lands on a page that actually tells them what MedicoConsulta is and gets them to a doctor in one click. Reduces bounce on the first session. |
| **DOCTOR** (verified profile owner) | **Positive, conditional.** Featured visibility on the home page is a free upgrade in discoverability. They do not control whether they are featured yet — it's a `calificacionMedia` ranking, which means an unrated doctor cannot be featured until they get a rating. This is a fair v1 rule. |
| **Marketing / SEO** | **Partial.** The home page now has real semantic content (h1, h2, h3, links), which is better for crawlers than the previous "Welcome to MedicoConsulta" page. But the SEO matrix (city pages, specialty pages, blog) is **not** in this change. |
| **Product** | **Sets the visual language** for all future public pages (about, pricing, blog). All design tokens, button styles, spacing, and color usage established here are reused. |
| **Doctor listing page** (`/doctores`) | **Indirect.** Receives a new query-param source from the home hero. The listing page already reads `especialidad`, so no change is needed there. |
| **Auth flow** (`/login`, `/registro`) | **None.** The top bar links to them, but the routes are untouched. |

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Empty seed data at first deploy** — `getHomeStats.totalVerifiedDoctors === 0` so the trust counter hides, but the featured-doctors grid is also empty. The home page renders without social proof. | Medium | Medium | The grid already has an empty state (renders the specialty pills and the hero as fallbacks). If desired, the apply phase can add a "Sé el primero" CTA to `/registro` for doctors when the grid is empty. Decision deferred to design phase. |
| 2 | **Hard-coded specialties drift from real taxonomy** — when the `especialidades` table ships, the pills will need to be regenerated. | Medium | Low | The constant lives in `src/lib/constants/specialties.ts` — a single import surface. The migration is mechanical. Add a comment block at the top of the file warning future maintainers. |
| 3 | **800-line review budget overrun** — the change spans ~7 new files plus the page rewrite. UI components with copy tend to bloat. | Medium | Medium | The apply phase tracks line counts. If we cross 700, split into two PRs: PR-1 = constants + `getHomeStats` + `HomeNav` + `Hero`; PR-2 = `SpecialtyPills` + `FeaturedDoctors` + `ValueProps` + `Footer`. The split is along visible section boundaries, so each PR is independently shippable. |
| 4 | **`force-dynamic` on root layout** — the home page is server-rendered, but `src/app/layout.tsx` declares `export const dynamic = "force-dynamic"` for the whole app. This blocks static generation and costs a DB query per page load. | High | Low | The home is a public marketing page where freshness is acceptable (counts update as doctors verify). Mitigation: short cache (revalidate every 60s) on `getHomeStats` if latency is observed in production. The decision is explicit — the alternative (making the home static and fetching stats client-side) kills the SEO win. |
| 5 | **Featured doctors list leaks unrated doctors if `calificacionMedia` is null** — `ORDER BY calificacionMedia DESC` puts nulls last in Postgres, but Drizzle may sort them differently across versions. | Low | Low | The query filters `calificacionMedia IS NOT NULL` in addition to `verificado = true`. Test asserts the result has no null ratings. |
| 6 | **New tRPC procedure (`getHomeStats`) accidentally becomes a public vector for DB timing** — sequential COUNTs can leak row counts. | Low | Low | Both counts are already implicit in `listDoctorProfiles` (it returns up to 50 rows). The new procedure exposes the same information with explicit names. If a future hardening pass wants to hide exact counts, both endpoints need the same treatment. |

## Rollback Plan

This is a UI-only change plus one additive tRPC procedure. Rollback is straightforward:

1. **Revert the PR** — the entire change lives in the home page composition (`src/app/page.tsx`), the new `home/` components, the `specialties` constant, and the new `getHomeStats` procedure. A `git revert` of the merge commit restores the previous 34-line skeleton.
2. **Delete `getHomeStats`** — the procedure has no consumers outside `src/app/page.tsx`. No DB migration to undo, no foreign-key impact, no client caching to invalidate.
3. **Verify `/` renders** the old skeleton. No other page in the app is touched.

There is **no migration rollback** because there are no schema changes. There is **no feature flag** — the previous change (`doctor-profile-page`) also did not use one. If we want a flag for this change, the apply phase can add a single env-var gate around the new components; the spec phase should call this out if it wants it.

## Architecture Decisions

### Mini-ADR table

| ID | Decision | Rationale | Alternatives Considered |
|---|---|---|---|
| **AD-1** | Add new public tRPC procedure `getHomeStats` returning `{ totalVerifiedDoctors: number, totalSpecialties: number }`. Implementation in `src/infrastructure/api/routers/profiles.ts` calling a new `getHomeStatsUseCase` at `src/application/use-cases/profiles/get-home-stats.use-case.ts`. | Avoids over-fetching from `listDoctorProfiles` (which returns up to 50 rows + join on `usuarios`) just to read a count. A focused `COUNT(*)` + `COUNT(DISTINCT especialidad)` is one DB round trip with no joins. Makes the data shape explicit and stable. | (a) Call `listDoctorProfiles` and compute client-side — rejected, requires fetching 50 rows to get a count and ties the stat to the listing's filter semantics. (b) Use Drizzle's `sql` template for an aggregate inline in the router — rejected, breaks the application-layer boundary that the rest of the project enforces. |
| **AD-2** | Home page is an **async server component** that calls `getHomeStats` and `listDoctorProfiles` via the existing `createCaller(createContext())` server-side caller (`src/infrastructure/api/server-caller.ts`). The hero search form is a small **client island** (`HeroSearchForm`) that uses `useRouter().push()`. | Server rendering keeps the page SEO-indexable (full markup in the initial HTML response) and makes the trust counter and featured grid visible to crawlers without JS. The `createCaller` primitive already exists in the codebase, even though no page uses it yet — this is its first consumer. The hero form must be a client component because it owns controlled inputs and submits. | (a) Full client component — rejected, kills the SEO win and adds a loading flash on every visit. (b) Static page + client fetch — rejected, requires a separate `/api/home-stats` REST endpoint and duplicates the tRPC schema. |
| **AD-3** | Reuse `DoctorCard` (`src/components/profiles/DoctorCard.tsx`) as-is in the featured grid. No new card variant. | `DoctorCard` already accepts `DoctorPublicResponse` (id, nombre, email, especialidad, biografia, precioConsulta, calificacionMedia) — the 7 fields it needs. Building a new "FeaturedCard" with different visuals would be code duplication for no win. The full `DoctorHero` is for the doctor detail page only and would be visually wrong at grid scale. | (a) New `FeaturedDoctorCard` with rating badge and "Destacado" ribbon — rejected, the rating already lives in `DoctorCard`. (b) Inline a custom card — rejected, breaks the established `DoctorCard` contract used by `/doctores`. |
| **AD-4** | No new shadcn components. Use only existing primitives: `Button`, `Input`, `Card`, `Badge`, `Separator`, `DropdownMenu`, `Sheet`, plus Lucide icons. | Minimize dependency surface and review footprint. The previous change (`2026-06-15-doctor-profile-page`) shipped with the same discipline. If a real need surfaces during apply (e.g. an `Accordion` for the footer), add it then. | (a) Pull in `react-icons` for richer marketing icons — rejected, Lucide is already in use everywhere. (b) Add `shadcn blocks` (marketing components) — rejected, they are too opinionated and would change the visual baseline. |
| **AD-5** | `HomeNav` uses the existing `Button` + `DropdownMenu` from shadcn. Auth state is read with `useSession()` from `next-auth/react`. No new primitives. | Zero new design-system surface. The dropdown shows "Mi cuenta" (link to `/dashboard`) when authenticated, or "Iniciar sesión" + "Registrarse" when anonymous. The mobile collapse uses a `Sheet` if it fits cleanly, otherwise a simple burger that toggles a `useState` flag. | (a) Build a custom avatar with the user's initials — rejected, `UserMenu` already does this for `Header`. (b) Hide auth CTAs entirely — rejected, signup is a primary conversion goal. |

## Estimated Size

| Category | Items | Lines |
|---|---|---|
| **Constants** | `specialties.ts` + test | ~40 |
| **Application layer** | `get-home-stats.use-case.ts` | ~30 |
| **API layer** | New procedure in `profiles.ts` + test | ~80 |
| **Server caller usage** | (already exists — `createCaller`) | 0 |
| **Components** | `HomeNav` (~80), `HeroSearchForm` (~60), `FeaturedDoctors` (~70), `Footer` (~80), `SpecialtyPills` (~30) | ~320 |
| **Page** | Rewrite `src/app/page.tsx` from 34 to ~80 lines (server component composition) | ~50 (delta) |
| **Value props** | Inline in page (static copy, no separate file) | ~30 |
| **Total implementation** | | **~550** |
| **Tests** | 5 test files × ~30 lines each (specialty constant, `getHomeStats` query, `HeroSearchForm` submit nav, `FeaturedDoctors` rendering states, `HomeNav` session states) | **~150** |
| **Grand total** | | **~700** |

Within the 800-line review budget. If apply overshoots, split PR-1 (constants + `getHomeStats` + `HomeNav` + `Hero`) and PR-2 (pills + grid + value props + footer) along the section boundaries above.

## Out of Scope (mirror)

Same list as the § "Out of Scope" above. Kept here for the orchestrator and the spec agent to scan without flipping back:

- Insurance companies
- Patient reviews
- Blog / content marketing
- Modality toggle (presencial / online)
- City autocomplete
- SEO cross-link block ("Doctores más buscados en…")
- Pro / AI assistant CTA
- Editorial featured-doctor selection
- i18n

## Open Questions

None — all decisions taken under § Default Decisions (D1–D5).

## Next Steps

1. **Spec** (`sdd-spec`): Write delta specs covering:
   - `home-ui` — scenarios for the six sections, loading and empty states for the trust counter and featured grid, specialty-pill click navigation, footer column structure
   - `home-api` — scenarios for `getHomeStats` (success, both counts at zero, race with concurrent doctor verifications)
   - `specialties-constants` — the 12-entry hard-coded taxonomy, slug uniqueness, label case rules
2. **Design** (`sdd-design`): Technical design covering the RSC data flow, the new tRPC procedure's SQL, the home page component tree, and the `getHomeStats` use-case signature
3. **Tasks** (`sdd-tasks`): Break into granular implementation tasks
4. **Apply** (`sdd-apply`): Implement
5. **Verify** (`sdd-verify`): Prove implementation matches specs
6. **Archive** (`sdd-archive`): Sync delta specs into the canonical `openspec/specs/` tree
