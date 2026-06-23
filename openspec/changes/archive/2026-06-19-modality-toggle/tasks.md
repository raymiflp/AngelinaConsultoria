# Tasks — Appointment Modality (`modality-toggle`)

> Auto-forecast mode. Review budget: 800 lines (user D2). Delivery: chained PRs (`stacked-to-main`).
>
> **Change ID**: `2026-06-19-modality-toggle`
> **Mode**: auto / 800-line budget
> **Delivery**: chained PRs (stacked-to-main)
> **Total estimated lines**: ~1,015 (PR-A 570 + PR-B 445)
> **Split**:
> - **PR-A** (Data + settings + badge + listing filter): ~570 lines — independently shippable (badge + toggle work before the patient-side picker)
> - **PR-B** (Booking flow + JoinCallButton + getRoomToken): ~445 lines — depends on PR-A (the `citas.modalidad` column and `ConsultaModalidad` enum must exist)
>
> **Soft exception**: both PRs are over the canonical 400-line cap from the `chained-pr` skill (PR-A +170, PR-B +45). The split is honored at the user-D2 (800) level. See "Review Workload Forecast" below for the documented rationale (per design §11.4).

**Note on paths**: The design phase reconciled path references against the actual codebase. Key facts used in this task file:

- `createAppointmentSchema` lives at `src/infrastructure/booking/schemas.ts` (confirmed by `grep` — the design referenced the same path; `bookings.ts` imports from there).
- `getDoctorFullProfileUseCase` lives at `src/application/use-cases/profiles/get-doctor-full-profile.use-case.ts` (the file the `profiles.getDoctorFullProfile` procedure delegates to). The `aceptaOnline` field extension happens in that use case, not in the procedure body.
- `DoctorPublicResponse` / `DoctorFullProfileResponse` shapes live in `src/infrastructure/profiles/schemas.ts` (the design referenced the same path).
- `AuditAction` is exported from `src/application/use-cases/audit/write-audit-log.use-case.ts` (mirroring the video-calls precedent).
- The next migration sequence number is `0004` (existing migrations end at `0003_good_colonel_america.sql`).
- `JoinCallButton` lives at `src/components/booking/JoinCallButton.tsx`. The booking page lives at `src/app/doctores/[id]/agendar/page.tsx`. `SlotGrid` is a sibling component in `src/components/booking/`.
- The use case pattern is `useCase(db as never, input)` (matches the existing `bookings.ts` procedures; same `as never` cast as the video-calls change).
- The `getRoomToken` gate order is: (1) auth/existence, (2) status/time-window, (3) modality. Modality is the LAST gate, so a PRESENCIAL cita outside the time window still gets the time-window message (D6 / R2 mitigation).
- The `createAppointment` modality gate re-reads `doctores.acepta_online` INSIDE the existing `db.transaction` (AD-13), closing the TOCTOU window when a doctor toggles off mid-booking. The check is a narrow `.select({ aceptaOnline: true })` projection.

---

## Change overview

This change ships the **business rule that decides which citas get video calls**: the data plane (`citas.modalidad`, `doctores.acepta_online`), the doctor opt-in toggle (`/configuracion` "Modalidad de consulta"), the patient-facing surfacing (`DoctorHero` "Disponible online" badge + `/doctores` filter pill), the booking flow modality picker (`/doctores/[id]/agendar`), and the gating logic on the call surface (`getRoomToken` rejects PRESENCIAL with `FORBIDDEN`; `JoinCallButton` returns `null` for PRESENCIAL). It is **additive at the DB + spec layers**, **non-destructive at the UI layer**, and **deliberately minimal at the doctor surface** (one toggle in `/configuracion`, no new page, no per-day grid). The full intent, scope, and decision register live in [`proposal.md`](./proposal.md) (D1-D13, AD-1..AD-13, R1-R11). The technical design, file-by-file change list, and 4-statement migration shape live in [`design.md`](./design.md) (14 sections, 1,615 lines).

## Review Workload Forecast

| PR | Files | LOC est. | 400-line risk | 800-line risk | Decision |
|---|---|---|---|---|---|
| **PR-A** | 23 | 570 | HIGH (170 over) | OK | Chained (`stacked-to-main`) |
| **PR-B** | 15 | 445 | HIGH (45 over) | OK | Chained (`stacked-to-main`), depends on PR-A |
| **Total** | 38 | 1,015 | — | — | — |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**Soft exception rationale (per design §11.4):** both PRs exceed the canonical 400-line cap from the `chained-pr` skill, but each PR is under the user's cached D2 800-line budget. The margin (PR-A +170, PR-B +45) does not justify a 3-way chain:

- PR-A's natural cohesion is "data + opt-in + surfacing". A 3-way split (PR-A.1 data + audit, PR-A.2 badge + listing, PR-A.3 settings card) fragments a single logical unit and adds a third PR for a diff that is already independently reviewable.
- PR-B's natural cohesion is "booking flow + gate". Splitting the booking flow refactor from the `getRoomToken` gate adds a third PR for a 2-day diff that a reviewer can read in ~60 minutes.

The chained-PR decision is recommended for **reviewer cognitive load** (one slice = data + settings + surfacing, one slice = booking flow + gate), not for line count alone. If the user insists on the strict 400-line cap, the 2-PR chain becomes a 3-PR chain (PR-A → PR-A.1 → PR-A.2 → PR-B); the `sdd-apply` phase can request the 3-PR chain at that point.

## PR split rationale

Two chained PRs, both `stacked-to-main`. PR-A merges to `main` first; PR-B branches off `main` after PR-A lands, stacks on top, and merges to `main` second. The split is along the natural data-vs-flow boundary:

- **PR-A is independently shippable.** The badge + toggle work even before the booking flow picker lands. Existing citas default to `PRESENCIAL` via the migration backfill (D1/D3), so `getRoomToken` does not yet check modality (the gate is added in PR-B) and the surface is internally consistent. Patients see the badge and the filter; doctors can opt in; no patient can book an online cita yet.
- **PR-B depends on PR-A.** The `citas.modalidad` column must exist (PR-A); the `ConsultaModalidad` enum must exist (PR-A); the booking flow's "Online" option being disabled when `doctor.aceptaOnline === false` requires the doctor flag to exist (PR-A); `getRoomTokenUseCase` reads `cita.modalidad` from the SELECT projection, which is the new column (PR-A).

