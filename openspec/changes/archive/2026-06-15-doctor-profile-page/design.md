# Design: Doctor Profile Page — Phase 1 (Professional Data)

## Technical Approach

Extend the existing Clean Architecture layers with 3 new DB tables + 5 columns on `doctores`, 3 new domain entities, 2 tRPC endpoints, and 4 new UI components. The page at `/doctores/[id]` switches from `getDoctorProfile` (7-field summary) to `getDoctorFullProfile` (single query returning hero + experience + services + conditions). Backward compatibility is maintained — `DoctorCard` and `getDoctorProfile` are untouched.

## Architecture Decisions

| Decision | Options | Tradeoffs | Choice |
|----------|---------|-----------|--------|
| **Query strategy** | (a) Drizzle relational query with `with`, (b) sequential queries, (c) raw SQL join | (a) Cleanest, leverages existing relations pattern; (b) N+1 risk; (c) brittle, breaks Drizzle types | **(a)** — consistent with `doctorDisponibilidad` pattern; single `findFirst` with `with` |
| **Use case location** | (a) New `get-doctor-full-profile.use-case.ts`, (b) inline in router | (a) ~50 extra lines, follows existing pattern (see `get-profile.use-case.ts`); (b) shorter but inconsistent | **(a)** — application layer boundary is established; follow it |
| **Numeric handling** | (a) Existing `toNumber()` helper, (b) Drizzle `numeric` transforms | (a) Proven, already in use; (b) cleaner but requires config change across codebase | **(a)** — consistency wins, refactor in separate change |
| **`getDoctorServices` data source** | (a) Reuse from `getDoctorFullProfile` response on client, (b) independent DB query behind tRPC | (a) No server-side cache for booking flow; (b) canonical source, avoids coupling | **(b)** — booking flow needs service data independent of profile; keeps endpoints composable |
| **Page component** | (a) Keep `"use client"` with tRPC, (b) convert to async server component | (a) Uses existing tRPC + React Query pattern; (b) would need `fetch`-based API call, breaks loading/error patterns | **(a)** — tRPC + `useSuspenseQuery` provides loading/error states; async conversion is a separate migration |

## Data Flow

```
Browser                          Server
  │                                │
  ├─ GET /doctores/[id]           │
  │     ↓                          │
  │  DoctorDetailPage             │
  │  (client component)           │
  │     │                          │
  │     ├─ api.profiles.getDoctorFullProfile.query({ doctorId })
  │     │                          ├─ profilesRouter.getDoctorFullProfile
  │     │                          │    ├─ db.query.doctores.findFirst({
  │     │                          │    │   where: eq(id, doctorId),
  │     │                          │    │   with: { usuario, experiencia, servicios, condiciones }
  │     │                          │    │ })
  │     │                          │    └─ map → DoctorFullProfileResponse
  │     │                          │
  │     ├─ DoctorHero ← hero fields + numerocolegiado + rating
  │     ├─ DoctorExperience ← experience[]
  │     ├─ DoctorServices ← services[]
  │     ├─ DoctorConditions ← conditions[]
  │     │
  │     └─ Loading: DoctorProfileSkeleton
  │        Error: Alert + Volver
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/infrastructure/db/schema/doctor-experiencia.ts` | Create | `doctor_experiencia` table: id, doctor_id FK, tipo, titulo, institucion, date range, descripcion, orden, timestamps |
| `src/infrastructure/db/schema/doctor-servicios.ts` | Create | `doctor_servicios` table: id, doctor_id FK, nombre, descripcion, precio (numeric), duracion_minutos, activo, orden, timestamps |
| `src/infrastructure/db/schema/doctor-condiciones.ts` | Create | `doctor_condiciones` table: id, doctor_id FK, nombre (unique per doctor), timestamps |
| `src/infrastructure/db/schema/doctores.ts` | Modify | Add `foto_url` (varchar), `ubicacion_consulta` (text), `años_experiencia` (integer), `idiomas` (text[]), `telefono_consulta` (varchar) — all nullable |
| `src/infrastructure/db/schema/index.ts` | Modify | Export new table schemas + add `many` relations on `doctoresRelations` + add `one` relations for each new table back to doctores |
| `src/domain/entities/doctor.ts` | Modify | Add optional `fotoUrl`, `ubicacionConsulta`, `añosExperiencia`, `idiomas`, `telefonoConsulta` to constructor and `create()` |
| `src/domain/entities/doctor-experiencia.ts` | Create | `DoctorExperience` entity with private constructor + `create()` factory, validates tipo ∈ {education, work} |
| `src/domain/entities/doctor-servicios.ts` | Create | `DoctorService` entity, validates nombre non-empty, precio > 0 |
| `src/domain/entities/doctor-condiciones.ts` | Create | `DoctorCondition` entity, validates nombre non-empty |
| `src/domain/entities/index.ts` | Modify | Export the 3 new domain entities |
| `src/application/use-cases/profiles/get-doctor-full-profile.use-case.ts` | Create | Use case: accepts doctorId, queries doctores + usuario + experiencia + servicios + condiciones via Drizzle relational API, maps to `DoctorFullProfileResponse` |
| `src/application/index.ts` | Modify | Export `getDoctorFullProfileUseCase` |
| `src/infrastructure/profiles/schemas.ts` | Modify | Add `DoctorFullProfileResponse` interface, add `getDoctorFullProfileSchema` and `getDoctorServicesSchema` Zod input schemas |
| `src/infrastructure/api/routers/profiles.ts` | Modify | Add `getDoctorFullProfile` (publicProcedure) and `getDoctorServices` (publicProcedure) endpoints using the new use case |
| `src/components/profiles/DoctorHero.tsx` | Create | Hero section: Avatar (with initials fallback), name, specialty Badge, location, Nº Colegiado, years, languages, rating + review count, phone (tel: link), CTA buttons (Reservar/Llamar/Mensaje) |
| `src/components/profiles/DoctorExperience.tsx` | Create | Timeline: education entries with graduation cap icon, work entries with briefcase icon, formatted dates, sorted by orden/fechaInicio. Empty state: "Sin experiencia registrada" |
| `src/components/profiles/DoctorServices.tsx` | Create | Service cards: name, description, price (€), duration, "Reservar" button (visual-only). Empty state: "No hay servicios configurados" |
| `src/components/profiles/DoctorConditions.tsx` | Create | Tag cloud using Badge secondary variant. Empty state: "No hay condiciones registradas" |
| `src/components/profiles/DoctorProfileSkeleton.tsx` | Create | Full-page skeleton: Avatar circle + text lines (hero), timeline shapes (experience), card shapes (services), badge rectangles (conditions) |
| `src/app/doctores/[id]/page.tsx` | Rewrite | Switch from `getDoctorProfile` + `DoctorCard` to `getDoctorFullProfile` + multi-section layout; preserve error/not-found pattern with Alert |

