# Delta Spec: Admin Panel

## Purpose

Operationalize the `ADMIN` role end-to-end: tRPC guard, doctor CRUD, dashboard metrics, role-based navigation, and admin seed script.

---

## NEW CAPABILITIES

### admin-auth-middleware

#### Requirement: adminProcedure

The system MUST expose an `adminProcedure` tRPC middleware that requires a valid session AND `session.user.role === "ADMIN"`.

##### Scenario: Authenticated admin passes

- GIVEN a valid session with `role === "ADMIN"`
- WHEN any admin procedure is called
- THEN the request MUST proceed to the handler

##### Scenario: Not authenticated

- GIVEN no session cookie
- WHEN an admin procedure is called
- THEN the middleware MUST throw `TRPCError` with code `UNAUTHORIZED`

##### Scenario: Authenticated but not admin

- GIVEN a valid session with `role === "DOCTOR"` or `role === "PACIENTE"`
- WHEN an admin procedure is called
- THEN the middleware MUST throw `TRPCError` with code `FORBIDDEN`

#### Requirement: adminRouter — getDashboardStats

The system MUST expose `admin.getDashboardStats` (admin, query) returning: `totalDoctores`, `totalPacientes`, `totalCitas`, `citasPorEstado` (breakdown), `registrosDiarios` (last 7 days), `ingresos` (last 30 days).

##### Scenario: Admin fetches dashboard stats

- GIVEN an authenticated admin session AND data exists in all tables
- WHEN `admin.getDashboardStats` is called
- THEN the response MUST contain all 6 metric groups with correct aggregate values

##### Scenario: Empty database returns zeros

- GIVEN no doctors, patients, or appointments exist
- WHEN `admin.getDashboardStats` is called
- THEN `totalDoctores`, `totalPacientes`, `totalCitas` MUST be 0 AND `citasPorEstado` MUST be an empty object AND `ingresos` MUST be 0

#### Requirement: adminRouter — listDoctores

The system MUST expose `admin.listDoctores` (admin, query) accepting `pagina` (default 1), `limite` (default 10), `busqueda` (optional — filters by nombre or especialidad). Returns `{ doctores, total, pagina, totalPaginas }`.

##### Scenario: Paginated list with search

- GIVEN 25 doctors exist with varied nombres and especialidades
- WHEN `admin.listDoctores({ pagina: 1, limite: 10, busqueda: "Cardio" })` is called
- THEN the response MUST return at most 10 doctors matching "Cardio" in nombre or especialidad, with `total` reflecting the matched count

##### Scenario: Empty results

- GIVEN no doctors match the search
- WHEN `admin.listDoctores({ busqueda: "NoExiste" })` is called
- THEN the response MUST return `{ doctores: [], total: 0, pagina: 1, totalPaginas: 0 }`

#### Requirement: adminRouter — getDoctor

The system MUST expose `admin.getDoctor` (admin, query) accepting `id` (doctor ID) and returning full doctor details including linked Usuario fields (email, nombre, telefono).

##### Scenario: Doctor found

- GIVEN a valid doctor ID with an associated Usuario
- WHEN `admin.getDoctor({ id })` is called
- THEN the response MUST include all Doctor columns AND the Usuario's email, nombre, telefono, activo

##### Scenario: Doctor not found

- GIVEN a non-existent doctor ID
- WHEN `admin.getDoctor({ id })` is called
- THEN the system MUST throw `TRPCError` with code `NOT_FOUND`

#### Requirement: adminRouter — createDoctor

The system MUST expose `admin.createDoctor` (admin, mutation) accepting Usuario fields (email, password, nombre, telefono) + Doctor fields (numeroColegiado, especialidad, biografia, precioConsulta). MUST create Usuario + Doctor in a single database transaction.

##### Scenario: Successful creation

- GIVEN valid input with unique email and numeroColegiado
- WHEN `admin.createDoctor` is called
- THEN a Usuario row with `role === "DOCTOR"` AND a Doctor row are created AND the response returns the new Doctor with linked Usuario data

##### Scenario: Duplicate email rejected

- GIVEN an email already registered
- WHEN `admin.createDoctor` is called with that email
- THEN the system MUST throw `TRPCError` with code `CONFLICT` AND MUST NOT create any rows

##### Scenario: Duplicate numeroColegiado rejected

- GIVEN a numeroColegiado already in use
- WHEN `admin.createDoctor` is called with that value
- THEN the system MUST throw `TRPCError` with code `CONFLICT`

#### Requirement: adminRouter — updateDoctor

The system MUST expose `admin.updateDoctor` (admin, mutation) accepting doctor ID + partial Doctor fields AND optionally Usuario fields (nombre, telefono). MUST update in a transaction. MUST NOT change role or email.

##### Scenario: Successful update

- GIVEN an existing doctor ID
- WHEN `admin.updateDoctor({ id, especialidad: "Neurología", nombre: "Dr. Updated" })` is called
- THEN the Doctor's especialidad AND the Usuario's nombre MUST be updated AND the response returns the updated doctor