```
PR-A ────► main  (merge PR-A first)
            │
            └──► PR-B ────► main  (stack PR-B on PR-A, merge second)
```

---

## PR-A — Data + Settings + Badge + Listing filter

**Goal**: Land the data plane (two new columns + 4-statement migration), the domain (new enum + entity fields), the doctor opt-in surface (use case + audit union + tRPC mutation + settings card), the patient-facing surfacing (`DoctorHero` badge + `/doctores` filter pill + extended `getDoctorProfile` / `getDoctorFullProfile` / `listDoctorProfiles`), and the new `doctor-settings-ui` spec. After PR-A, doctors can opt in via `/configuracion`, patients see the badge on `DoctorHero` and can filter the listing, but no booking flow picker exists yet (PR-B) and `getRoomToken` is unchanged (the modality gate lands in PR-B).

**Base branch**: `main`. PR-A merges to `main` first; PR-B branches off `main` after PR-A lands.

**Status**: 📋 PENDING (not yet applied).

### Group 1: Database migration

#### Task PR-A.1: Generate Drizzle migration + post-edit to 4-statement shape

- **Type**: code (CREATE)
- **Files**:
  - MODIFY `src/infrastructure/db/schema/citas.ts` (+3 lines: add `modalidad: varchar("modalidad", { length: 20 }).notNull().default("PRESENCIAL")` inside the existing `pgTable` call, placed after the existing `estado` column)
  - MODIFY `src/infrastructure/db/schema/doctores.ts` (+2 lines: add `aceptaOnline: boolean("acepta_online").notNull().default(false)` inside the existing `pgTable` call, mirrors the existing `verificado` pattern on the same table)
  - CREATE `src/infrastructure/db/migrations/0004_<hash>.sql` (~10 lines, post-edited to the 4-statement shape)
- **Spec**: REQ-DB-MOD-1, REQ-DB-MOD-2, REQ-DB-MOD-3
- **LOC est.**: 15 lines (5 schema + 10 migration)
- **Verify**: `pnpm drizzle-kit generate` produces a single `0004_*.sql` file; post-edit the file to enforce the 4-statement shape (D1 / D2 / D3); `pnpm db:migrate` applies forward and back without errors; `pnpm tsc --noEmit` clean; existing 5 columns on `doctores` and existing columns on `citas` are untouched.
- **Commit shape**: 1 commit "feat(db): add modality and acepta_online columns with backfill-and-drop-default migration"
- **Notes**: The post-edit is non-negotiable. Drizzle Kit's default output combines the two `ALTER TABLE` statements per table; the apply phase MUST enforce the documented 4-statement shape so the schema enforces explicit writes at runtime (per D3 / REQ-DB-MOD-3). The DOWN step is `DROP COLUMN` × 2 (reverses the 4 forward statements in reverse order). The `DROP DEFAULT` is implicitly reversed by `DROP COLUMN`. No indexes (modalidad filtering is a low-cardinality lookup on a small table; per the design rationale, no per-cita index is added in MVP).

### Group 2: Domain entities

#### Task PR-A.2: Domain entities + enums + entity tests

- **Type**: code (MODIFY + CREATE)
- **Files**:
  - MODIFY `src/domain/enums/index.ts` (+8 lines: add `ConsultaModalidad` enum with `PRESENCIAL` and `ONLINE` values, follows the existing `UserRole` / `ConsultationStatus` pattern with `enum { FOO = "FOO" }`)
  - MODIFY `src/domain/entities/cita.ts` (+15 lines: add `modalidad: ConsultaModalidad` to the private constructor as the 9th arg, add `modalidad?: ConsultaModalidad` to the `create()` factory as an optional arg with a runtime guard, preserve `modalidad` across `withEstado()`)
  - MODIFY `src/domain/entities/doctor.ts` (+8 lines: add `aceptaOnline: boolean` to the private constructor as the 14th arg, add `aceptaOnline?: boolean` to the `create()` factory as an optional arg, default to `false`)
  - MODIFY `src/domain/entities/__tests__/cita.test.ts` (+35 lines: 4 scenarios — default `PRESENCIAL` when omitted, override with `ONLINE`, invalid value rejected with the runtime guard, modality preserved across `withEstado` transitions)
  - MODIFY `src/domain/entities/__tests__/doctor.test.ts` (+30 lines: 3 scenarios — default `false` when omitted, accepts `true`, accepts `false` explicitly)
- **Spec**: REQ-DE-MOD-1, REQ-DE-MOD-2, REQ-DE-MOD-3
- **LOC est.**: 96 lines (31 code + 65 tests)
- **Verify**: `pnpm test:run src/domain/entities/__tests__/cita.test.ts src/domain/entities/__tests__/doctor.test.ts`; `pnpm tsc --noEmit` clean; the existing 7+ entity tests still pass.
- **Commit shape**: 1 commit "feat(domain): add modality enum and entity fields with backwards-compatible defaults"
- **Notes**: The `Cita.create()` factory default of `PRESENCIAL` preserves backwards compatibility with pre-change call sites that do not pass a modality (existing fixtures keep compiling). The runtime guard on the optional `modalidad` argument rejects an invalid value with `Error("Invalid modalidad: must be PRESENCIAL or ONLINE")` — a defensive layer on top of the TS type. `withEstado()` is updated to preserve `modalidad` across status transitions (a cita that goes `PENDIENTE → CONFIRMADA → EN_CURSO` keeps its modality unchanged — modality is a per-cita property, not a per-status property).

### Group 3: Use case + audit

#### Task PR-A.3: updateAcceptsOnlineUseCase + AuditAction union extension

- **Type**: code (MODIFY + CREATE)
- **Files**:
  - MODIFY `src/application/use-cases/audit/write-audit-log.use-case.ts` (+1 line: append `| "DOCTOR_ACEPTA_ONLINE_CHANGED"` as the last variant of the `AuditAction` union; preserve all 9 prior variants in the original order)
  - CREATE `src/application/use-cases/profiles/update-accepts-online.use-case.ts` (~55 lines: `updateAcceptsOnlineUseCase` mirrors the `updateProfileUseCase` shape — UPDATE `doctores SET acepta_online = ?` + `audit_logs` insert in the SAME `db.transaction`, returns `{ id, aceptaOnline }`, throws `NOT_FOUND` if the doctor row does not exist, throws `INTERNAL_SERVER_ERROR` if the audit write fails so the transaction rolls back)
  - MODIFY `src/application/index.ts` (+5 lines: re-export `updateAcceptsOnlineUseCase` + `UpdateAcceptsOnlineInput` / `UpdateAcceptsOnlineOutput` types from the new file, append after the existing profiles re-exports)
  - CREATE `src/application/use-cases/profiles/__tests__/update-accepts-online.test.ts` (~95 lines: 5 scenarios — toggle ON writes audit row, toggle OFF writes audit row, NOT_FOUND when doctor does not exist, audit failure rolls back the transaction, returns `{ id, aceptaOnline }` shape)
