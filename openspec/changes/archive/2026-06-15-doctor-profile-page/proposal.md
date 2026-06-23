# Proposal: Doctor Profile Page (Doctoralia-style)

## Change Name

`doctor-profile-page`

## Intent

Upgrade the public doctor profile page at `/doctores/[id]` from a minimal single-card layout (7 fields: name, email, specialty, bio, price, rating, book CTA) to a rich, multi-section profile page comparable to Doctoralia doctor profiles. Patients get a comprehensive view of a doctor's professional credentials, services, and treated conditions before booking.

## Scope

### In Scope (Phase 1 — Professional Data)

| Section | What We Build | Key Fields |
|---|---|---|
| **Hero** | Expanded doctor header: photo, name, specialty, license number, location, years experience, languages, rating + review count, CTAs (book, call) | `fotoUrl`, `numeroColegiado` (public), `ubicacionConsulta`, `añosExperiencia`, `idiomas`, `telefonoConsulta`, `calificacionMedia`, review aggregate |
| **Experience** | Timeline-style education & work history entries | `doctor_education` table — `titulo`, `institucion`, `tipo` (EDUCACION/EXPERIENCIA), date range, description |
| **Services & Prices** | Service catalog with individual pricing, duration, and per-service "Reservar" | `doctor_services` table — `nombre`, `descripcion`, `precio`, `duracionMinutos`, `activo` |
| **Treated Conditions** | Tag cloud of conditions the doctor treats | `doctor_conditions` table — free-text condition names |

**DB changes:**
- Extend `doctores` table: `foto_url`, `ubicacion_consulta`, `años_experiencia`, `idiomas` (text[]), `telefono_consulta`
- New tables: `doctor_education`, `doctor_services`, `doctor_conditions`
- Migrate `numeroColegiado` exposure: make it public on the profile (currently in entity, hidden from public API)

**API changes:**
- Add `getDoctorFullProfile` — single public endpoint returning all Phase 1 data (hero + education + services + conditions)
- Add `getDoctorServices` — convenience endpoint for service catalog (pairs with future booking per-service)
- Keep existing `getDoctorProfile` for backward compatibility with listing pages — do NOT delete it

**Component changes:**
- New components: `DoctorHero`, `DoctorExperience`, `DoctorServices`, `DoctorConditions`, `DoctorProfileSkeleton`
- Rewrite `DoctorDetailPage` (`src/app/doctores/[id]/page.tsx`) from single-card to multi-section layout
- Keep `DoctorCard` unchanged — it still serves `/doctores` listing

**Domain changes:**
- Extend `Doctor` entity: `fotoUrl`, `ubicacionConsulta`, `añosExperiencia`, `idiomas`, `telefonoConsulta`
- New entities: `DoctorEducation`, `DoctorService`, `DoctorCondition`
- Extend `DoctorPublicResponse` with new hero fields (or create `DoctorFullProfileResponse`)

### Out of Scope

| Feature | Reason | Future Phase |
|---|---|---|
| **Insurance companies** grid | Needs `doctor_insurance` table + component | Phase 2 |
| **Patient reviews** (individual reviews, rating distribution, review form) | Needs `reviews` table + 4+ components + review moderation | Phase 2 |
| **FAQ section** | Needs `doctor_faq` table + accordion component | Phase 2 |
| **Map / location** (Leaflet/Google Maps) | Needs map integration + `DoctorLocation` component | Phase 3 |
| **Photo upload** (MinIO file storage) | Use external URLs for now | Phase 3 |
| **Doctor edit UI** (tabs-based profile editor) | Doctors can only edit via existing `/perfil` for now | Phase 3 |
| **Admin review moderation panel** | Needs admin UI for approving/removing reviews | Phase 3 |
| **Chat / messaging CTA** | Not planned yet | Future |
| **Video consultation integration** | Not planned yet | Future |
| **Meilisearch / search indexing** | Not planned yet | Future |

### Why Phase 1 Only

The 800-line review budget constrains how much we can ship in one change. Phase 1 alone touches:
- 3 new DB tables + schema migrations
- 1 extended table (5 new columns)
- 2 new tRPC endpoints
- 4 new UI components
- 3 new domain entities
- 1 page rewrite

