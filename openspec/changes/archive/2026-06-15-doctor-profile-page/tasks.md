# Tasks: Doctor Profile Page — Phase 1

> Auto-forecast mode. Review budget: 800 lines.

---

## Phase 1 — Professional Data Profile

### Group 1: DB Schema — 3 new tables + schema changes

#### Task 1.1 — Add `foto_url` and `ubicacion_consulta` columns to doctors table

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/db/schema/doctores.ts` |
| **Description** | Add 5 nullable columns to the existing `doctores` table: `foto_url` (varchar), `ubicacion_consulta` (text), `años_experiencia` (integer), `idiomas` (text[]), `telefono_consulta` (varchar). Import `integer` from Drizzle pg-core. All columns optional/nullable — no defaults, no `notNull`. |
| **Acceptance criteria** | 1. All 5 columns exist in the Drizzle schema definition<br/>2. Each column is nullable (no `notNull()`)<br/>3. `idiomas` uses `text().array()` (PostgreSQL text array)<br/>4. Existing columns are untouched<br/>5. Existing indexes are untouched |
| **Dependencies** | None |
| **Estimated lines** | ~12 |

#### Task 1.2 — Create `doctor_experiencia` schema

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/db/schema/doctor-experiencia.ts` (create) |
| **Description** | Create a new Drizzle table `doctor_experiencia` with columns: `id` (uuid PK, defaultRandom), `doctor_id` (uuid FK → doctores.id CASCADE, notNull), `tipo` (varchar, notNull), `titulo` (varchar, notNull), `institucion` (varchar, notNull), `fecha_inicio` (date, notNull), `fecha_fin` (date, nullable), `descripcion` (text, nullable), `orden` (integer, notNull, default 0), `created_at` (timestamp, default now(), notNull). Add an index on `doctor_id` matching the existing pattern (e.g. `doctor_experiencia_doctor_idx`). |
| **Acceptance criteria** | 1. Table matches spec structure exactly<br/>2. FK references `doctores.id` with `onDelete: "cascade"`<br/>3. Index on `doctor_id` exists<br/>4. `created_at` defaults to `now()` |
| **Dependencies** | None (standalone new table, no circular dep) |
| **Estimated lines** | ~50 |

#### Task 1.3 — Create `doctor_servicios` schema

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/db/schema/doctor-servicios.ts` (create) |
| **Description** | Create a new Drizzle table `doctor_servicios` with columns: `id` (uuid PK, defaultRandom), `doctor_id` (uuid FK → doctores.id CASCADE, notNull), `nombre` (varchar, notNull), `descripcion` (text, nullable), `precio` (numeric, notNull), `duracion_minutos` (integer, nullable), `activo` (boolean, notNull, default true), `orden` (integer, notNull, default 0), `created_at` (timestamp, default now(), notNull). Add an index on `doctor_id`. |
| **Acceptance criteria** | 1. Table matches spec structure exactly<br/>2. FK cascades on delete<br/>3. `precio` uses `numeric` type (not integer — prices can be decimal)<br/>4. `activo` defaults to `true`<br/>5. Index on `doctor_id` exists |
| **Dependencies** | None |
| **Estimated lines** | ~50 |

#### Task 1.4 — Create `doctor_condiciones` schema

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/db/schema/doctor-condiciones.ts` (create) |
| **Description** | Create a new Drizzle table `doctor_condiciones` with columns: `id` (uuid PK, defaultRandom), `doctor_id` (uuid FK → doctores.id CASCADE, notNull), `nombre` (varchar, notNull), `created_at` (timestamp, default now(), notNull). Add an index on `doctor_id`. |
| **Acceptance criteria** | 1. Table matches spec structure exactly<br/>2. FK cascades on delete<br/>3. Index on `doctor_id` exists<br/>4. Simpler table (only 4 columns) matches spec |
| **Dependencies** | None |
| **Estimated lines** | ~30 |