- **Spec**: REQ-BA-MOD-4 (the procedure spec lives in `booking-api/spec.md` because it gates the booking flow, but the use case itself is a profile concern; both names match the design)
- **LOC est.**: 156 lines (61 code + 95 tests)
- **Verify**: `pnpm test:run src/application/use-cases/profiles/__tests__/update-accepts-online.test.ts`; `pnpm tsc --noEmit` clean; mock the Drizzle query chain with `vi.fn()` returning canned rows; assert the audit row is written with `accion: "DOCTOR_ACEPTA_ONLINE_CHANGED"` and `detalles: { aceptaOnline: boolean }`.
- **Commit shape**: 1 commit "feat(audit): add updateAcceptsOnline use case with atomic toggle-and-audit transaction"
- **Notes**: The UPDATE and the audit log write are inside the same `db.transaction` (per D9 / REQ-PA-MOD-3) so a partial write cannot leave the toggle flipped without an audit row. The use case does NOT re-check the doctor role — the procedure layer enforces `protectedProcedure` + `session.user.rol === 'DOCTOR'`. The `db` parameter is typed as `NodePgDatabase<typeof schema>` and cast `as never` at the procedure call site (matches the existing `bookings.ts` pattern).

### Group 4: tRPC procedures

#### Task PR-A.4: profiles.updateAcceptsOnline + listDoctorProfiles filter + getDoctorProfile/FullProfile aceptaOnline field

- **Type**: code (MODIFY + CREATE)
- **Files**:
  - MODIFY `src/infrastructure/api/routers/profiles.ts` (+50 lines: add `updateAcceptsOnline` mutation as `protectedProcedure.input(z.object({ aceptaOnline: z.boolean() })).mutation(...)` — DOCTOR-only role check inside the procedure, resolves the doctor record from `session.user.id`, calls `updateAcceptsOnlineUseCase(db as never, { doctorId, aceptaOnline, actorId, ipAddress })`; add `aceptaOnline` to the `getDoctorProfile` response; add `aceptaOnline: z.boolean().optional()` filter to the `listDoctorProfiles` input + `WHERE doctores.acepta_online = ?` clause when set; the `getDoctorFullProfile` procedure body is unchanged — the field flows through via the use case)
  - MODIFY `src/application/use-cases/profiles/get-doctor-full-profile.use-case.ts` (+3 lines: add `aceptaOnline: schema.doctores.aceptaOnline` to the doctor projection in `get-doctor-full-profile.use-case.ts`)
  - MODIFY `src/infrastructure/profiles/schemas.ts` (+2 lines: add `aceptaOnline: boolean` to `DoctorFullProfileResponse`; the field is strict `boolean`, NOT optional — present for every successful response)
  - CREATE `src/infrastructure/api/routers/__tests__/profiles.updateAcceptsOnline.test.ts` (~80 lines: 4 scenarios — DOCTOR session writes audit + returns `{ id, aceptaOnline }`, PACIENTE session rejected with `FORBIDDEN`, anonymous session rejected with `UNAUTHORIZED`, doctor row not found returns `NOT_FOUND`)
  - MODIFY `src/infrastructure/api/routers/__tests__/profiles.listDoctorProfiles.test.ts` (+30 lines: 3 scenarios — `aceptaOnline: true` filter returns only opted-in, `aceptaOnline: false` filter returns only opted-out, undefined filter returns all doctors)
- **Spec**: REQ-PA-MOD-1 (getDoctorProfile field), REQ-PA-MOD-2 (getDoctorFullProfile field), REQ-PA-MOD-3 (listDoctorProfiles filter), REQ-BA-MOD-4 (updateAcceptsOnline)
- **LOC est.**: 165 lines (55 code + 110 tests)
- **Verify**: `pnpm test:run src/infrastructure/api/routers/__tests__/profiles.updateAcceptsOnline.test.ts src/infrastructure/api/routers/__tests__/profiles.listDoctorProfiles.test.ts`; `pnpm tsc --noEmit` clean; mirror the pattern in `src/infrastructure/api/routers/__tests__/profiles.test.ts` for `createCaller` + mocked `db` + mocked `writeAuditLogUseCase` via `vi.mock("@/application")`; the existing 5+ profiles router tests pass untouched.
- **Commit shape**: 1 commit "feat(api): add updateAcceptsOnline mutation and aceptaOnline filter on doctor listing"
- **Notes**: The `listDoctorProfiles` filter is applied as a `WHERE doctores.acepta_online = true|false` clause in the SQL (NOT an in-memory post-filter), so the response size matches the filter. The filter is combinable with the existing `especialidad` filter (additive). The `undefined` case returns all doctors (pre-change behavior, unchanged). The `getDoctorProfile` procedure adds the `aceptaOnline: doctorRow.aceptaOnline` line in the result object — single-line addition mirroring the existing `precioConsulta` / `calificacionMedia` shape.

### Group 5: Doctor UI

#### Task PR-A.5: DoctorHero "Disponible online" badge + /configuracion "Modalidad de consulta" card

