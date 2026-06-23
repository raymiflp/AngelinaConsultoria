## Exploration: Doctor Profile Page (Doctoralia-style)

### Current State

The doctor profile page at `/doctores/[id]` is a **minimal single-card implementation** with none of the richness expected from a healthcare platform. Here's exactly what exists today:

#### Page (`src/app/doctores/[id]/page.tsx`)
- Client component using `useParams` + `api.profiles.getDoctorProfile.useQuery`
- Three states: loading (Skeleton), error/not-found (Alert + back button), success (renders DoctorCard)
- Wraps everything in a narrow `max-w-lg` container

#### Component (`src/components/profiles/DoctorCard.tsx`)
- Avatar with initials (no photo support)
- Name, email, specialty badge, rating star, bio, price, "Reservar cita" link
- Simple Card layout — one-column, one section

#### API (`src/infrastructure/api/routers/profiles.ts`)
- `getDoctorProfile` (public) returns **only 7 fields**: `id`, `nombre`, `email`, `especialidad`, `biografia`, `precioConsulta`, `calificacionMedia`
- `listDoctorProfiles` (public) — same 7 fields, paginated, filterable by specialty
- No extended profile endpoint exists

#### Domain Entity (`src/domain/entities/doctor.ts`)
- 8 fields: `id`, `usuarioId`, `numeroColegiado`, `especialidad`, `biografia`, `precioConsulta`, `verificado`, `calificacionMedia`
- `numeroColegiado` exists in the entity but is **NOT exposed** in the public API response (this is a data leak prevention choice, but it should be optional/public)

#### DB Schema (`src/infrastructure/db/schema/doctores.ts`)
- Matches entity exactly — no additional columns for address, services, education, etc.

#### Response Types (`src/infrastructure/profiles/schemas.ts`)
- `DoctorPublicResponse`: 7 fields — the full extent of what gets returned
- `ProfileDoctorExtension`: Used for authenticated profile (adds `verificado`, `numeroColegiado`)

#### Existing Infrastructure That Can Be Reused
- **Doctor availability**: `doctorDisponibilidad` table + `getDoctorAvailability` tRPC endpoint
- **Booking**: `getDoctorSlots` endpoint + slot generation utils
- **RDG (Rating)**: `calificacionMedia` exists as a single numeric column (no individual reviews)
- **shadcn components installed**: alert, avatar, badge, button, calendar, card, dialog, dropdown-menu, form, input, label, popover, radio-group, select, separator, sheet, skeleton, switch, table, tabs, textarea, tooltip
- **Drizzle relations**: `doctoresRelations` already links usuarios, citas, disponibilidad

---

### Gap Analysis: Doctoralia Sections vs Current State

| Doctoralia Section | Current State | Gap |
|---|---|---|
| **Hero** — photo, name, specialty, location, license, CTAs | Name ✓, specialty ✓, license ✗ (in entity but not exposed), location ✗, photo ✗, phone CTA ✗ | 4/7 fields missing |
| **Experience** — extended bio, specialties, education/training | Brief bio text only ✓ | No education/training, no work history, no multiple specialties |
| **Services & Prices** — individual services with prices | Single `precioConsulta` field only | No service catalog at all |
| **Consultation Address** — address, map, payment methods, availability | Availability ✓ (via separate endpoint), address ✗, map ✗, payment methods ✗ | 3/4 missing |
| **Insurance Info** — accepted insurance companies | Nothing | Entire system missing |
| **Reviews** — patient reviews with ratings | `calificacionMedia` aggregate only | No individual reviews, no review CRUD, no moderation |
| **FAQ** — frequently asked questions | Nothing | Entire system missing |
| **Treated Conditions** — diseases/conditions | Nothing | Entire system missing |

**Score**: 1 out of 8 sections fully working (and even Hero is incomplete).

---

### Data Model Gaps

#### New Tables Required