#### Task 1.5 — Update schema index and relations

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/db/schema/index.ts` |
| **Description** | Import and export the 3 new table schemas (`doctorExperiencia`, `doctorServicios`, `doctorCondiciones`). Extend `doctoresRelations` with `many` relations to each new table (keys: `experiencia`, `servicios`, `condiciones`). Create and export a `one` relation for each new table back to `doctores` (matching the existing `doctorDisponibilidadRelations` pattern). |
| **Acceptance criteria** | 1. All 3 new table schemas are exported from the barrel<br/>2. `doctoresRelations` has `many: experiencia`, `many: servicios`, `many: condiciones`<br/>3. Each new table has its own relations export with `one` back to `doctores`<br/>4. Pattern matches existing `doctorDisponibilidadRelations` exactly |
| **Dependencies** | 1.2, 1.3, 1.4 |
| **Estimated lines** | ~40 |

---

### Group 2: Domain Entities — 3 new + 1 extended

#### Task 2.1 — Extend Doctor entity with new fields

| Field | Value |
|---|---|
| **Files** | `src/domain/entities/doctor.ts` |
| **Description** | Add 5 optional readonly properties to the `Doctor` class: `fotoUrl` (string \| undefined), `ubicacionConsulta` (string \| undefined), `añosExperiencia` (number \| undefined), `idiomas` (string[] \| undefined), `telefonoConsulta` (string \| undefined). Update the `create()` factory to accept these as optional props. Add validation: if `añosExperiencia` is provided, it must be >= 0. |
| **Acceptance criteria** | 1. All 5 new fields are readonly properties<br/>2. `create()` accepts them as optional (no breaking change)<br/>3. `añosExperiencia` negative value throws Error<br/>4. Existing validation rules unchanged<br/>5. Existing tests pass without modification |
| **Dependencies** | None (self-contained entity change) |
| **Estimated lines** | ~15 |

#### Task 2.2 — Create DoctorExperience entity

| Field | Value |
|---|---|
| **Files** | `src/domain/entities/doctor-experiencia.ts` (create) |
| **Description** | Create `DoctorExperience` class following the same pattern as `Doctor`: private constructor with readonly properties, static `create()` factory, validation in the factory. Properties: `id`, `doctorId`, `tipo` ("education" \| "work"), `titulo`, `institucion`, `fechaInicio`, `fechaFin` (optional), `descripcion` (optional), `orden`. Validate: `tipo` must be "education" or "work", `titulo` non-empty, `institucion` non-empty. No infrastructure imports. |
| **Acceptance criteria** | 1. `create()` with valid education props returns a `DoctorExperience` with `tipo="education"`<br/>2. `create()` with valid work props returns a `DoctorExperience` with `tipo="work"`<br/>3. `create()` with invalid tipo throws Error<br/>4. `create()` with empty titulo throws Error<br/>5. `fechaFin` is optional (undefined when not provided)<br/>6. No Drizzle/DB imports in the file |
| **Dependencies** | None |
| **Estimated lines** | ~55 |

#### Task 2.3 — Create DoctorService entity

| Field | Value |
|---|---|
| **Files** | `src/domain/entities/doctor-servicios.ts` (create) |
| **Description** | Create `DoctorService` class with readonly properties: `id`, `doctorId`, `nombre`, `descripcion` (optional), `precio`, `duracionMinutos` (optional), `activo`, `orden`. Validate: `nombre` non-empty, `precio` > 0. `activo` defaults to `true`. |
| **Acceptance criteria** | 1. `create()` with valid props assigns all fields<br/>2. `activo` defaults to `true`<br/>3. `create()` with negative `precio` throws Error<br/>4. `create()` with empty `nombre` throws Error<br/>5. No infrastructure imports |
| **Dependencies** | None |
| **Estimated lines** | ~50 |

#### Task 2.4 — Create DoctorCondition entity

| Field | Value |
|---|---|
| **Files** | `src/domain/entities/doctor-condiciones.ts` (create) |
| **Description** | Create `DoctorCondition` class with readonly properties: `id`, `doctorId`, `nombre`. Validate: `nombre` non-empty. |
| **Acceptance criteria** | 1. `create()` with valid nombre works<br/>2. `create()` with empty nombre throws Error<br/>3. No infrastructure imports |
| **Dependencies** | None |
| **Estimated lines** | ~35 |

#### Task 2.5 — Update domain entities index

| Field | Value |
|---|---|
| **Files** | `src/domain/entities/index.ts` |
| **Description** | Export the 3 new entities: `DoctorExperience`, `DoctorService`, `DoctorCondition` from their respective files. |
| **Acceptance criteria** | 1. All 3 new entities importable from `@/domain/entities`<br/>2. Existing exports untouched |
| **Dependencies** | 2.2, 2.3, 2.4 |
| **Estimated lines** | ~3 |

---

### Group 3: API Layer — response types, use case, tRPC procedures

#### Task 3.1 — Add `DoctorFullProfileResponse` type to schemas

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/profiles/schemas.ts` |
| **Description** | Add interfaces `DoctorFullProfileResponse`, `DoctorExperienceResponse`, `DoctorServiceResponse`, `DoctorConditionResponse` matching the design spec. Add Zod input schemas `getDoctorFullProfileSchema` and `getDoctorServicesSchema` (both `z.object({ doctorId: z.string().uuid() })`). Do NOT modify `DoctorPublicResponse` or any existing type. |
| **Acceptance criteria** | 1. `DoctorFullProfileResponse` includes all fields from design (id, nombre, email, especialidad, biografia, precioConsulta, calificacionMedia, fotoUrl, ubicacionConsulta, añosExperiencia, idiomas, telefonoConsulta, numeroColegiado, totalReviews, experience, services, conditions)<br/>2. `DoctorPublicResponse` is completely unchanged<br/>3. Input schemas exist and accept UUID strings<br/>4. Response sub-types match their section data shapes |
| **Dependencies** | None |
| **Estimated lines** | ~60 |