- **Type**: code (MODIFY + CREATE)
- **Files**:
  - MODIFY `src/components/profiles/DoctorHero.tsx` (+15 lines: add `aceptaOnline?: boolean` to the props interface, import `Video` from `lucide-react`, render the "Disponible online" `<Badge>` with the `Video` icon STRICTLY when `aceptaOnline === true` — the check is `=== true`, NOT truthy, so a doctor with `aceptaOnline: undefined` does NOT render the badge; the badge is placed next to the existing rating badge in the right column; the `tel:` "Llamar" button on line ~152 is UNCHANGED per AD-8 / R10)
  - CREATE `src/components/profiles/__tests__/DoctorHero.test.tsx` (~90 lines: 5 scenarios — badge shows when `aceptaOnline === true`, hidden when `false`, hidden when `undefined` (defensive), `tel:` button still visible when `aceptaOnline === true` and `telefonoConsulta` is set, badge is in the same row as the rating badge)
  - MODIFY `src/app/configuracion/page.tsx` (+80 lines: append a new `<Card>` titled "Modalidad de consulta" to the existing "Preferencias" card; the card is DOCTOR-only via `profile?.rol === "DOCTOR"`; contains a single shadcn `<Switch>` labelled "Acepto consultas online" with a help text "Aceptar consultas online habilita la opción de videollamada en el perfil público y en la agenda de los pacientes."; wire to `api.profiles.updateAcceptsOnline.useMutation()` with `onSuccess` invalidating `getMyProfile` and `onError` showing a sonner toast; the switch is disabled while the mutation is pending; loading state shows a `<Skeleton className="h-6 w-11" />`; error state shows an `<Alert variant="destructive">`)
  - CREATE `src/app/configuracion/__tests__/ModalityToggle.test.tsx` (~100 lines: 5 scenarios — DOCTOR session renders the card, PACIENTE session does NOT render the card, loading shows Skeleton, error shows Alert, click triggers `updateAcceptsOnline.mutate` with the new value, error in mutation shows sonner toast)
- **Spec**: REQ-PU-MOD-1 (DoctorHero badge), REQ-DS-MOD-1 (configuracion card presence), REQ-DS-MOD-2 (configuracion card optimistic update + error handling), REQ-DS-MOD-3 (configuracion audit log side-effect)
- **LOC est.**: 285 lines (95 code + 190 tests)
- **Verify**: `pnpm test:run src/components/profiles/__tests__/DoctorHero.test.tsx src/app/configuracion/__tests__/ModalityToggle.test.tsx`; `pnpm tsc --noEmit` clean; `pnpm lint` clean; the existing `DoctorHero` tests (if any) pass untouched; the existing `configuracion/page.tsx` "Account info" + "Tema" rows are unchanged.
- **Commit shape**: 1 commit "feat(ui): add DoctorHero 'Disponible online' badge and /configuracion modality toggle card"
- **Notes**: The `configuracion/page.tsx` change is DOCTOR-only via the `{isDoctor && (...)}` JSX guard; the rest of the page is untouched. The Switch re-reads its value from `getMyProfile.useQuery()` (NOT local state), so a failed mutation reverts to the server-side value on the next render (the cache was not invalidated on error). The audit log is written in the use case, not the procedure — the test asserts the audit call happens at the use case layer (via `vi.mock("@/application")`).

### Group 6: Public listing filter

#### Task PR-A.6: /doctores "Disponible online" filter pill

- **Type**: code (MODIFY + CREATE)
- **Files**:
  - MODIFY `src/app/doctores/page.tsx` (+50 lines: import `useRouter` and `useSearchParams` from `next/navigation`, read `?aceptaOnline=true` from the URL via `useSearchParams().get("aceptaOnline") === "true"`, pass `aceptaOnline: true` to `listDoctorProfiles` when the param is set, render a clickable `<button>` pill next to the existing search form with `aria-pressed={aceptaOnlineFilter}` and variant="default" when active / `border-input bg-background` when inactive; the pill toggles the URL via `router.replace(/doctores?aceptaOnline=true)` — preserves other search params)
  - CREATE `src/app/doctores/__tests__/page.test.tsx` (~95 lines: 5 scenarios — pill inactive state calls `listDoctorProfiles` without `aceptaOnline`, URL with `?aceptaOnline=true` renders active pill and calls with `aceptaOnline: true`, clicking inactive pill calls `router.replace` with `?aceptaOnline=true`, clicking active pill removes the param, other search params are preserved on toggle)
- **Spec**: REQ-PU-MOD-2
- **LOC est.**: 145 lines (50 code + 95 tests)
- **Verify**: `pnpm test:run src/app/doctores/__tests__/page.test.tsx`; `pnpm tsc --noEmit` clean; `pnpm lint` clean; the existing search form and the existing grid layout are untouched; the pill is the LAST element of the search row (placed after the "Buscar" button).
- **Commit shape**: 1 commit "feat(ui): add 'Disponible online' filter pill on /doctores with URL-driven state"
- **Notes**: The URL is the source of truth (per D11 / AD-9). A page reload (paste `?aceptaOnline=true`) renders the pill in the active state and applies the filter on first paint. The pill is a `<button>` with `aria-pressed`, NOT a checkbox; the visual treatment mirrors the "badge as a button" pattern used by the rating badge on `DoctorCard`. The `useQuery` for `listDoctorProfiles` re-runs on URL change via tRPC's standard query invalidation.

### Group 7: Verify

#### Task PR-A.7: PR-A verify (test + tsc + curl)

- **Type**: verify
- **Files**:
  - (no file changes)
  - CREATE `openspec/specs/doctor-settings-ui/spec.md` (new spec, ~150 lines, scoped to MVP — the toggle, the help text, the optimistic update, the audit log side-effect, the loading and error states; carried over from the spec phase; this task attaches the file to the PR for visibility even though the spec was already created in `sdd-spec`)
- **Spec**: REQ-DS-MOD-1, REQ-DS-MOD-2, REQ-DS-MOD-3
- **LOC est.**: 0 lines (verification only)
- **Verify**: `pnpm test:run` (all green; the 8 new test files / 27+ scenarios from §12.1 of the design pass; the 4 prior video-calls tests still pass; no regressions); `pnpm tsc --noEmit` (clean — the `ConsultaModalidad` enum + `Cita.modalidad` + `Doctor.aceptaOnline` flow through the type system); `pnpm lint` (clean); `pnpm db:migrate` applies the `0004` migration forward and back; `curl -sS 'http://localhost:3000/api/trpc/profiles.listDoctorProfiles?input={"aceptaOnline":true}'` returns the filtered set; `curl -sS -X POST 'http://localhost:3000/api/trpc/profiles.updateAcceptsOnline' -H 'Content-Type: application/json' --cookie-jar /tmp/c.txt` against a DOCTOR session flips the toggle and writes the audit row.
- **Commit shape**: no commit (verification gate)
- **Notes**: This is the final pre-merge gate. The PR-A PR description MUST include: a "How to verify" section with the `curl` commands above; a "Risk notes" section pointing to R1 (migration atomicity), R8 (audit log volume), R10 (`tel:` footgun — not addressed in PR-A, follow-up `doctor-hero-cleanup`), R11 (existing ONLINE citas unaffected by toggle-off per OQ3=a). The PR is ready to merge to `main` when all four verification commands exit 0.