This is already a substantial change. Phase 2 (Reviews + FAQ + Insurance) and Phase 3 (Map + Edit UI) are sized for independent changes that can be stacked sequentially.

## Default Decisions

Given auto mode — these decisions are made without question rounds:

| Decision | Choice | Rationale |
|---|---|---|
| **`numeroColegiado` public** | YES, expose it on Hero section | Builds trust; Doctoralia does it; it's already in the domain entity but was hidden from the public API — this is a data leak prevention choice we are reversing consciously |
| **Photo storage** | External URLs (varchar) | MinIO is not ready; accepting URLs keeps this change self-contained |
| **Map** | Skip — address text only | Maps require API keys, cost, and a separate integration; address text is sufficient for Phase 1 |
| **API approach** | Hybrid: `getDoctorFullProfile` (single call) + section endpoints | One call for the full page, convenience endpoint for services (which booking will need independently) |
| **`DoctorCard` reuse** | Keep as-is for listing; new components for detail | Avoids breaking `/doctores` listing; `DoctorCard` is a summary card, not a detail component |
| **Loading state** | Full-page skeleton (`DoctorProfileSkeleton`) | Replaces the single-card skeleton with a multi-section skeleton matching the new layout |
| **Error/Not-found state** | Keep existing Alert + back button pattern | Works fine; no change needed |
| **Review aggregate display** | Show `calificacionMedia` + `totalReviews` count in Hero | `totalReviews` will be 0 until Phase 2, but the UI field is there and ready |

## Stakeholders / Impact

| Stakeholder | Impact |
|---|---|
| **PACIENTE** (end user) | **Positive.** Rich profiles with education, service prices, and treated conditions — better informed before booking |
| **DOCTOR** (profile owner) | **Positive.** Professional profile that builds trust with patients. However, cannot edit the new sections yet (Phase 3) — must go through admin or wait for edit UI |
| **ADMIN** | **Neutral.** No new admin functionality in this phase |
| **Booking flow** (`/doctores/[id]/agendar`) | **Indirect.** The "Reservar cita" button in the Hero section still links here. In future, per-service booking could pass a service ID |
| **Doctor listing** (`/doctores`) | **None.** `DoctorCard` and `listDoctorProfiles` remain unchanged |
| **API consumers** | **Backward compatible.** `getDoctorProfile` still works. `getDoctorFullProfile` is additive |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Migration ordering** — new columns vs new tables in a single migration | Medium | Medium | Group changes into one migration file; run `drizzle-kit push` in dev first. If split is needed, add columns before tables (columns on `doctores` are referenced by new tables). |
| **Backward compat with `DoctorPublicResponse`** — existing API consumers break | Low | High | Keep `getDoctorProfile` returning `DoctorPublicResponse` unchanged. Create new `DoctorFullProfileResponse` type for the new endpoint. Don't alter the existing 7-field contract. |
| **Over-fetching in `getDoctorFullProfile`** — single endpoint returns everything | Medium | Low | Keep the hybrid approach: full profile endpoint + independent section endpoints. If performance is an issue in review, split into section fetches. |
| **`DoctorCard` / listing page uses old API** — stale if listing should show new fields | Low | Low | `DoctorCard` only needs the 7 fields it already uses. New fields (foto, experience) are only for the detail page. Deliberate — the listing is a summary. |
| **`numeroColegiado` exposure** — privacy concern | Low | Medium | This is public information in Spain (college registration number is a matter of public record). Making it visible is correct. If a future requirement demands hiding it, a doctor-level toggle can be added. |
| **Domain entity explosion** — 3 new entities add complexity | Medium | Low | Each entity is small (3-6 fields) and follows the existing `Doctor` pattern. The domain layer grows but remains consistent. |

## Rollback Plan

1. **Revert the migration**: Run `drizzle-kit drop` or create a down-migration that drops new tables and columns.
2. **Revert the API router**: Remove `getDoctorFullProfile` and `getDoctorServices` from `profilesRouter`.
3. **Revert the page**: Restore `src/app/doctores/[id]/page.tsx` to the previous single-card version.
4. **Clean up components**: Delete `DoctorHero`, `DoctorExperience`, `DoctorServices`, `DoctorConditions`, `DoctorProfileSkeleton`.
5. **Clean up entities**: Remove `DoctorEducation`, `DoctorService`, `DoctorCondition` domain classes.
6. **Final check**: Verify `/doctores` listing and `/doctores/[id]` render correctly with the old code.

