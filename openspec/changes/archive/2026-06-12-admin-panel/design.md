# Design: Admin Panel

## Technical Approach

Compose an `adminProcedure` middleware on top of `protectedProcedure` (single role check, no session re-query). Add `adminRouter` with doctor CRUD + dashboard stats. Client pages use the existing Shell layout with tRPC server calls. Navigation conditions admin items on `session.user.role === "ADMIN"`.

## Architecture Decisions

### Decision: adminProcedure composition

| Option | Tradeoff |
|--------|----------|
| Standalone middleware | Duplicates auth check already done by protectedProcedure |
| Compose on protectedProcedure | Single responsibility — protectedProcedure checks auth, adminProcedure checks role |

**Choice**: Compose `adminProcedure` using `t.procedure.use()` that wraps `protectedProcedure` via a helper.

### Decision: DB queries — reused eager singleton

**Choice**: Continue using direct `db` import from `@/infrastructure/db`. No service layer wrapper. Matches every existing router (`profiles.ts`, `bookings.ts`).

### Decision: Transaction for createDoctor

**Choice**: `db.transaction()` with two inserts — first `usuarios` (with `hash(password)`), then `doctores` referencing the inserted `usuarioId`. Reuse `hash` from `@/infrastructure/auth/password`. Reuse `registerSchema`-like validation for Usuario fields.

### Decision: Dashboard stats inline in router

**Choice**: Write aggregation queries directly in `admin.getDashboardStats`, not a separate stats service. Only 6 queries, no complex orchestration. If metrics grow later, extract to `src/infrastructure/dashboard/stats.ts`.

### Decision: Page-level role gate

**Choice**: `/dashboard/layout.tsx` uses `auth()` (server-side) and redirects non-ADMIN to `/`. Avoids client-side flash. Uses Next.js `redirect()` from `next/navigation`.

## Data Flow

```
Browser ──GET /dashboard──→ layout.tsx (auth() → role check)
  │                              │
  │  admin ──→ Shell wrapper     │  non-admin ──→ redirect("/")
  │         page.tsx             │
  │           │                  │
  │    api.admin.getDashboardStats.useQuery()
  │           │                  │
  │         tRPC ──→ adminProcedure (protectedProcedure + role check)
  │                    │
  │               adminRouter.getDashboardStats
  │                    │
  │               db.select(...).from(...)  ← eager singleton
  │                    │
  └── Response ────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/infrastructure/api/trpc.ts` | Modify | Add `adminProcedure` middleware export |
| `src/infrastructure/api/routers/admin.ts` | Create | Admin router — doctors CRUD + dashboard stats |
| `src/infrastructure/api/routers/_app.ts` | Modify | Register `adminRouter` under `admin` key |
| `src/app/dashboard/layout.tsx` | Create | Role-gated layout, wraps children in Shell |
| `src/app/dashboard/page.tsx` | Create | Dashboard page — metric cards from tRPC |
| `src/app/dashboard/doctores/page.tsx` | Create | Doctor list — search + table + pagination |
| `src/app/dashboard/doctores/nuevo/page.tsx` | Create | Create doctor form |
| `src/app/dashboard/doctores/[id]/page.tsx` | Create | Edit doctor form (prefilled) |
| `src/components/navigation.ts` | Modify | Add admin-only nav items (Dashboard, Doctores) |
| `src/components/Sidebar.tsx` | Modify | Accept `userRole` prop, filter nav items |
| `src/infrastructure/db/seed.ts` | Create | Admin bootstrap seed script |
| `package.json` | Modify | Add `"db:seed": "tsx src/infrastructure/db/seed.ts"` |

## Interfaces / Contracts

### adminProcedure

```typescript
// src/infrastructure/api/trpc.ts
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acceso denegado: se requiere rol de administrador",
    });
  }
  return next({ ctx });
});
```

### adminRouter input/output types

```typescript
// Dashboard stats
interface DashboardStats {
  totalDoctores: number;
  totalPacientes: number;
  totalCitas: number;
  citasPorEstado: Record<string, number>;
  registrosDiarios: Array<{ fecha: string; count: number }>;
  ingresos: number; // sum of precio for COMPLETADA citas last 30d
}

// List doctors
interface ListDoctoresInput { pagina?: number; limite?: number; busqueda?: string; }
interface ListDoctoresResponse {
  doctores: Array<{
    id: string; numeroColegiado: string; especialidad: string;
    nombre: string; email: string; activo: boolean;
  }>;
  total: number; pagina: number; totalPaginas: number;
}

// Get doctor (includes Usuario fields)
interface GetDoctorResponse {
  id: string; usuarioId: string; numeroColegiado: string;
  especialidad: string; biografia: string | null;
  precioConsulta: number | null; verificado: boolean;
  email: string; nombre: string; telefono: string; activo: boolean;
}

// Create doctor
const createDoctorSchema = z.object({
  email: z.string().email(), password: z.string().min(8),
  nombre: z.string().min(2), telefono: z.string().optional(),
  numeroColegiado: z.string().min(1), especialidad: z.string().min(1),
  biografia: z.string().optional(), precioConsulta: z.number().positive().optional(),
});

// Update doctor — partial Doctor fields + Usuario fields (no email, no role)
const updateDoctorSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(2).optional(), telefono: z.string().optional(),
  numeroColegiado: z.string().min(1).optional(), especialidad: z.string().min(1).optional(),
  biografia: z.string().optional(), precioConsulta: z.number().positive().optional(),
});

// Delete doctor
const deleteDoctorSchema = z.object({
  doctorId: z.string().uuid(), tipo: z.enum(["soft", "hard"]),
});
```

### Navigation type extension

```typescript
// navItems export remains unchanged
// Sidebar accepts: userRole?: string
// Filter: if (userRole === "ADMIN") show all; else filter out admin items
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | adminProcedure middleware | Mock session with ADMIN/DOCTOR/PACIENTE roles, assert TRPCError codes |
| Unit | Zod input schemas | Test valid/invalid inputs for create/update/delete |
| Unit | Dashboard stats queries | Use Drizzle test helpers or mock return values |
| Integration | adminRouter procedures | Integration test with real DB via `createCaller` |
| E2E | Full admin flow | Playwright — login as admin, visit dashboard, create/edit/delete doctor |

## Migration / Rollout

No migration required — `usuarios.rol` already supports `"ADMIN"`. Run seed script to bootstrap initial admin user. Deploy alongside existing routes; no breaking changes to existing sessions.

## Open Questions

- [ ] Install shadcn `Table` component or build a simple table with existing primitives?
- [ ] Should `ingresos` use `citas.precio` or a separate billing table? (Spec says sum of appointments — use `citas.precio` for now, nullable tracking)