**PR-A subtotal: ~570 lines** (within the 800-line user budget, +170 over the canonical 400-line cap — soft exception documented above).

---

## PR-B — Booking flow + JoinCallButton + getRoomToken

**Goal**: Land the patient-side booking flow modality picker (`/doctores/[id]/agendar`), the modality badge on the cita detail page (`/citas/[id]`), the `JoinCallButton` modality prop + hard gate for `PRESENCIAL`, and the `getRoomToken` use case's modality gate (rejects `PRESENCIAL` with `FORBIDDEN`). After PR-B, a patient can book an online cita with a doctor who has opted in, the `JoinCallButton` is hidden for presencial citas regardless of status, and `getRoomToken` is the security boundary for the call surface.

**Base branch**: `main` (after PR-A merges). PR-B is stacked on PR-A.

**Status**: 📋 PENDING (not yet applied).

### Group 1: createAppointment use case

#### Task PR-B.1: createAppointmentUseCase modality input + D5 gate + TOCTOU window test

- **Type**: code (MODIFY)
- **Files**:
  - MODIFY `src/application/use-cases/bookings/create-appointment.use-case.ts` (+20 lines: add `modalidad: ConsultaModalidad` to the `CreateAppointmentInput` interface; inside the existing `db.transaction`, after the existing conflict + availability checks, add the new gate — `.select({ aceptaOnline: schema.doctores.aceptaOnline }).from(schema.doctores).where(eq(schema.doctores.id, doctorId)).limit(1)`; if `input.modalidad === ConsultaModalidad.ONLINE && !doctor?.aceptaOnline`, throw `TRPCError({ code: "BAD_REQUEST", message: "El doctor no ofrece consultas online" })`; pass `modalidad: input.modalidad` to the INSERT into `citas`)
  - MODIFY `src/application/use-cases/bookings/__tests__/create-appointment.test.ts` (+80 lines: 4 new scenarios — `ONLINE` rejected when `doctor.aceptaOnline === false` with `BAD_REQUEST "El doctor no ofrece consultas online"`, `ONLINE` accepted when `doctor.aceptaOnline === true`, `PRESENCIAL` always accepted regardless of `doctor.aceptaOnline`, `TOCTOU` window: doctor toggles to `false` mid-transaction and the second `findFirst` mock returns the new value, ONLINE booking is rejected, no Cita is inserted; the existing 5+ scenarios continue to pass)
- **Spec**: REQ-BA-MOD-1, REQ-BA-MOD-2
- **LOC est.**: 100 lines (20 code + 80 tests)
- **Verify**: `pnpm test:run src/application/use-cases/bookings/__tests__/create-appointment.test.ts`; `pnpm tsc --noEmit` clean; the in-transaction `select({ aceptaOnline: true })` is a narrow projection (NOT a `SELECT *`) so it adds one extra query inside the transaction; the use case pattern `useCase(db as never, input)` matches the existing `bookings.ts` procedures.
- **Commit shape**: 1 commit "feat(bookings): add modalidad input and aceptaOnline gate to createAppointment use case"
- **Notes**: The gate runs INSIDE the same `db.transaction` as the cita insert (per AD-13), closing the TOCTOU window: a doctor who toggles `aceptaOnline` to `false` between the patient's "Confirmar" click and the mutation is caught because the in-transaction read sees the new `false` value. Server-side enforcement is the only enforcement that matters (a determined patient can mutate the React state to enable the Online button in the UI; the gate is the security boundary). The TOCTOU test fixtures the second `findFirst` mock to return `{ aceptaOnline: false }` — proves the in-transaction read closes the window. Existing test scenarios that pass `modalidad` as `PRESENCIAL` MUST continue to pass (backwards compatibility, no breaking signature change for pre-PR-B call sites that hardcode `PRESENCIAL`).

### Group 2: getRoomToken use case

#### Task PR-B.2: getRoomTokenUseCase D6 modality gate + D13 regression test

- **Type**: code (MODIFY)
- **Files**:
  - MODIFY `src/application/use-cases/bookings/get-room-token.use-case.ts` (+12 lines: add `modalidad: schema.citas.modalidad` to the existing SELECT projection (one new column, no extra query); after the existing authorization + status + time-window gate, add the new modality gate — `if (row.modalidad === ConsultaModalidad.PRESENCIAL) throw TRPCError({ code: "FORBIDDEN", message: "Esta cita es presencial, no permite videollamada" })`; the gate order is: (1) auth/existence NOT_FOUND, (2) status/time FORBIDDEN, (3) modality FORBIDDEN; existing token issuance + the existing audit call in the procedure are unchanged)
  - MODIFY `src/application/use-cases/bookings/__tests__/get-room-token.test.ts` (+60 lines: 4 new scenarios per D13 — `PRESENCIAL` cita rejected with `FORBIDDEN "Esta cita es presencial, no permite videollamada"`, `ONLINE` cita within the window still receives a token (D13 regression guard — re-runs the pre-existing happy-path scenario to prove the new gate does not over-eagerly reject), `PRESENCIAL` + `EN_CURSO` still rejected with the modality message (status gate passes for `EN_CURSO` because the time check is bypassed; modality gate then runs and throws), `PRESENCIAL` + `CONFIRMADA` outside the time window gets the time-window message (gate order proves: status/time throws first, modality never reached); the existing 8+ scenarios continue to pass)
- **Spec**: REQ-VA-MOD-1, D13 regression guard
- **LOC est.**: 72 lines (12 code + 60 tests)
- **Verify**: `pnpm test:run src/application/use-cases/bookings/__tests__/get-room-token.test.ts`; `pnpm tsc --noEmit` clean; mock `livekitServerClient.createRoomToken` via the existing `vi.mock` pattern in `get-room-token.test.ts`; assert the error messages are distinct between the time-window gate and the modality gate (a regression that conflates the two messages fails the test).
- **Commit shape**: 1 commit "feat(video-calls): add modality gate to getRoomToken use case with D13 regression guard"
- **Notes**: The modality gate is the LAST gate before token issuance. A `PRESENCIAL` cita outside the time window still gets the time-window message (per R2 / D6). A `PRESENCIAL` cita in `EN_CURSO` gets the modality message (status gate passes for `EN_CURSO` because the time check is bypassed; modality gate then runs and throws). The `getRoomToken` procedure wire surface (input: `{ citaId }`, output: `{ token, serverUrl, roomName }`) is unchanged — the gate is internal to the use case (D6).

