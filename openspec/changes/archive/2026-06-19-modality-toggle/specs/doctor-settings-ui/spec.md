# Doctor Settings UI Specification

## Purpose

Define the doctor-facing preferences surface that lives under `/configuracion`. This spec covers the "Modalidad de consulta" card — a single toggle that lets a doctor opt in or out of online (video-call) consultations. The toggle is a business-rules control, not an identity edit, and it is intentionally scoped to MVP: one boolean, one help string, one optimistic update, one audit log side-effect. This is the doctor-side home for online-consultation preferences; follow-up changes MAY add more cards to the same page (notification toggles, calendar sync, language preferences) under separate specs, but THIS spec covers only the modality toggle.

## Requirements

### Requirement: REQ-DS-MOD-1 — Toggle Visibility

The system MUST render a new `<Card>` titled `"Modalidad de consulta"` inside the existing "Preferencias" section of `/configuracion` (`src/app/configuracion/page.tsx`). The card MUST be visible only to authenticated users whose role is `DOCTOR`. The card MUST contain a single shadcn `<Switch>` (or hand-rolled toggle if `<Switch>` is not yet installed) whose label MUST be exactly `"Acepto consultas online"`. The card MUST be appended to the existing Preferencias section (NOT a new page, NOT a new top-level tab) and MUST NOT remove, reorder, or hide any existing card or control on the page.

The switch MUST be wired to `api.profiles.getMyProfile.useQuery()` for the initial state (the existing `getMyProfile` procedure MUST be extended to include `doctor.aceptaOnline` — see `profiles-api/spec.md` REQ-PA-MOD-1) and `api.profiles.updateAcceptsOnline.useMutation()` for writes (the full procedure contract is in `booking-api/spec.md` REQ-BA-MOD-4). The card MUST render a Tailwind `<Skeleton>` placeholder for the switch while the initial query is in flight, MUST render an inline `<Alert variant="destructive">` if the query fails, and MUST NOT render the switch at all if the session role is not `DOCTOR` (the card section is omitted entirely for non-doctor sessions).

#### Scenario: Doctor sees the toggle on /configuracion

- GIVEN an authenticated user with `role === 'DOCTOR'`
- AND `getMyProfile` returns `doctor.aceptaOnline === false`
- WHEN the user navigates to `/configuracion`
- THEN a `<Card>` titled `"Modalidad de consulta"` MUST be in the DOM
- AND the card MUST contain a `<Switch>` with the label `"Acepto consultas online"`
- AND the switch MUST be in the unchecked state
- AND the card MUST appear inside the existing "Preferencias" section
- AND the existing "Tema" card and any other cards MUST remain visible and unchanged

#### Scenario: Non-doctor sessions do not see the toggle

- GIVEN an authenticated user with `role === 'PACIENTE'` (or `ADMIN`, `STAFF`, etc.)
- WHEN the user navigates to `/configuracion`
- THEN the "Modalidad de consulta" card MUST NOT be in the DOM
- AND the rest of the page MUST be rendered normally (the page is not role-gated as a whole)

#### Scenario: Loading state shows a skeleton

- GIVEN an authenticated DOCTOR on `/configuracion`
- WHEN `getMyProfile` is in flight
- THEN a skeleton placeholder MUST render in place of the switch
- AND no interactive switch MUST be clickable

#### Scenario: Query error shows an alert and hides the switch

- GIVEN an authenticated DOCTOR on `/configuracion`
- WHEN `getMyProfile` rejects (network or server error)
- THEN an `<Alert variant="destructive">` with the error message MUST be in the DOM inside the card
- AND the switch MUST NOT be rendered
- AND the rest of the page MUST remain visible

### Requirement: REQ-DS-MOD-2 — Default State, Toggle Behavior, and Audit Log

The switch's checked state MUST reflect `doctor.aceptaOnline` from the latest `getMyProfile` response. The default initial state, before the query resolves, MUST be `unchecked` (a doctor who has never toggled it MUST see the switch off; the underlying DB default is `false` — see `db-schema/spec.md` REQ-DB-MOD-2).

When the doctor clicks the switch, the UI MUST optimistically flip the switch to the new state, call `api.profiles.updateAcceptsOnline.mutate({ aceptaOnline: <newValue> })` (see `booking-api/spec.md` REQ-BA-MOD-4 for the procedure contract), and on success MUST keep the optimistic state (no revert). On error, the UI MUST revert the switch to the previous state and MUST show a sonner toast with the error message. The mutation MUST invalidate (or otherwise refresh) the `getMyProfile` query cache on success so the next page load reads the persisted value.

The switch MUST be disabled while the mutation is in flight (`isPending` from the tRPC mutation) so the doctor cannot fire two consecutive toggles. The disabled state MUST be a visual mute (Tailwind `disabled:opacity-50` or equivalent) — NOT a full `pointer-events: none` removal — so the doctor sees the switch is processing.

The successful toggle MUST write a single `audit_logs` row (the side-effect of the procedure — see `booking-api/spec.md` REQ-BA-MOD-4 for the audit row contract; this spec owns the user-observable behavior, that spec owns the wire contract). The `AuditAction` union MUST be extended with `"DOCTOR_ACEPTA_ONLINE_CHANGED"` (the union extension is documented in `booking-api/spec.md` REQ-BA-MOD-4 since the audit row is written inside the same transaction as the `doctores.acepta_online` UPDATE).

