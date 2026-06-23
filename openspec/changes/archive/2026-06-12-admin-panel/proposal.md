# Proposal: Admin Panel

## Intent

Deliver an admin dashboard for clinic supervisors. Currently the system has an `ADMIN` role defined in the `UserRole` enum but zero infrastructure to use it — no admin middleware, no admin routes, no dashboard, and no way to create admin users. This change operationalizes the ADMIN role end-to-end: tRPC guard, CRUD for doctors, dashboard metrics, and role-based nav.

## Scope

### In Scope
- tRPC `adminProcedure` middleware (checks `session.user.role === ADMIN`)
- `adminRouter` with doctors CRUD + stats queries
- `/dashboard` page as admin-only hub with key metrics
- Doctor CRUD UI (list, create, edit, view) under `/dashboard/doctors`
- Role-based sidebar nav items (admin-only items conditional on role)
- DB seed script to bootstrap first admin user

### Out of Scope
- Admin management of patients, appointments, or other entities (future)
- Superadmin/DPO-specific interfaces
- Audit log viewer
- CSV/PDF export of metrics

## Capabilities

### New Capabilities
- `admin-auth-middleware`: tRPC procedure guarding all admin routes, enforces `UserRole.ADMIN`
- `admin-doctor-crud`: Doctors CRUD over tRPC (list, create, get, update, delete)
- `admin-dashboard`: Metrics page — total doctors, patients, appointments, appointments by status, daily new registrations, revenue
- `admin-seed`: Script to create initial admin user via `drizzle-kit` compatible seed

### Modified Capabilities
- `auth-core`: Add `adminProcedure` to tRPC; `session.user.role` is already present from JWT callbacks
- `ui-navigation`: Sidebar renders admin-only items (`/dashboard`, `/dashboard/doctors`) when role is ADMIN
- `db-schema`: No schema changes needed — `usuarios.role` already supports ADMIN values

## Approach

1. **Middleware**: Add `adminProcedure` wrapper in `src/infrastructure/api/trpc.ts` that reads `ctx.session.user.role` and rejects non-ADMIN
2. **Router**: Create `src/infrastructure/api/routers/admin/` with doctors CRUD procedures and stats aggregation queries
3. **Pages**: Create `src/app/dashboard/` layout and pages using the existing Shell component
4. **UI**: Build doctor CRUD with server-side data via tRPC; dashboard metrics as stat cards
5. **Nav**: Conditionally render admin nav items in sidebar based on user role
6. **Seed**: Create `src/infrastructure/db/seed.ts` with admin user creation (hashed password, role ADMIN)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/infrastructure/api/trpc.ts` | Modified | Add `adminProcedure` export |
| `src/infrastructure/api/routers/` | New | `admin/` router directory |
| `src/app/dashboard/` | New | Dashboard layout + pages |
| `src/components/` | New | Admin-specific components |
| Sidebar component | Modified | Conditional admin nav items |
| `src/infrastructure/db/seed.ts` | New | Admin bootstrap seed |
| `src/auth.ts` | Modified | Add `isAdmin` helper |
| `package.json` | Modified | Add `db:seed` script |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| No existing admin users to test | Medium | Seed script + manual role grant in DB |
| `/dashboard` route may conflict with future patient dashboards | Low | Keep `/dashboard` admin-only; patient/doctor stay on existing routes |

## Rollback Plan

- Remove `adminProcedure` and `adminRouter` additions
- Delete `src/app/dashboard/` directory
- Revert sidebar nav changes in Shell component
- Drop seeded admin users from database

## Dependencies

- `UserRole.ADMIN` already exists in `src/domain/enums/` — no migration needed
- shadcn `Table` component may need to be installed (not currently in project)

## Success Criteria

- [ ] `adminProcedure` rejects non-ADMIN sessions with 403
- [ ] Doctors CRUD works end-to-end (create, list, edit, delete)
- [ ] Dashboard shows all 6 metrics with correct data from DB
- [ ] Admin-only nav items hidden for DOCTOR/PACIENTE roles
- [ ] Seed script creates a login-ready admin user