### Group 3: tRPC input/output

#### Task PR-B.3: createAppointment zod input + getMyAppointments response shape + procedure pass-through

- **Type**: code (MODIFY)
- **Files**:
  - MODIFY `src/infrastructure/booking/schemas.ts` (+5 lines: import `ConsultaModalidad`, add `modalidad: z.nativeEnum(ConsultaModalidad, { errorMap: () => ({ message: "Modalidad inválida: debe ser PRESENCIAL u ONLINE" }) })` to `createAppointmentSchema`; the new field is REQUIRED)
  - MODIFY `src/infrastructure/api/routers/bookings.ts` (+1 line: pass `modalidad` from the procedure input to the use case; the existing line `createAppointmentUseCase(ctx.db as never, { doctorId: input.doctorId, fechaHora: ..., motivoConsulta: ... })` is extended to `createAppointmentUseCase(ctx.db as never, { doctorId: input.doctorId, fechaHora: ..., motivoConsulta: ..., modalidad: input.modalidad })`)
  - MODIFY `src/infrastructure/api/routers/__tests__/bookings.createAppointment.test.ts` (+30 lines: 3 new scenarios — accepts `PRESENCIAL`, accepts `ONLINE` when `aceptaOnline === true`, rejects invalid `modalidad` value with `BAD_REQUEST` BEFORE the use case is invoked; the existing 5+ scenarios continue to pass; pre-PR-B test fixtures that pass the `modalidad: "PRESENCIAL"` argument explicitly continue to pass; pre-existing tests that omit `modalidad` MUST be updated to include it as the schema is now strict)
  - MODIFY `src/infrastructure/api/routers/__tests__/bookings.getRoomToken.test.ts` (+30 lines: 1 new scenario — `PRESENCIAL` cita → `FORBIDDEN "Esta cita es presencial, no permite videollamada"` at the procedure level; the existing 5+ scenarios continue to pass; the `ONLINE` happy-path scenario is re-asserted (D13 regression guard at the procedure level))
- **Spec**: REQ-BA-MOD-1, REQ-BA-MOD-2, REQ-BA-MOD-3 (getMyAppointments), REQ-VA-MOD-1
- **LOC est.**: 66 lines (6 code + 60 tests)
- **Verify**: `pnpm test:run src/infrastructure/api/routers/__tests__/bookings.createAppointment.test.ts src/infrastructure/api/routers/__tests__/bookings.getRoomToken.test.ts`; `pnpm tsc --noEmit` clean; the Zod validation rejects an invalid `modalidad` value with `BAD_REQUEST` BEFORE the use case is invoked (a bad modality MUST NOT cost a DB round-trip); the `getMyAppointments` response shape gains a top-level `modalidad: ConsultaModalidad` field automatically (the column is added to the table, the Drizzle `select()` returns it, the use case maps it through — the router code is unchanged).
- **Commit shape**: 1 commit "feat(api): wire modalidad through createAppointment schema and pass through to use case"
- **Notes**: The `getMyAppointments` response shape extension is automatic (no router code change) — the use case's `select()` returns the new column, the response type is inferred. The Zod error message is in Spanish to match the existing `createAppointmentSchema` error messages. Pre-PR-B test fixtures that pass a `modalidad: "PRESENCIAL"` argument explicitly continue to pass; pre-existing tests that omit `modalidad` MUST be updated to include it as the schema is now strict (this is a one-line edit per test file).

### Group 4: Booking page UI

#### Task PR-B.4: ModalityPicker component + /doctores/[id]/agendar modality step

- **Type**: code (MODIFY + CREATE)
- **Files**:
  - CREATE `src/components/booking/ModalityPicker.tsx` (~55 lines: two-button toggle component with `role="radiogroup"`, two `<button role="radio">` children; props `{ value, onChange, onlineDisabled }`; the Online button is `disabled={onlineDisabled}` and carries a `title="Este doctor no ofrece consultas online"` tooltip when disabled; the Presencial button is always enabled; selected state uses `border-primary bg-primary/5`; uses `Video` and `MapPin` icons from `lucide-react`; client component with `"use client"`)
  - MODIFY `src/app/doctores/[id]/agendar/page.tsx` (+90 lines: add `useState` for `selectedSlot`, `modalidad`, `motivo`; render the `<ModalityPicker>` AFTER the `SlotGrid` `onSlotSelect` callback fires, BEFORE the motivo textarea; the motivo textarea is moved below the picker; the existing `createAppointment` mutation call is extended to include `modalidad: input.modalidad`; the "Confirmar reserva" button is enabled iff `selectedSlot !== undefined && modalidad !== undefined && motivo.trim().length > 0 && !bookingMutation.isPending`; on success, `router.push(/citas/${id})` is unchanged; on error, a sonner toast with the message is shown; the `onlineDisabled` prop is computed from `doctor.aceptaOnline === false` sourced from `getDoctorFullProfile.useQuery()`)
  - MODIFY `src/components/booking/SlotGrid.tsx` (small refactor: the `onSlotSelect` callback now receives the slot only — the page owns the modality + motivo state; the motivo textarea is REMOVED from `SlotGrid` and lives in the page below the picker)
  - CREATE `src/components/booking/__tests__/ModalityPicker.test.tsx` (~80 lines: 5 scenarios — both options clickable when `onlineDisabled === false`, Online disabled with `title` tooltip "Este doctor no ofrece consultas online" when `onlineDisabled === true`, selecting Presencial calls `onChange("PRESENCIAL")`, selecting Online when disabled does NOT call `onChange`, `aria-checked` reflects `value`)
- **Spec**: REQ-BU-MOD-1
- **LOC est.**: 225 lines (145 code + 80 tests)
- **Verify**: `pnpm test:run src/components/booking/__tests__/ModalityPicker.test.tsx`; `pnpm tsc --noEmit` clean; `pnpm lint` clean; the existing `SlotGrid` tests are extended (not rewritten) to cover the new `onSlotSelect(slot)` shape (the old `onSlotSelect(slot, motivo)` callback may be removed entirely from the existing test if it was the only caller; verify with a `grep`); the new `<ModalityPicker>` is exported from `src/components/booking/index.ts` barrel.
- **Commit shape**: 1 commit "feat(ui): add ModalityPicker to booking flow between slot pick and motivo consulta"
- **Notes**: The `SlotGrid` refactor is additive (a new prop, a new substep, no removal of the slot-grid core behavior per R7). The page state grows from a flat 3-field state to a flat 4-field state (per design §9.2). The `canConfirm` boolean is documented in the design's §9.4; the button is bound to `!canConfirm`. The "Confirmar reserva" button is the existing shadcn `<Button>` with `disabled={!canConfirm}` (no new primitive). The `onlineDisabled` prop is computed from `getDoctorFullProfile.useQuery()` data — a stale query (toggle on then off) does NOT affect the server-side gate; the server is the security boundary.