##### Scenario: Non-existent ID

- GIVEN a doctor ID that does not exist
- WHEN `admin.updateDoctor` is called
- THEN the system MUST throw `TRPCError` with code `NOT_FOUND`

#### Requirement: adminRouter — deleteDoctor

The system MUST expose `admin.deleteDoctor` (admin, mutation) accepting `doctorId` and `tipo` (`"soft"` | `"hard"`). Soft sets `activo = false` on Doctor and Usuario. Hard deletes both rows. MUST reject if Doctor has future appointments.

##### Scenario: Soft delete

- GIVEN an existing doctor with no future appointments
- WHEN `admin.deleteDoctor({ doctorId, tipo: "soft" })` is called
- THEN `Doctor.activo` AND `Usuario.activo` MUST be set to `false`

##### Scenario: Hard delete

- GIVEN an existing doctor with no future appointments
- WHEN `admin.deleteDoctor({ doctorId, tipo: "hard" })` is called
- THEN both Doctor and Usuario rows MUST be deleted

##### Scenario: Future appointments block deletion

- GIVEN a doctor with pending/confirmed future appointments
- WHEN `admin.deleteDoctor({ doctorId, tipo: "hard" })` is called
- THEN the system MUST throw `TRPCError` with code `PRECONDITION_FAILED` AND NOT delete any rows

---

### admin-dashboard (Pages)

#### Requirement: /dashboard — Admin Dashboard Page

The system MUST render a page at `/dashboard` (admin-only) showing stat cards for each metric from `getDashboardStats`. MUST redirect non-admin users.

##### Scenario: Admin views dashboard

- GIVEN an authenticated admin session
- WHEN visiting `/dashboard`
- THEN the page MUST display metric cards for totalDoctores, totalPacientes, totalCitas, citasPorEstado, registrosDiarios, and ingresos with values fetched from tRPC

##### Scenario: Non-admin redirected

- GIVEN an authenticated DOCTOR session
- WHEN visiting `/dashboard`
- THEN the user MUST be redirected to their home page (e.g., `/`) with a 403-equivalent behavior

#### Requirement: /dashboard/doctores — Doctor List Page

The system MUST render a page at `/dashboard/doctores` with a search input, pagination, and a table listing doctors with columns: nombre, email, especialidad, activo, actions (Edit, Delete).

##### Scenario: Admin views doctor list

- GIVEN an authenticated admin session and multiple doctors exist
- WHEN visiting `/dashboard/doctores`
- THEN the page MUST show a searchable, paginated table with doctor data from `admin.listDoctores`

##### Scenario: Empty search state

- GIVEN no doctors match the search query
- WHEN searching in the doctor list
- THEN the table MUST show an empty state message "No se encontraron médicos"

#### Requirement: /dashboard/doctores/nuevo — Create Doctor Form

The system MUST render a page at `/dashboard/doctores/nuevo` with a form for all Usuario + Doctor fields. On submit, calls `admin.createDoctor` and redirects to `/dashboard/doctores/[id]` on success.

##### Scenario: Admin creates doctor via form

- GIVEN an authenticated admin session
- WHEN filling all required fields and submitting
- THEN `admin.createDoctor` MUST be called AND on success the user MUST be redirected to the new doctor's edit page

##### Scenario: Validation errors shown inline

- GIVEN invalid input (e.g., weak password, invalid email)
- WHEN submitting the create form
- THEN Zod validation errors MUST be displayed inline on the respective fields AND the form MUST NOT submit

#### Requirement: /dashboard/doctores/[id] — Edit Doctor Page

The system MUST render a page at `/dashboard/doctores/[id]` with a pre-filled form for editing Doctor + Usuario fields. On submit, calls `admin.updateDoctor`. Also displays a delete button with confirmation dialog.

##### Scenario: Admin edits doctor

- GIVEN an authenticated admin session and a valid doctor ID
- WHEN visiting `/dashboard/doctores/[id]`
- THEN the form MUST be pre-filled with current doctor data AND updated on successful submit

##### Scenario: Delete with confirmation

- GIVEN the edit page for a doctor
- WHEN clicking the delete button and confirming in the dialog
- THEN `admin.deleteDoctor` MUST be called with the selected tipo AND the page MUST redirect to `/dashboard/doctores`

##### Scenario: Non-existent doctor ID

- GIVEN a doctor ID that does not exist
- WHEN visiting `/dashboard/doctores/[id]`
- THEN the page MUST show a 404-equivalent error state

---

### admin-seed

#### Requirement: Seed Script

The system MUST provide a seed script at `src/infrastructure/db/seed.ts` callable via `npm run db:seed` that creates an admin Usuario with known credentials (default: admin@medicoconsulta.com / Admin123!). HASH with bcryptjs rounds=12.

##### Scenario: Seed creates admin user