## Architecture Decisions

### AD-1: Hybrid endpoint strategy

**Status**: Accepted

**Context**: The exploration identified two options — single endpoint vs section endpoints. We need a loading strategy that doesn't waterfall.

**Decision**: Ship `getDoctorFullProfile` as the primary data source for the page. It returns hero + education + services + conditions in one tRPC call. The page loads it once and renders all sections. `getDoctorServices` is added as an independent endpoint because the booking flow will need service data independently of the full profile.

**Consequences**:
- Front-end makes 1 call on page load (good UX)
- Cache invalidation must invalidate the full response when any section changes
- Future phase additions (FAQ, insurance) extend the same response — avoids N+1 over time

### AD-2: New domain entities follow existing patterns

**Status**: Accepted

**Context**: `DoctorEducation`, `DoctorService`, `DoctorCondition` need domain classes.

**Decision**: Each new entity follows the exact same pattern as `Doctor`: private constructor, static `create` factory method, validation in the factory, readonly properties, no infrastructure imports.

**Consequences**:
- Consistent with Clean Architecture enforcement
- Minor boilerplate (3 entities × ~30 lines each = ~90 lines)
- Easy to test in isolation

### AD-3: `DoctorCard` kept for listing, not repurposed

**Status**: Accepted

**Context**: The current `DoctorCard` is the ONLY profile component. It's used on the listing page (`/doctores`) and the detail page (`/doctores/[id]`).

**Decision**: Keep `DoctorCard` as-is for the listing page. Build independent section components (`DoctorHero`, etc.) for the detail page. The detail page rewrites to compose these new components.

**Consequences**:
- Zero risk of breaking the listing page
- No duplication — the two use cases (summary vs detail) genuinely differ
- Clean separation: summary card stays simple, detail page can grow

### AD-4: `numeroColegiado` made public

**Status**: Accepted

**Context**: The field exists in the domain entity and DB, but was excluded from `DoctorPublicResponse`. The exploration recommends exposing it.

**Decision**: Include `numeroColegiado` in `DoctorFullProfileResponse`. The Hero section displays it as "Nº Colegiado: XXXXX". This matches Doctoralia behavior and is a matter of public record in Spain.

**Consequences**:
- Existing `DoctorPublicResponse` unchanged — backward compatible
- Only the new full profile endpoint exposes it
- No privacy concern identified (it's public registration data)

## Estimated Size

| Category | Items | Estimated Lines |
|---|---|---|
| **DB schema** | 3 new tables + `doctores` extensions | ~60 |
| **Domain entities** | 3 new + 1 extended | ~100 |
| **Response types** | `DoctorFullProfileResponse` + input schemas | ~50 |
| **tRPC router** | 2 new endpoints | ~80 |
| **Use cases** | (none — Phase 1 is read-only for profile detail; mutations in Phase 3) | 0 |
| **Components** | 4 new + 1 skeleton + page rewrite | ~350 |
| **Page** | Rewrite `page.tsx` | ~80 |
| **Total** | | **~720** |

Well within the 800-line review budget, with room for tests and minor refactors.

## Next Steps

1. **Spec** (`sdd-spec`): Write delta specs covering:
   - `profiles-ui` — scenarios for Hero, Experience, Services, Conditions components; loading/error/empty states for each section; the new multi-section layout
   - `profiles-api` — scenarios for `getDoctorFullProfile` (success, not-found, partial data); `getDoctorServices`; `numeroColegiado` inclusion
   - `db-schema` — new tables + extended `doctores`
   - `domain-entities` — new entities + extended `Doctor`
2. **Design** (`sdd-design`): Technical design detailing data flow diagrams for the hybrid endpoint strategy, component tree for the page, and the Drizzle query structure for `getDoctorFullProfile`
3. **Tasks** (`sdd-tasks`): Break into granular tasks
4. **Apply** (`sdd-apply`): Implement
5. **Verify** (`sdd-verify`): Prove implementation matches specs
6. **Archive** (`sdd-archive`): Sync delta specs