### Group 5: Cita detail page UI

#### Task PR-B.5: /citas/[id] modality badge + JoinCallButton modality prop wire

- **Type**: code (MODIFY)
- **Files**:
  - MODIFY `src/app/citas/[id]/page.tsx` (+12 lines: render a small `<Badge variant="outline">` next to the existing `<StatusBadge>` in the page header (line ~239) — text is exactly `"Presencial"` or `"Online"`, no icon, no `StatusBadge` variant; pass `modalidad={cita.modalidad}` to BOTH `<JoinCallButton>` instances — the doctor view (line ~290) and the patient view (line ~381); the rest of the page is unchanged)
- **Spec**: REQ-BU-MOD-2, REQ-VU-MOD-1
- **LOC est.**: 12 lines
- **Verify**: `pnpm tsc --noEmit` clean (the `modalidad` prop is now REQUIRED on `JoinCallButton`, so omitting it is a compile error — this is the regression guard for PR-B); `pnpm lint` clean; the existing detail page tests pass; the page renders the badge for every cita regardless of `estado` (per the spec, the modality badge does not depend on `estado`).
- **Commit shape**: bundled with Task PR-B.6 (JoinCallButton modality prop + tests are tightly coupled to the cita detail wire)
- **Notes**: The badge text is exactly `"Presencial"` or `"Online"` (Spanish, no icon). The existing `<StatusBadge>` is unchanged. The JoinCallButton's `modalidad` prop is REQUIRED, NOT optional — a missing prop is a TypeScript compile error, NOT a runtime fallback (per D7 / AD-7).

### Group 6: JoinCallButton

#### Task PR-B.6: JoinCallButton modality prop + PRESENCIAL hard gate + 5 new test scenarios

- **Type**: code (MODIFY)
- **Files**:
  - MODIFY `src/components/booking/JoinCallButton.tsx` (+5 lines: add `modalidad: ConsultaModalidad` to the props interface as REQUIRED; add the hard gate at the TOP of the component — `if (props.modalidad === ConsultaModalidad.PRESENCIAL) return null;` runs BEFORE the status / time-window check; the existing visibility logic (`EN_CURSO` or `CONFIRMADA` + within ±15min) is unchanged below the modality gate; the rest of the component body — the click handler, the `Video` icon, the label — is unchanged)
  - MODIFY `src/components/booking/__tests__/JoinCallButton.test.tsx` (+60 lines: 5 new scenarios — `modalidad: "PRESENCIAL"` returns `null` regardless of `estado` (idempotent — test for all 5 estados), `modalidad: "ONLINE"` + `estado: "EN_CURSO"` renders the button, `modalidad: "ONLINE"` + `estado: "CONFIRMADA"` +5min renders the button, `modalidad: "ONLINE"` + `estado: "CONFIRMADA"` +30min hides the button, `modalidad: "ONLINE"` + `estado: "PENDIENTE"` hides the button, `modalidad: "ONLINE"` + `estado: "EN_CURSO"` with `modalidad: "PRESENCIAL"` hides the button (modality gate runs first, even when the status gate would pass); the existing 7+ scenarios continue to pass; assert `queryByRole("button")` returns `null` for the hidden scenarios — no DOM residue)
- **Spec**: REQ-VU-MOD-1
- **LOC est.**: 65 lines (5 code + 60 tests)
- **Verify**: `pnpm test:run src/components/booking/__tests__/JoinCallButton.test.tsx`; `pnpm tsc --noEmit` clean (the REQUIRED `modalidad` prop is the compile-time regression guard — every call site MUST pass it; the cita detail page from Task PR-B.5 is updated to pass it in both the doctor and patient views); `pnpm lint` clean.
- **Commit shape**: 1 commit "feat(ui): add modality prop to JoinCallButton with PRESENCIAL hard gate"
- **Notes**: The hard gate runs FIRST, before the status / time-window check. The visibility state machine is extended from 3 states to 4 (a new `HIDDEN_MODALITY` state — see design §8). Returning `null` for PRESENCIAL is the cleanest expression of "this UI does not apply" (per D7 / AD-7). A disabled button with a tooltip is explicitly rejected. The `Video` icon and the label `"Unirse a la videollamada"` are unchanged.

### Group 7: Verify

#### Task PR-B.7: PR-B verify (test + tsc + manual booking smoke)

- **Type**: verify
- **Files**:
  - (no file changes)
  - CREATE / MODIFY: 4 delta spec files (already created in the spec phase — `booking-api`, `booking-ui`, `video-calls-api`, `video-calls-ui` — visible in the PR-B PR description for traceability)
