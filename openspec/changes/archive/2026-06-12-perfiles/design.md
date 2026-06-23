# Design: Perfiles (Doctor & Patient Profiles)

## Technical Approach

Implement three tRPC procedures (`getMyProfile`, `updateMyProfile`, `getDoctorProfile`) in the existing `profiles` router, a profile page (`/perfil`) with role-aware edit form, and a public doctor page (`/doctores/[id]`). Server determines role from `ctx.session.user.role` and queries the role-specific Drizzle table via existing relations. Form uses React Hook Form + Zod with shadcn Form components.

## Architecture Decisions

### Decision: Single profile procedure vs separate per-role

| Option | Tradeoff |
|--------|----------|
| One `getMyProfile` with role branch | Single query pattern, less code duplication |
| Separate `getDoctorProfile` + `getPatientProfile` | Clearer API surface but more procedures |

**Choice**: Single `getMyProfile` + `getDoctorProfile` (public). Server branches on role for `getMyProfile`. Patient-specific public access is out of scope.

### Decision: Discriminated union for update input

**Choice**: `z.discriminatedUnion("rol", [...])` — the Zod schema validates doctor-specific fields when `rol === "DOCTOR"` and patient fields when `rol === "PACIENTE"`. Single procedure, type-safe branching.

**Rationale**: Cleaner than optional every-field or separate procedures. tRPC propagates union types to the client automatically.

### Decision: Client components for both pages

**Choice**: Both `/perfil` and `/doctores/[id]` are `"use client"` components using tRPC React Query hooks.

**Rationale**: `/perfil` needs mutation + invalidation. `/doctores/[id]` is read-only but tRPC hooks give caching and loading states for free. No server-component streaming needed here.

## Data Flow

```
getMyProfile (protected)
  ctx.session.user.id → db.usuarios.find(id)
    → if DOCTOR: db.doctores.find(usuarioId) via relation
    → if PACIENTE: db.pacientes.find(usuarioId) via relation
  → return { ...usuario, doctor?: {...} | paciente?: {...} }

updateMyProfile (protected)
  input: { rol: "DOCTOR", nombre, telefono, especialidad, ... }
       | { rol: "PACIENTE", nombre, telefono, fechaNacimiento, ... }
  → db.usuarios.update(id, { nombre, telefono })
  → if DOCTOR: db.doctores.update(usuarioId, { especialidad, ... })
  → if PACIENTE: db.pacientes.update(usuarioId, { fechaNacimiento, ... })
  → return updated profile (same shape as getMyProfile)

getDoctorProfile (public)
  input: { id }
  → db.doctores.find(id) with usuario relation
  → return public data
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/infrastructure/profiles/schemas.ts` | Create | Zod schemas: `updateDoctorSchema`, `updatePacienteSchema`, `updateProfileSchema` (discriminated union) |
| `src/infrastructure/api/routers/profiles.ts` | Modify | Replace empty `router({})` with `getMyProfile`, `updateMyProfile`, `getDoctorProfile` |
| `src/app/perfil/page.tsx` | Create | Client page: fetches profile, renders `ProfileForm` in edit mode |
| `src/app/doctores/[id]/page.tsx` | Create | Client page: fetches public doctor, renders `DoctorCard` |
| `src/components/profiles/ProfileForm.tsx` | Create | Role-aware form with shadcn Form/Input/Textarea/Select/Button |
| `src/components/profiles/DoctorCard.tsx` | Create | Read-only card with shadcn Card/Badge |
| `src/infrastructure/api/routers/__tests__/profiles.test.ts` | Create | Integration tests with mocked DB |
| `package.json` | Modify | Add `react-hook-form`, `@hookform/resolvers` |
| — | shadcn add | `npx shadcn@latest add form input textarea select card badge` |

## Interfaces / Contracts

```typescript
// Return type for getMyProfile / updateMyProfile
interface ProfileResponse {
  id: string; email: string; nombre: string; telefono: string;
  rol: "DOCTOR" | "PACIENTE"; activo: boolean;
  doctor?: {
    id: string; numeroColegiado: string; especialidad: string;
    biografia: string | null; precioConsulta: number | null;
    verificado: boolean; calificacionMedia: number | null;
  };
  paciente?: {
    id: string; fechaNacimiento: string;
    direccionCalle: string; direccionCiudad: string;
    direccionProvincia: string; direccionCodigoPostal: string;
    direccionPais: string;
    alergias: string[]; grupoSanguineo: string | null;
    notasMedicas: string | null;
  };
}

// Public doctor response
interface DoctorPublicResponse {
  id: string; nombre: string; email: string;
  especialidad: string; biografia: string | null;
  precioConsulta: number | null; calificacionMedia: number | null;
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Zod validation schemas | Test valid/invalid inputs for each role schema, verify discriminated union rejects mismatched role+fields |
| Integration | tRPC procedures | Hoisted DB mocks (same pattern as `auth.test.ts`), `createCaller` for isolated testing. Test: getMyProfile returns doctor data for DOCTOR, patient data for PACIENTE; updateMyProfile persists and returns updated data; getDoctorProfile returns public data; UNAUTHORIZED without session |

## Migration / Rollout

No migration required. Existing users without `doctores`/`pacientes` rows get `null` role-specific data gracefully; UI shows "no profile" placeholder.

## Open Questions

None.