| Table | Purpose | Key Columns |
|---|---|---|
| `doctor_education` | Education & work history | id, doctorId, titulo, institucion, tipo (EDUCACION/EXPERIENCIA), fechaInicio, fechaFin, descripcion, createdAt |
| `doctor_services` | Service catalog with prices | id, doctorId, nombre, descripcion, precio, duracionMinutos, activo, createdAt |
| `doctor_conditions` | Treated conditions/specialties | id, doctorId, condition (FK to normalized table or free text), createdAt |
| `doctor_insurance` | Accepted insurance companies | id, doctorId, aseguradora, createdAt |
| `doctor_faq` | Frequently asked questions | id, doctorId, pregunta, respuesta, orden, activo, createdAt |
| `reviews` (or `valoraciones`) | Individual reviews & ratings | id, doctorId, pacienteId, citaId?, calificacion (1-5), comentario, respuestaDoctor?, verificado, moderado, createdAt, updatedAt |

#### New Columns on Existing Tables

**`doctores` table** — add:
- `foto_url` (varchar, nullable) — doctor profile photo (S3/MinIO URL)
- `ubicacion_consulta` (text, nullable) — consultation address as free text or JSON
- `años_experiencia` (integer, nullable) — total years of professional experience
- `metodos_pago` (jsonb, nullable) — accepted payment methods array
- `idiomas` (jsonb or text[], nullable) — languages spoken
- `genero` (varchar, nullable) — for display preferences
- `website_url` (varchar, nullable) — personal/professional website
- `telefono_consulta` (varchar, nullable) — direct consultation phone

**`usuarios` table** — add:
- `foto_url` (varchar, nullable) — user avatar (already present conceptually, usable as doctor photo fallback)

#### Domain Entity Changes

**`Doctor` entity** needs to be extended with:
- `fotoUrl`, `ubicacionConsulta`, `añosExperiencia`, `metodosPago`, `idiomas`, `telefonoConsulta`

**New domain entities needed:**
- `DoctorEducation` — education/experience entry
- `DoctorService` — service offering with price
- `DoctorCondition` — treated condition
- `DoctorInsurance` — accepted insurance
- `DoctorFAQ` — FAQ entry
- `Review` — individual review with rating

---

### API Gaps

#### New tRPC Endpoints Needed

| Endpoint | Visibility | Purpose |
|---|---|---|
| `profiles.getDoctorFullProfile` | Public | Returns ALL public doctor data (hero + experience + services + location + insurance + conditions + FAQ) in one call |
| `profiles.getDoctorReviews` | Public | Paginated list of verified reviews for a doctor |
| `profiles.getDoctorReviewStats` | Public | Aggregated rating stats (avg, count, distribution) |
| `profiles.getDoctorServices` | Public | Service catalog with prices |
| `profiles.getDoctorFAQ` | Public | FAQ list for a doctor |
| `profiles.createReview` | Protected (PACIENTE) | Submit a review after completed appointment |
| `profiles.updateDoctorProfileExtended` | Protected (DOCTOR) | Update extended profile sections (education, services, FAQ, insurance, conditions) |

#### Existing Endpoints to Extend

- **`getDoctorProfile`** → Should be merged into/redirect to `getDoctorFullProfile`, or deprecated in favor of the richer response
- **`getDoctorAvailability`** (in bookings router) → This already exists and works. The front-end should consume it as-is.

#### DTO/Response Types Needed

```typescript
interface DoctorFullProfileResponse {
  // Hero
  id: string;
  nombre: string;
  email: string;
  fotoUrl: string | null;
  especialidad: string;
  numeroColegiado: string;  // expose it!
  telefono: string | null;
  ubicacion: string | null;
  añosExperiencia: number | null;
  idiomas: string[];
  calificacionMedia: number | null;
  totalReviews: number;
  verificado: boolean;

  // Sections (separate endpoints or embedded)
  experiencia: DoctorEducacionResponse[];
  servicios: DoctorServicioResponse[];
  condiciones: string[];
  seguros: string[];
  disponibilidad: string[];  // available days
  metodosPago: string[];
}

interface ReviewResponse {
  id: string;
  pacienteNombre: string;
  calificacion: number;
  comentario: string;
  respuestaDoctor: string | null;
  createdAt: string;
  citaInfo?: { fecha: string; servicio?: string };
}
```

---

### Component Gaps

#### New UI Components Required