- **Spec**: REQ-BA-MOD-1, REQ-BA-MOD-2, REQ-BA-MOD-3, REQ-VA-MOD-1, REQ-BU-MOD-1, REQ-BU-MOD-2, REQ-VU-MOD-1
- **LOC est.**: 0 lines (verification only)
- **Verify**: `pnpm test:run` (all green — the 6 new test files / 16+ scenarios from §12.2 of the design pass; the 8 prior PR-A tests still pass; no regressions in the video-calls change's existing tests); `pnpm tsc --noEmit` clean; `pnpm lint` clean; `pnpm build` succeeds; **manual booking smoke test** with `doctor.aceptaOnline: true` — open `/doctores/<id>/agendar` in a browser, pick a slot, verify the Online option is enabled, pick Online, write a motivo, click "Confirmar reserva", verify the cita lands on `/citas/<id>` with the modality badge "Online"; **manual `getRoomToken` smoke test** — open the cita as the patient, verify the `JoinCallButton` is visible within ±15min of `fechaHora`, click it, verify the call page mounts; then set `doctor.aceptaOnline: false` via `/configuracion`, book a new cita, verify the "Confirmar reserva" flow rejects `ONLINE` with a sonner toast and accepts `PRESENCIAL`.
- **Commit shape**: no commit (verification gate)
- **Notes**: This is the final pre-merge gate. The PR-B PR description MUST include: a "How to verify" section with the manual smoke test steps above; a "Risk notes" section pointing to R3 (TOCTOU window — closed by the in-transaction read), R6 (modality error message is distinct), R7 (SlotGrid refactor is additive), R9 (DOCTOR-only role check in the procedure). The PR is ready to merge to `main` when all verification commands exit 0 and the manual smoke tests pass.

**PR-B subtotal: ~445 lines** (within the 800-line user budget, +45 over the canonical 400-line cap — soft exception documented above).

---

## Cross-PR verification

After PR-B merges to `main`, run the final cross-PR gate (the union of PR-A.7 + PR-B.7):

1. `pnpm test:run` — all tests green (14+ new test files, 43+ new scenarios, 0 regressions in the video-calls or earlier changes).
2. `pnpm tsc --noEmit` — clean.
3. `pnpm lint` — clean.
4. `pnpm build` — succeeds (Next.js production build).
5. **Full booking flow smoke test** (browser): doctor toggles `aceptaOnline: true` via `/configuracion` → patient sees the "Disponible online" badge on `DoctorHero` and on `/doctores` listing → patient books an online cita via `/doctores/<id>/agendar` → cita lands on `/citas/<id>` with the modality badge "Online" → within ±15min, patient sees `JoinCallButton` → click → call page mounts → audit log entry for `CITA_ROOM_TOKEN_ISSUED` and `DOCTOR_ACEPTA_ONLINE_CHANGED` are both present in the database.
6. **PRESENCIAL rejection smoke test** (curl + browser): book a `PRESENCIAL` cita with the same doctor → `curl -X POST .../bookings.getRoomToken -d '{"citaId":"<id>"}'` returns `FORBIDDEN "Esta cita es presencial, no permite videollamada"`; `JoinCallButton` is hidden on `/citas/<id>`.
7. **TOCTOU smoke test** (manual): doctor opens `/configuracion` and toggles `aceptaOnline: true` → patient is on the booking flow with `modalidad: ONLINE` selected → doctor toggles `aceptaOnline: false` → patient clicks "Confirmar reserva" → sonner toast with "El doctor no ofrece consultas online" appears; no cita is created; patient can re-pick `PRESENCIAL` without losing the slot.

When all 7 gates pass, the change is ready for `sdd-archive` to sync the delta specs into `openspec/specs/`.

## Open dependencies

**None for the implementation.** All required changes are within this change. The video-calls change (`2026-06-16`, archived) is already merged and provides the `getRoomToken` procedure, the `JoinCallButton`, the audit union pattern, and the LiveKit wiring that this change reuses. No new third-party dependencies, no new env vars, no new Docker services, no new feature flags, no new i18n keys (per design Appendix A).

External (out of scope) follow-ups that BLOCK on this change:

- `doctor-modality-schedule` — per-day modality (blocked until this change ships, because the data model needs `citas.modalidad` to exist).
- `appointment-modality-edit` — post-creation modality change (blocked on this change + the `CITA_MODALIDAD_CHANGED` audit action that lands with it).
- `modality-pricing` — modality-aware pricing (blocked on this change).
- `doctor-hero-cleanup` — remove the `tel:` "Llamar" footgun on `DoctorHero` (the badge added here is the patient-side cue; the button removal is a separate doctor-level UX decision per AD-8 / R10).

## Out of scope reminders

The following items are explicitly NOT in this change (per the proposal's "Out of Scope" table and the design's §14). They are deferred to follow-up changes:

1. **Per-day modality for the doctor (OQ2)** — today's `doctorDisponibilidad.disponibilidad` is a single jsonb blob; per-day modality requires a schema change (per-day row or per-slot modality). MVP keeps modality at the doctor level. **Future change**: `doctor-modality-schedule`.
2. **Post-creation modality change (OQ4)** — no `CITA_MODALIDAD_CHANGED` audit action, no `updateAppointmentModality` procedure. If a doctor realizes a "presencial" cita should be "online" (or vice versa), the cita must be cancelled and re-booked. **Future change**: `appointment-modality-edit`.
3. **Modality-aware pricing (OQ3)** — `citas.precio` is set at creation from the doctor's `precioConsulta`. Different prices for online vs presencial would require a `doctor_servicios` extension (per-modality price) and a use-case change. **Future change**: `modality-pricing`.
4. **`tel:` button footgun on `DoctorHero` (R10)** — the `tel:` "Llamar" button stays even when `aceptaOnline === true` (per AD-8). The "Disponible online" badge added in PR-A gives patients a clear cue; full removal of the phone button is a doctor-level UX decision that needs design input. **Future change**: `doctor-hero-cleanup`.

The `sdd-apply` phase MUST NOT add any of the above. The `sdd-archive` report MUST call out R10 in the archive notes so the next reviewer scanning the diff sees it.

## Decisions made during planning

**None.** All 13 default decisions (D1-D13) and all 13 architecture decisions (AD-1..AD-13) from the proposal are honored verbatim. The PR split (2-PR chained, stacked-to-main) matches D10 / AD-10. The soft exception over the canonical 400-line cap is documented above and matches design §11.4 — no new decisions are made at the tasks phase; the design and proposal are the authoritative sources.

The 4 out-of-scope reminders above are reaffirmed from the proposal's "Out of Scope" table — no re-litigation at the tasks phase.

---

## Summary for the Orchestrator

**Tasks file**: `openspec/changes/2026-06-19-modality-toggle/tasks.md` (this file)
**Mode**: auto / 800-line budget
**Delivery**: chained PRs (`stacked-to-main`)
**Total estimated lines**: ~1,015 (PR-A 570 + PR-B 445)
**PR-A tasks**: 7 (Groups 1-7)
**PR-B tasks**: 7 (Groups 1-7)
**Total tasks**: 14
**Review workload forecast verdict**: Both PRs are under the user's cached 800-line D2 budget but over the canonical 400-line cap. The soft exception is documented (per design §11.4) and the 2-PR chain is honored for reviewer cognitive load, not line count alone.
**Decision needed before apply**: No
**Chain strategy**: `stacked-to-main`

**Next step**: `sdd-apply` — implement PR-A first (Tasks PR-A.1 through PR-A.7), then PR-B (Tasks PR-B.1 through PR-B.7). Each task is a reviewable work unit; the apply phase commits one task per work unit (per the `work-unit-commits` skill) with the commit shape documented above. The `sdd-verify` phase runs the cross-PR verification gates.