#### Task 3.2 — Create `getDoctorFullProfileUseCase` in application layer

| Field | Value |
|---|---|
| **Files** | `src/application/use-cases/profiles/get-doctor-full-profile.use-case.ts` (create)<br/>`src/application/index.ts` (modify) |
| **Description** | Create a use case that accepts `db` and `doctorId`, queries `doctores` with Drizzle relational API (`findFirst` with `with: { experiencia, servicios, condiciones }`), joins `usuarios` for name/email, and maps the result to `DoctorFullProfileResponse`. Use the existing `toNumber()` helper for numeric columns. Experience sorted by `orden` ASC then `fechaInicio` DESC. Services filtered to `activo=true` only, sorted by `orden` ASC. Conditions sorted by `nombre` ASC. Throw `TRPCError(NOT_FOUND)` if doctor doesn't exist. Return `totalReviews: 0` as placeholder for Phase 2. Export from `src/application/index.ts`. |
| **Acceptance criteria** | 1. Returns full profile for valid doctorId<br/>2. Returns empty arrays for sections with no data (not null)<br/>3. Throws NOT_FOUND for invalid doctorId<br/>4. Services exclude `activo=false` entries<br/>5. Experience sorted by orden ASC then fechaInicio DESC<br/>6. `totalReviews` is always 0<br/>7. Exported from application barrel<br/>8. Pattern matches existing use cases (`getProfileUseCase` style) |
| **Dependencies** | 1.5, 2.5, 3.1 |
| **Estimated lines** | ~75 |