Toggling `aceptaOnline` MUST NOT mutate, cancel, or reassign any existing `citas` row. Pre-existing citas keep their `modalidad` value as set at creation. A doctor who toggles OFF after creating an ONLINE cita keeps that cita as ONLINE (the gate is on creation, not on read — see `booking-api/spec.md` REQ-BA-MOD-2). A doctor who toggles ON after creating only PRESENCIAL citas does NOT retroactively convert them. The UI MUST NOT display a warning, a list of affected citas, or a confirmation dialog on toggle — the audit log is the record.

#### Scenario: Default initial state is unchecked

- GIVEN a fresh DOCTOR account (never toggled the switch)
- WHEN `getMyProfile` resolves
- THEN `doctor.aceptaOnline` MUST be `false` (per the DB default)
- AND the switch MUST render in the unchecked state

#### Scenario: Doctor toggles online consultations ON

- GIVEN a DOCTOR on `/configuracion` with `aceptaOnline === false`
- WHEN the doctor clicks the switch
- THEN `api.profiles.updateAcceptsOnline` MUST be called with `{ aceptaOnline: true }`
- AND the switch MUST optimistically become checked
- AND on success the switch MUST remain checked
- AND `getMyProfile` MUST be invalidated so the next read returns `aceptaOnline === true`
- AND a single `audit_logs` row MUST be written with `accion: 'DOCTOR_ACEPTA_ONLINE_CHANGED'`, `entidadAfectada: 'doctores'`, `entidadId: <doctorId>`, `detalles: { aceptaOnline: true }`

#### Scenario: Doctor toggles online consultations OFF

- GIVEN a DOCTOR on `/configuracion` with `aceptaOnline === true`
- WHEN the doctor clicks the switch
- THEN `api.profiles.updateAcceptsOnline` MUST be called with `{ aceptaOnline: false }`
- AND the switch MUST optimistically become unchecked
- AND on success the switch MUST remain unchecked
- AND `getMyProfile` MUST be invalidated so the next read returns `aceptaOnline === false`
- AND a single `audit_logs` row MUST be written with `detalles: { aceptaOnline: false }`

#### Scenario: Mutation error reverts the switch and shows a toast

- GIVEN a DOCTOR who clicks the switch
- WHEN `updateAcceptsOnline` rejects
- THEN the switch MUST revert to the previous state
- AND a sonner toast MUST be displayed with the error message
- AND no `audit_logs` row MUST be written (the write failed end-to-end — the transaction rolled back, see `booking-api/spec.md` REQ-BA-MOD-4)

#### Scenario: Switch is disabled while mutation is in flight

- GIVEN a DOCTOR who clicks the switch
- WHEN the mutation is pending (not yet resolved)
- THEN the switch MUST be disabled (no second click can fire)
- AND a subsequent click attempt MUST NOT trigger a second mutation call

#### Scenario: Toggling OFF preserves existing ONLINE citas

- GIVEN a doctor with 1 existing ONLINE cita (created when `aceptaOnline === true`)
- WHEN the doctor toggles `aceptaOnline` to `false`
- THEN the existing cita's `modalidad` MUST remain `"ONLINE"`
- AND the cita MUST remain joinable via `bookings.getRoomToken` (the modality gate is evaluated per-cita at request time, not at toggle time)

#### Scenario: Toggling ON does not retroactively change existing citas

- GIVEN a doctor with 1 existing PRESENCIAL cita (created when `aceptaOnline === false`)
- WHEN the doctor toggles `aceptaOnline` to `true`
- THEN the existing cita's `modalidad` MUST remain `"PRESENCIAL"`
- AND the cita MUST NOT be converted to `ONLINE` automatically

#### Scenario: No warning UI on toggle

- GIVEN a DOCTOR on `/configuracion`
- WHEN the doctor clicks the switch
- THEN no modal, no confirmation dialog, no toast counting affected citas MUST appear
- AND the switch MUST flip directly to the new state (optimistic update)

### Requirement: REQ-DS-MOD-3 — Help Text

The "Modalidad de consulta" card MUST render a help string directly under the switch (a `<p className="text-sm text-muted-foreground">` or equivalent) with the exact text: `"Aceptar consultas online habilita la opción de videollamada en el perfil público y en la agenda de los pacientes."` The text MUST be in Spanish, MUST be visible by default (not behind a tooltip, not in a `<details>` collapse), and MUST update ONLY with a deliberate product change — never on every render (it is static, not derived from the switch state).

The help text MUST appear in both the unchecked and checked states (the consequence applies in both directions — opting out also changes what patients see). The text MUST be the only explanation on the card; no separate FAQ link, no link to docs, no extra paragraph.

#### Scenario: Help text is present and exact

- GIVEN an authenticated DOCTOR on `/configuracion`
- WHEN the "Modalidad de consulta" card renders
- THEN a `<p>` MUST be in the DOM with the text `"Aceptar consultas online habilita la opción de videollamada en el perfil público y en la agenda de los pacientes."`
- AND the text MUST match exactly (character-for-character, including accents and the final period)

#### Scenario: Help text is visible in both switch states

- GIVEN a DOCTOR with `aceptaOnline === true` (or `false`)
- WHEN the card renders
- THEN the help text MUST be in the DOM
- AND the text content MUST be identical regardless of the switch state

#### Scenario: Help text is not a tooltip and not collapsible

- GIVEN the card is rendered
- WHEN the DOM is inspected
- THEN the help text MUST NOT be inside a `<details>` / `<summary>` element
- AND the help text MUST NOT have a `title` attribute (it is visible prose, not a hover tooltip)
- AND the help text MUST be visible without user interaction