| Component | Section | shadcn Dependencies | Notes |
|---|---|---|---|
| `DoctorHero` | Hero | Avatar, Badge, Button, Separator | Photo, name, specialty, license, location, CTA buttons (phone, message, book) |
| `DoctorExperience` | Experience | Card, Separator, Badge | Timeline-style education & work history |
| `DoctorServices` | Services & Prices | Card, Badge, Button | Service list with prices, "Reservar" per service |
| `DoctorLocation` | Consultation Address | Card, Badge | Address, map placeholder, payment methods, availability badges |
| `DoctorInsurance` | Insurance | Card, Badge | Grid of insurance company badges |
| `DoctorReviews` | Reviews | Card, Separator, Rating | Review list with star ratings, "Escribir review" button |
| `DoctorFAQ` | FAQ | Accordion (needs install) | Expandable Q&A items |
| `DoctorConditions` | Treated Conditions | Badge | Tag cloud of conditions |
| `DoctorReviewForm` | Reviews | Dialog, Form, Textarea, Rating | Write-a-review dialog |
| `DoctorProfileSkeleton` | Page | Skeleton | Full-page skeleton (replaces single-card skeleton) |

#### New shadcn Components to Install
- `accordion` — for FAQ section (MAY)
- `rating` — if not handled with custom star component

#### Existing Components That Need Refactoring
- **`DoctorCard.tsx`** — Currently the ONLY profile component. Either:
  - (a) Keep it as a summary card for listing pages, and build independent section components for the detail page, OR
  - (b) Refactor it into `DoctorHero` and remove the card from the detail page entirely

  **Recommendation: (a)** — `DoctorCard` works fine for `/doctores` listing. The detail page gets all-new section components. This avoids breaking existing functionality.

- **`DoctorDetailPage`** (`src/app/doctores/[id]/page.tsx`) — Needs to be rewritten from a single-card layout to a multi-section scrollable page. Consider extracting a `DoctorProfileLayout` wrapper.

---

### Dependencies

| System | How It Interacts | Impact |
|---|---|---|
| **Auth** — NextAuth/Auth.js | Review creation requires authenticated PACIENTE; profile editing requires authenticated DOCTOR | Reviews need to verify appointment ownership before allowing review |
| **Booking** — citas, slots, availability | Reviews tied to completed appointments; availability shown on profile; "Reservar" CTAs link to booking flow | Reviews depend on `ConsultationStatus.COMPLETADA` |
| **File Storage** — MinIO (future) | Doctor profile photos, education diplomas/certificates | Photo upload not in scope for this change — use URLs for now |
| **Redis** — caching layer | `getDoctorSlots` already cached; may want to cache `getDoctorFullProfile` | Need to consider cache invalidation on profile updates |
| **Audit Logging** — audit_logs table | All profile mutations (education, services, FAQ) should be audited | Consistent pattern already exists (see `writeAuditLogUseCase`) |
| **Search** — Meilisearch (future) | Doctor profile data will eventually be indexed for search | Profile data model should be designed with future search indexing in mind |

---

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Review system abuse** — fake reviews, spam, malicious ratings | High | High | Require completed appointment (cita COMPLETADA) before allowing review. One review per cita. Moderate before publishing. Admin panel to remove. |
| **Data model explosion** — too many new tables in one change | Medium | Medium | Ship in phases: Phase 1 = services + education + conditions (core professional data). Phase 2 = reviews + FAQ + insurance. |
| **Profile update UX complexity** — doctors manage 7+ sections differently | Medium | Medium | Use Tabs component (already installed) to split the edit profile page into section tabs. Each section is an independent form. |
| **Photo upload without MinIO** — can't store images | Medium | Low | Accept external URLs for now. The DB already stores `foto_url` as varchar. MinIO integration is a separate future change. |
| **Map integration** — Google Maps API key, cost, Leaflet vs paid | Low | Medium | Use Leaflet (free, no API key) with OpenStreetMap tiles. Add a `<MapPlaceholder>` component that can be swapped later. |
| **Stale cache on profile update** — profile sections cached separately | Medium | Low | Use tRPC `invalidate()` on mutation success. If caching `getDoctorFullProfile`, tag-based cache invalidation. |
| **Spec vs implementation drift** — `getPatientProfile` precedent from perfiles | Low | Medium | Align spec scenarios with implementation from the start. This exploration IS the alignment step. |

---

### Recommendations

#### Architecture Decision: Single "Full Profile" Endpoint vs Section Endpoints

**Option A: Single endpoint** (`getDoctorFullProfile`)
- Returns ALL doctor data in one response
- Pros: One network call, simpler frontend, easier caching as a unit
- Cons: Over-fetching if only reviews change, larger payload (~15-20KB), needs careful nested querying