#### Task 3.3 — Add `getDoctorFullProfile` and `getDoctorServices` tRPC procedures

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/api/routers/profiles.ts` |
| **Description** | Add two public procedures to `profilesRouter`: `getDoctorFullProfile` (calls `getDoctorFullProfileUseCase`, input validated via `getDoctorFullProfileSchema`) and `getDoctorServices` (queries `doctorServicios` directly filtered by doctorId + activo=true, sorted by orden ASC, returns `DoctorServiceResponse[]`). Both are `publicProcedure` (no auth). Import new schemas and use case. |
| **Acceptance criteria** | 1. `getDoctorFullProfile` returns full profile for valid doctorId<br/>2. `getDoctorServices` returns only active services<br/>3. Both are accessible without authentication<br/>4. Invalid UUID input is rejected by Zod validation<br/>5. NOT_FOUND propagated correctly from use case<br/>6. Existing procedures (`getDoctorProfile`, `listDoctorProfiles`, `getMyProfile`, `updateMyProfile`) are completely untouched |
| **Dependencies** | 3.2 |
| **Estimated lines** | ~45 |

#### Task 3.4 — Verify backward compatibility

| Field | Value |
|---|---|
| **Files** | None (verification only) |
| **Description** | Verify that `DoctorPublicResponse`, `getDoctorProfile`, `listDoctorProfiles`, and `DoctorCard` are completely unchanged. Check that `src/infrastructure/profiles/schemas.ts` still exports `DoctorPublicResponse` with the original 7 fields. Check that `profiles.ts` router still has `getDoctorProfile` and `listDoctorProfiles` with the exact same implementation. Check that `DoctorCard.tsx` still uses `DoctorPublicResponse` and renders the same 7-field layout. No code changes — verification task only. |
| **Acceptance criteria** | 1. `DoctorPublicResponse` unchanged (7 exact fields: id, nombre, email, especialidad, biografia, precioConsulta, calificacionMedia)<br/>2. `getDoctorProfile` procedure unchanged<br/>3. `listDoctorProfiles` procedure unchanged<br/>4. `DoctorCard` component unchanged and still renders on `/doctores` listing |
| **Dependencies** | 3.3 |
| **Estimated lines** | 0 |

---

### Group 4: UI Components — 4 new components + skeleton + page rewrite

#### Task 4.1 — Create DoctorHero component

- [x] Implemented

| Field | Value |
|---|---|
| **Files** | `src/components/profiles/DoctorHero.tsx` (create) |
| **Description** | Create a `DoctorHero` component displaying the doctor's photo (shadcn `Avatar` with `AvatarFallback` initials fallback), full name heading, specialty `Badge`, consultation location, "Nº Colegiado: {num}", "{añosExperiencia} años de experiencia", language badges, rating with review count (star icon + number + "({totalReviews} reseñas)"), clickable phone link (tel:), and CTA buttons ("Reservar cita" → `/doctores/{id}/agendar`, "Llamar", "Mensaje" — visual-only for "Mensaje"). Uses `useSession` or `useUser` hook for auth-aware CTA visibility: hide "Reservar" when role is DOCTOR/ADMIN. Gracefully hide null/undefined fields. |
| **Acceptance criteria** | 1. Renders photo via Avatar with `src` when `fotoUrl` is provided<br/>2. Falls back to 2-letter initials in AvatarFallback when no photo<br/>3. Specialty rendered as Badge<br/>4. Location, license number, years, languages each render when present<br/>5. Rating with star icon and review count renders when present<br/>6. Phone renders as `tel:` link when present<br/>7. Missing fields (null/undefined) do NOT render at all<br/>8. CTA buttons: "Reservar cita" visible for paciente/unauthenticated, hidden for doctor/admin<br/>9. Uses shadcn components: Avatar, Badge, Button, Card<br/>10. Responsive layout works on mobile |
| **Dependencies** | None (only depends on props interface) |
| **Estimated lines** | ~140 |

#### Task 4.2 — Create DoctorExperience component (timeline)

- [x] Implemented

| Field | Value |
|---|---|
| **Files** | `src/components/profiles/DoctorExperience.tsx` (create) |
| **Description** | Create a `DoctorExperience` component rendering a timeline of education and work entries. Each entry shows: type icon (graduation cap for education, briefcase for work), `titulo`, `institucion`, date range formatted as "YYYY – YYYY" or "YYYY – Presente" when `fechaFin` is null. Entries sorted by `orden` ASC then `fechaInicio` DESC. Empty state: "Sin experiencia registrada". Loading state: skeleton timeline placeholders (repeated vertical items with Skeleton). |
| **Acceptance criteria** | 1. Mixed education/work entries render with correct icons/labels<br/>2. Date range shows "Presente" when `fechaFin` is null<br/>3. Entries ordered by orden ASC then fechaInicio DESC<br/>4. Empty state displayed when experience array is empty<br/>5. Loading skeleton renders during load<br/>6. Uses shadcn Card, Badge, Skeleton, Separator as needed |
| **Dependencies** | None (only depends on props interface) |
| **Estimated lines** | ~100 |

#### Task 4.3 — Create DoctorServices component

- [x] Implemented

| Field | Value |
|---|---|
| **Files** | `src/components/profiles/DoctorServices.tsx` (create) |
| **Description** | Create a `DoctorServices` component rendering a list of service cards. Each card shows: service name, description, price formatted as `{precio.toFixed(2)} €`, duration as `{duracionMinutos} min` (when present), and a "Reservar" button (visual-only in Phase 1 — no navigation). Only services with `activo=true` are passed (filter happens server-side). Empty state: "No hay servicios configurados". Loading state: skeleton card shapes. |
| **Acceptance criteria** | 1. Each service shows name, description, price (€), duration (when present)<br/>2. Price formatted to 2 decimal places<br/>3. Duration label hidden when null<br/>4. Empty state renders when array is empty<br/>5. Loading skeleton renders during load<br/>6. "Reservar" button is visual-only (no onClick, no href)<br/>7. Uses shadcn Card, Badge, Button, Skeleton |
| **Dependencies** | None (only depends on props interface) |
| **Estimated lines** | ~90 |

#### Task 4.4 — Create DoctorConditions component

- [x] Implemented

| Field | Value |
|---|---|
| **Files** | `src/components/profiles/DoctorConditions.tsx` (create) |
| **Description** | Create a `DoctorConditions` component rendering conditions as a wrapping tag cloud using shadcn `Badge` (secondary variant) in a flex-wrap container. Empty state: "No hay condiciones registradas". Loading state: small rounded skeleton rectangles in a wrapping layout. |
| **Acceptance criteria** | 1. Conditions render as individual Badge components<br/>2. Badges wrap in a flex container (no horizontal scroll)<br/>3. Empty state renders when array is empty<br/>4. Loading skeleton renders during load<br/>5. Uses shadcn Badge and Skeleton |
| **Dependencies** | None (only depends on props interface) |
| **Estimated lines** | ~50 |

#### Task 4.5 — Create DoctorProfileSkeleton component

- [x] Implemented

| Field | Value |
|---|---|
| **Files** | `src/components/profiles/DoctorProfileSkeleton.tsx` (create) |
| **Description** | Create a full-page `DoctorProfileSkeleton` component matching the multi-section layout of the new detail page. Sections: Hero skeleton (avatar circle + title/subtitle lines + button rectangles), Experience skeleton (multiple timeline-like vertical items with Skeleton), Services skeleton (multiple card-shaped skeletons), Conditions skeleton (small rounded rectangles in a wrapping layout). |
| **Acceptance criteria** | 1. Hero section skeleton visible (avatar circle + text lines + button rects)<br/>2. Experience section skeleton visible (timeline-like shapes)<br/>3. Services section skeleton visible (card-like shapes)<br/>4. Conditions section skeleton visible (small rounded rects in wrapping layout)<br/>5. Uses shadcn Skeleton component<br/>6. Responsive at different viewport widths |
| **Dependencies** | None |
| **Estimated lines** | ~80 |

#### Task 4.6 — Rewrite doctor detail page with new components

- [x] Implemented

| Field | Value |
|---|---|
| **Files** | `src/app/doctores/[id]/page.tsx` |
| **Description** | Rewrite `DoctorDetailPage` to fetch data via `api.profiles.getDoctorFullProfile.useQuery` instead of `getDoctorProfile`. Compose the new section components vertically: back link, `DoctorHero`, `DoctorExperience`, `DoctorServices`, `DoctorConditions`. Use `DoctorProfileSkeleton` for loading state. Preserve the existing error/not-found pattern (Alert variant="destructive" with "Doctor no encontrado" + "Volver" button). Sections separated by `space-y-8`. Keep `"use client"` directive and existing imports pattern. Remove `DoctorCard` import. |
| **Acceptance criteria** | 1. Fetches data via `getDoctorFullProfile` (not `getDoctorProfile`)<br/>2. Multi-section layout renders in correct order: Hero → Experience → Services → Conditions<br/>3. `DoctorProfileSkeleton` shows during loading<br/>4. Error/not-found Alert with "Volver" button preserved<br/>5. Back link to `/doctores` at top<br/>6. `DoctorCard` import removed<br/>7. Sections have consistent vertical spacing<br/>8. Clean separation: page orchestrates components, components don't fetch data |
| **Dependencies** | 4.1, 4.2, 4.3, 4.4, 4.5, 3.3 |
| **Estimated lines** | ~60 |

---

## Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1,015 |
| 800-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Decision needed before apply | **Yes — split strategy** |

### Notes for the Orchestrator

**Why the budget is exceeded.** The proposal estimated ~720 lines, but a realistic breakdown lands at ~1,015. The gap comes from two sources:

1. **The use case** (~75 lines) was assumed zero in the proposal but is required by the design (application layer boundary).
2. **Components** (~460 total) are heavier than the ~350 estimate because each shadcn composition with loading, empty, and error states adds real lines — the existing `DoctorCard` (101 lines) proves this.

**Recommended split.** Two chained PRs to stay within 800 lines:

| PR | Tasks | Est. Lines | Focus |
|---|---|---|---|
| **PR 1: Data Layer** | G1 (all), G2 (all), G3 (all) | ~535 | Schema, entities, API — fully reviewable independently, no UI |
| **PR 2: UI Layer** | G4 (all) | ~520 | Components + page rewrite — depends on PR 1 data shape being stable |

Order: PR 1 → PR 2. PR 1 is reviewable as a self-contained data contract change.

**Alternative: single PR.** If you prefer a single PR, flag the budget risk to the reviewer upfront with a note that ~200 lines over is justified by the use case (missing from proposal) and realistic component sizing.
