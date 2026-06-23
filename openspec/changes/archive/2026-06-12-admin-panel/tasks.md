# Tasks: Admin Panel

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,000 (→ ~200 generated shadcn Table, ~800 business code) |
| 800-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

> **Note**: The shadcn Table component (~200 generated lines) is CLI boilerplate and excluded from review burden. The ~800 lines of business logic fit the 800-line review budget. Single PR is appropriate.

## Phase 1: Infrastructure

- [x] **1.1** `src/infrastructure/api/trpc.ts` — Add `adminProcedure` export after `protectedProcedure` (compose on top, single role check `ctx.session.user.role !== "ADMIN"` → `FORBIDDEN`)
- [x] **1.2** `src/infrastructure/api/routers/admin.ts` — Create `adminRouter` with 6 procedures: `getDashboardStats` (6 aggregate queries), `listDoctores` (search + paginate), `getDoctor` (single doctor + usuario join), `createDoctor` (transaction: hash + usuario + doctor, CONFLICT on duplicate email/colegiado), `updateDoctor` (transaction, partial fields, no email/role), `deleteDoctor` (soft/hard, PRECONDITION_FAILED if future citas)
  - Imports from `@/trpc`, `@/infrastructure/db`, `@/infrastructure/db/schema`, `@/infrastructure/auth/password`, `drizzle-orm`, `zod`
  - Reuse `hash` from `@/infrastructure/auth/password`
  - Use `db.transaction()` for create/update/delete
- [x] **1.3** `src/infrastructure/api/routers/_app.ts` — Register `adminRouter` under key `admin` (import + spread)

## Phase 2: UI Components

- [x] **2.1** shadcn Table — Run `npx shadcn@latest add table` to install `@/components/ui/table`
- [x] **2.2** `src/components/admin/DoctorForm.tsx` — Create shared client form with react-hook-form + Zod resolver. Fields: email, password, nombre, telefono, numeroColegiado, especialidad, biografia, precioConsulta. Props: `mode: "create" | "edit"`, `initialData?`, `onSuccess`, `onError`
- [x] **2.3** `src/components/navigation.ts` — Add `adminOnly?: boolean` to `NavItem` interface. Add admin items: Dashboard (`/dashboard`, admin-only), Doctores (`/dashboard/doctores`, admin-only). Existing `/doctores` stays public
- [x] **2.4** `src/components/Sidebar.tsx` — Accept `userRole?: string` prop. Filter out `adminOnly` items when role is not ADMIN
- [x] **2.5** `src/components/Shell.tsx` — Pass `userRole` from session to `Sidebar` (or lift role via the auth context)

## Phase 3: Dashboard Pages

- [x] **3.1** `src/app/dashboard/layout.tsx` — Server component layout. Call `auth()` from `@/auth`, redirect non-ADMIN to `/` with `redirect()` from `next/navigation`, wrap children in `<Shell>`
- [x] **3.2** `src/app/dashboard/page.tsx` — Client page. `api.admin.getDashboardStats.useQuery()` → render 6 metric cards (totalDoctores, totalPacientes, totalCitas, citasPorEstado, registrosDiarios, ingresos). Loading state with `<Skeleton>`. Error state with `<Alert>`
- [x] **3.3** `src/app/dashboard/doctores/page.tsx` — Client page. Search input (debounced) + paginated `<Table>` from `api.admin.listDoctores`. Empty state: "No se encontraron médicos". Columns: nombre, email, especialidad, activo (badge), actions (Edit link, Delete button)
- [x] **3.4** `src/app/dashboard/doctores/nuevo/page.tsx` — Client page. Renders `<DoctorForm mode="create" />`. On success redirects to `/dashboard/doctores/[id]`
- [x] **3.5** `src/app/dashboard/doctores/[id]/page.tsx` — Client page. `api.admin.getDoctor.useQuery()` prefills `<DoctorForm mode="edit" />` plus delete button with confirmation dialog (`api.admin.deleteDoctor` with soft/hard option)

## Phase 4: Seed & Wiring

- [x] **4.1** `src/infrastructure/db/seed.ts` — Create idempotent seed. Check if admin exists by email, skip if found. Insert `usuarios` with `rol: "ADMIN"`, email `admin@medicoconsulta.com`, bcrypt hash (rounds=12) of `Admin123!`. Import `hash` from `@/infrastructure/auth/password`, `db` from `@/infrastructure/db`
- [x] **4.2** `package.json` — Add script `"db:seed": "tsx src/infrastructure/db/seed.ts"`

## Summary

| Task | File | Lines (est.) | Depends on |
|------|------|-------------|------------|
| 1.1 | `trpc.ts` | +6 | — |
| 1.2 | `routers/admin.ts` | +230 | 1.1 |
| 1.3 | `_app.ts` | +3 | 1.2 |
| 2.1 | `ui/table.tsx` | +200 (generated) | — |
| 2.2 | `DoctorForm.tsx` | +130 | 2.1 |
| 2.3 | `navigation.ts` | +20 | — |
| 2.4 | `Sidebar.tsx` | +25 | 2.3 |
| 2.5 | `Shell.tsx` | +5 | 2.4 |
| 3.1 | `dashboard/layout.tsx` | +25 | 1.1, 2.5 |
| 3.2 | `dashboard/page.tsx` | +95 | 1.2, 3.1 |
| 3.3 | `dashboard/doctores/page.tsx` | +135 | 1.2, 2.1, 3.1 |
| 3.4 | `dashboard/doctores/nuevo/page.tsx` | +15 | 2.2, 3.1 |
| 3.5 | `dashboard/doctores/[id]/page.tsx` | +65 | 2.2, 3.1 |
| 4.1 | `db/seed.ts` | +45 | — |
| 4.2 | `package.json` | +3 | 4.1 |
| **Total** | **15 files** | **~1,000** **(~800 biz)** | |