- GIVEN an empty database
- WHEN `npm run db:seed` is executed
- THEN a Usuario row MUST exist with `email = "admin@medicoconsulta.com"` AND `role = "ADMIN"` AND a bcrypt-verifiable password hash

##### Scenario: Idempotent — skip if exists

- GIVEN an admin user already exists
- WHEN `npm run db:seed` is executed
- THEN the script MUST NOT create a duplicate AND MUST log a notice that admin already exists

---

## MODIFIED CAPABILITIES (Deltas)

### domain-entities

#### Requirement: UserRole Enum (Modified)

The `UserRole` enum MUST contain `ADMIN` (unchanged from existing spec). The ADMIN value is now actively enforced by `adminProcedure` middleware — only users with `role === "ADMIN"` MAY access admin procedures.
(Previously: ADMIN was defined but not operationally enforced by any middleware.)

##### Scenario: ADMIN role used in authorization (added)

- GIVEN a user with `UserRole.ADMIN`
- WHEN they call an admin-protected procedure
- THEN the authorization middleware MUST pass the user through to the handler

##### Scenario: Non-ADMIN rejected by admin middleware (added)

- GIVEN a user with `UserRole.DOCTOR`
- WHEN they call an admin-protected procedure
- THEN the authorization middleware MUST reject with `FORBIDDEN`

---

### auth-core

#### Requirement: adminProcedure Middleware (Added)

The tRPC context MUST expose `adminProcedure` as a middleware that reads `session.user.role` from the existing session (populated by the JWT callback) and enforces `role === "ADMIN"`.

##### Scenario: Admin procedure uses existing session

- GIVEN the JWT callback has populated `session.user.role` with the `ADMIN` value
- WHEN `adminProcedure` middleware runs
- THEN it MUST read `ctx.session.user.role` and compare to `"ADMIN"` without additional DB queries

##### Scenario: Admin procedure unwraps session lazily

- GIVEN the `protectedProcedure` pattern
- WHEN `adminProcedure` is composed on top of `protectedProcedure`
- THEN `adminProcedure` SHALL only check role, relying on `protectedProcedure` for authentication — reducing duplicate session reads

---

### auth-api

#### Requirement: Protected Procedure Pattern (Modified)

The auth-api spec SHALL note that `protectedProcedure` is the base for `adminProcedure`. The `admin.get*` and `admin.*` procedures in the `adminRouter` MUST chain `adminProcedure` on top of `protectedProcedure`.
(Previously: only `protectedProcedure` was defined for general auth. No role-specific middleware existed.)

##### Scenario: Admin router composed with adminProcedure

- GIVEN the `adminRouter` is defined
- WHEN each procedure in `adminRouter` is inspected
- THEN EVERY procedure MUST use `adminProcedure` (or a composition chain that includes it) as its middleware

---

### profiles-api

#### Requirement: Admin Doctor Management (Added)

The admin CRUD for doctors (`adminRouter` procedures) is SEPARATE from profile management. Admin CRUD bypasses the `updateMyProfile` role-based field restrictions — admins MAY update any Doctor and Usuario field (except email and role).

##### Scenario: Admin can update any doctor's fields

- GIVEN an authenticated admin session
- WHEN `admin.updateDoctor` is called with fields including `especialidad`, `biografia`, `precioConsulta`, `nombre`, `telefono`
- THEN ALL fields MUST be updated regardless of role-based restrictions that apply to `updateMyProfile`

---

### ui-layout

#### Requirement: Shell Provides Dashboard Wrapper (Added)

The Shell component MUST wrap dashboard pages (`/dashboard`, `/dashboard/doctores`, `/dashboard/doctores/*`) just as it wraps the main application. Admin pages SHALL reuse the existing Shell with no layout changes.

##### Scenario: Dashboard pages render inside Shell

- GIVEN an authenticated admin session
- WHEN visiting `/dashboard/doctores`
- THEN the page MUST render inside the Shell layout with sidebar and header visible

---

### ui-navigation

#### Requirement: Sidebar Navigation Items (Modified)

The sidebar MUST conditionally render admin-only navigation items when the authenticated user's role is `ADMIN`: Dashboard (`/dashboard`) and Doctors (`/dashboard/doctores`). Non-admin users MUST NOT see these items.
(Previously: sidebar rendered fixed nav items regardless of role. Admin items did not exist.)

##### Scenario: Admin user sees admin nav items

- GIVEN an authenticated user with `role === "ADMIN"`
- WHEN the sidebar renders
- THEN the user MUST see "Dashboard" and "Doctores" items in the sidebar

##### Scenario: Non-admin user does not see admin items

- GIVEN an authenticated user with `role === "DOCTOR"` or `role === "PACIENTE"`
- WHEN the sidebar renders
- THEN the user MUST NOT see "Dashboard" or "Doctores" items

##### Scenario: Active route highlights admin items

- GIVEN an admin user on `/dashboard` or `/dashboard/doctores`
- WHEN the sidebar renders
- THEN the matching admin nav item MUST have the active visual state (same as other nav items)