## Interfaces / Contracts

```typescript
// Response type (add to src/infrastructure/profiles/schemas.ts)
export interface DoctorFullProfileResponse {
  id: string;
  nombre: string;
  email: string;
  especialidad: string;
  biografia: string | null;
  precioConsulta: number | null;
  calificacionMedia: number | null;
  fotoUrl: string | null;
  ubicacionConsulta: string | null;
  añosExperiencia: number | null;
  idiomas: string[];
  telefonoConsulta: string | null;
  numeroColegiado: string;
  totalReviews: number;
  experience: DoctorExperienceResponse[];
  services: DoctorServiceResponse[];
  conditions: DoctorConditionResponse[];
}

interface DoctorExperienceResponse {
  id: string;
  tipo: "education" | "work";
  titulo: string;
  institucion: string;
  fechaInicio: string;
  fechaFin: string | null;
  descripcion: string | null;
  orden: number;
}

interface DoctorServiceResponse {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  duracionMinutos: number | null;
  activo: boolean;
  orden: number;
}

interface DoctorConditionResponse {
  id: string;
  nombre: string;
}

// Input schemas
export const getDoctorFullProfileSchema = z.object({
  doctorId: z.string().uuid(),
});

export const getDoctorServicesSchema = z.object({
  doctorId: z.string().uuid(),
});
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — Domain | `DoctorExperience.create()` validation (tipo, empty fields), `DoctorService.create()` validation (precio, nombre), `DoctorCondition.create()` validation | Vitest, no DB, instantiate entities directly |
| Unit — Use Case | `getDoctorFullProfileUseCase` with mocked DB returns correct shape, empty sections, NOT_FOUND | Vitest, mock Drizzle query layer |
| Integration | New DB schema columns + tables exist, FK cascades work, indexes created | `drizzle-kit push` to test DB, then raw SQL inspection |
| Unit — Components | Hero renders with/without photo, Experience sorts correctly, Services filters inactive, Conditions empty state | Vitest + @testing-library/react |

## Migration / Rollout

No data migration needed — all new columns and tables are nullable/optional. Run `drizzle-kit push` to apply schema changes. The new `getDoctorFullProfile` endpoint returns `totalReviews: 0` until Phase 2 (reviews feature).

## Open Questions

- None identified. All decisions are covered by the proposal's default decisions and existing codebase patterns.