**Option B: Section endpoints** (one per section)
- `getDoctorProfile` (hero), `getDoctorServices`, `getDoctorEducation`, `getDoctorReviews`, `getDoctorFAQ`
- Pros: Fine-grained caching, smaller individual payloads, independent loading states
- Cons: N+1 network calls, complex loading orchestration, more endpoints to maintain

**Recommendation: Hybrid — single endpoint for the full page (cached), plus individual endpoints for mutations**
- `getDoctorFullProfile` returns everything including services, education, conditions, insurance, FAQ, but NOT reviews
- `getDoctorReviews` is separate (paginated, potentially large)
- Front-end loads full profile in parallel with first page of reviews
- This gives the best UX (single load for the page) while keeping the paginated/expensive parts separate

#### Implementation Phases

**Phase 1 — Professional Data (Core profile expansion)**
- New DB tables: `doctor_education`, `doctor_services`, `doctor_conditions`
- Extend `doctores` table: `foto_url`, `ubicacion_consulta`, `años_experiencia`, `idiomas`
- Extend `Doctor` domain entity with new fields
- New endpoints: `getDoctorFullProfile`, `getDoctorServices`
- New components: `DoctorHero`, `DoctorExperience`, `DoctorServices`, `DoctorConditions`
- Update page layout from single-card to multi-section

**Phase 2 — Social Proof & Trust**
- New DB tables: `reviews`, `doctor_insurance`, `doctor_faq`
- New endpoints: `getDoctorReviews`, `getDoctorReviewStats`, `getDoctorFAQ`, `getDoctorInsurance`
- Extended endpoint: `getDoctorFullProfile` adds FAQ + insurance
- New components: `DoctorReviews`, `DoctorInsurance`, `DoctorFAQ`, `DoctorReviewForm`
- New installed components: `accordion`

**Phase 3 — Location & Advanced**
- Add `metodos_pago` to doctores table
- Map integration (Leaflet + OpenStreetMap)
- `DoctorLocation` component with map
- Edit/cms pages for doctors to manage their own extended profile
- Admin moderation panel for reviews

#### What NOT to Build Now
- Photo upload / file management (MinIO in future)
- Real-time chat / messaging CTA (future feature)
- Video consultation integration
- Meilisearch indexing
- Review similarity/abuse detection ML

#### Architectural Constraints
1. **Domain purity**: New entities (Review, DoctorEducation, etc.) must be pure domain classes with no infrastructure imports — follow existing `Doctor` and `Cita` patterns
2. **Schema mapping**: Each new domain entity gets a corresponding Drizzle table definition in `infrastructure/db/schema/`
3. **Use case layer**: Each mutation gets a use case (e.g., `createReviewUseCase`, `updateDoctorExtendedProfileUseCase`) in `application/use-cases/profiles/`
4. **tRPC patterns**: New procedures go in `profilesRouter` (or a new `extendedProfilesRouter` merged into appRouter) — follow the existing `publicProcedure`/`protectedProcedure` pattern
5. **UI component scope**: Profile section components go in `src/components/profiles/` — each section gets its own file (e.g., `DoctorHero.tsx`, `DoctorExperience.tsx`)
6. **Page structure**: The detail page stays a client component (uses tRPC hooks). Server components are possible for SEO via `createCaller`, but loading/error states are cleaner with client rendering

---

### Ready for Proposal

**Yes** — this exploration is comprehensive enough to move to `sdd-propose`.

**What the orchestrator should tell the user before proposal:**
- The change will be named **`doctor-profile-page`**
- It's recommended to split into 3 phases (Professional Data → Social Proof → Location)
- Phase 1 scope: DB tables for education/services/conditions + extended doctor fields + `getDoctorFullProfile` endpoint + Hero/Experience/Services/Conditions components
- Phase 2 scope: Reviews + FAQ + Insurance tables & components
- Phase 3 scope: Location/map + doctor edit UI + admin review moderation
- The user should confirm: (1) whether to start with Phase 1 only or bundle phases, (2) whether `numeroColegiado` should be public on the profile page, (3) preference on map provider (Leaflet free vs Google Maps paid), (4) whether photo upload is required now or can use external URLs
