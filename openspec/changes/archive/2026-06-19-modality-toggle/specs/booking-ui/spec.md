# Booking UI Specification

## Purpose

Define the appointment pages: list (`/citas`), slot picker (`/doctores/[id]/agendar`), detail (`/citas/[id]`), and reusable components. All pages MUST be role-aware with loading, empty, and error states.

## Requirements

### Requirement: Appointment List Page (/citas)

The system MUST render a role-aware list at `/citas` calling `getMyAppointments`. A status filter SHALL allow filtering by ConsultationStatus. Each appointment SHALL render as an `AppointmentCard`. Patient view shows doctor name; doctor view shows patient name. Empty state: "No tienes citas con este filtro." Loading: skeleton list.

#### Scenario: Patient filters by status

- GIVEN a PACIENTE with 2 PENDIENTE and 1 COMPLETADA cita
- WHEN navigating to `/citas`
- THEN all 3 citas render as cards with doctor names
- WHEN the "Pendiente" filter is selected
- THEN only 2 PENDIENTE citas are visible

#### Scenario: Empty state shown

- GIVEN a user with no citas
- WHEN navigating to `/citas`
- THEN "No tienes citas con este filtro." is displayed

#### Scenario: Loading state

- GIVEN the query is in flight
- WHEN the page renders
- THEN skeleton placeholders display instead of cards

### Requirement: Slot Picker Page (/doctores/[id]/agendar)

The system MUST render a Calendar (react-day-picker) and time grid calling `getDoctorSlots`. Selecting an available slot opens a motivoConsulta form. On submit, `createAppointment` is called; on success, redirect to `/citas/[id]`.

#### Scenario: User books an available slot

- GIVEN a doctor with availability on selected date
- WHEN the user selects a date and clicks an available slot
- THEN a form with motivoConsulta textarea appears
- WHEN the user submits a valid motivo
- THEN the appointment is created and user is redirected to `/citas/[newId]`

#### Scenario: No slots available

- GIVEN a doctor with no availability on selected date
- WHEN the slot grid renders
- THEN "No hay turnos disponibles para esta fecha" is displayed

#### Scenario: Unauthenticated user prompted to log in

- GIVEN an unauthenticated user
- WHEN they select an available slot
- THEN they are prompted to log in or register

### Requirement: Appointment Detail Page (/citas/[id])

The system MUST render appointment detail at `/citas/[id]` showing doctor/patient name, date/time, StatusBadge, motivo, and notas (DOCTOR only). DOCTOR sees action buttons for status transitions and a notes editor.

#### Scenario: Patient views detail

- GIVEN a PACIENTE with a PENDIENTE cita
- WHEN navigating to `/citas/[id]`
- THEN doctor name, fechaHora, motivo, and a PENDIENTE badge display
- AND no action buttons or notes editor appear

#### Scenario: Doctor updates status

- GIVEN a DOCTOR viewing a PENDIENTE cita
- WHEN they click "Confirmar"
- THEN `updateAppointmentStatus` is called and badge updates to CONFIRMADA

### Requirement: AppointmentCard Component

The card SHALL display the other party's name, fechaHora formatted as "dd MMM yyyy HH:mm", a StatusBadge, and navigate to `/citas/[id]` on click.

#### Scenario: Card renders role-aware

- GIVEN a PACIENTE with a Cita
- WHEN AppointmentCard renders
- THEN it shows the doctor's name, NOT the patient's

### Requirement: SlotGrid Component

The grid SHALL render a Calendar and time slot buttons. Available slots are primary-colored and clickable; unavailable slots are muted and disabled.

#### Scenario: Available vs unavailable rendering

- GIVEN a list of slots with mixed availability
- WHEN SlotGrid renders
- THEN available slots have enabled buttons, unavailable are disabled

### Requirement: StatusBadge Component

The badge SHALL map ConsultationStatus to shadcn badge variants: PENDIENTE → secondary, CONFIRMADA → default, EN_CURSO → warning, COMPLETADA → success, CANCELADA → destructive, NO_ASISTIO → outline.

#### Scenario: Correct variant per status

- GIVEN any ConsultationStatus
- WHEN StatusBadge renders
- THEN the variant matches the defined mapping

## Video Calls Additions (2026-06-16)

The following requirements are ADDED to the booking-ui spec by the `2026-06-16-video-calls` change. The full source of truth for the new UI surface is `video-calls-ui/spec.md`; this delta section is a forward pointer that keeps the booking-ui spec self-contained and makes the new affordance visible to the next reviewer.

### Requirement: JoinCallButton on Detail Page

The existing appointment detail page `/citas/[id]` MUST include a `<JoinCallButton>` for both DOCTOR and PACIENTE views. The button is the entry point to the call page at `/citas/[id]/llamada`. The component is a client island (a small focused component) and is the only client-side interactive addition to the detail page in this change.

The full contract — visibility logic, props, click behavior, integration with the existing layout, accessibility, and the call page itself — is documented in `video-calls-ui/spec.md` under REQ-VC-UI-1 through REQ-VC-UI-6. The booking-ui spec delegates the detail to that spec to avoid duplication.

The visibility rule is identical to the API gate in `video-calls-api/spec.md` REQ-VC-API-3: visible when `estado === 'EN_CURSO'` OR (`estado === 'CONFIRMADA'` AND `Math.abs(Date.now() - fechaHora.getTime()) <= 15 * 60 * 1000`), hidden otherwise. The duplication is intentional and acceptable: the button does a client-side filter to avoid showing a control that would fail on click, and the procedure re-validates server-side to enforce the same rule.

#### Scenario: Button is visible for an in-progress cita

- GIVEN a cita with `estado === 'EN_CURSO'`
- WHEN the detail page renders
- THEN a `<JoinCallButton>` MUST be in the DOM
- AND the button MUST link to `/citas/${citaId}/llamada`

#### Scenario: Button is visible within the time window

- GIVEN a CONFIRMADA cita whose `fechaHora` is 5 minutes in the future
- WHEN the detail page renders
- THEN a `<JoinCallButton>` MUST be in the DOM

#### Scenario: Button is hidden outside the gates

- GIVEN a PENDIENTE cita (or a CONFIRMADA cita 30 minutes in the future, or a COMPLETADA / CANCELADA / NO_ASISTIO cita)
- WHEN the detail page renders
- THEN `<JoinCallButton>` MUST NOT be in the DOM (the component returns `null`)

#### Scenario: Doctor view places the button with the transition card

- GIVEN a DOCTOR viewing the detail page
- WHEN the page renders and the button is visible
- THEN the button MUST appear alongside the doctor's `Confirmar` / `Iniciar consulta` / `Completar` actions
- AND the existing buttons MUST remain unchanged

#### Scenario: Patient view places the button in a dedicated affordance

- GIVEN a PACIENTE viewing the detail page
- WHEN the page renders and the button is visible
- THEN the button MUST appear in the patient area
- AND the doctor's transition buttons MUST NOT be in the DOM (role gating)

## Modality Toggle Additions (2026-06-19)

The following requirements are ADDED to the booking-ui spec by the `2026-06-19-modality-toggle` change. The booking flow gains a modality picker step (AFTER slot pick, BEFORE motivo) and the cita detail page gains a modality label (badge) next to the existing status badge. The full source of truth for the `JoinCallButton` modality prop is in `video-calls-ui/spec.md` REQ-VU-MOD-1; the booking-ui spec covers the booking-flow picker and the detail-page badge only.

### Requirement: REQ-BU-MOD-1 — Modality picker in booking flow

The booking page `/doctores/[id]/agendar` MUST render a modality picker AFTER the slot pick and BEFORE the motivo textarea, in this exact order:

1. Pick slot — the existing `SlotGrid` (no change).
2. Pick modality + write motivo — a new section that appears after an available slot is selected. The modality MUST be a two-button toggle (or radio group) with the two options labelled exactly `"Presencial"` and `"Online"` (Spanish, exactly as written — no English, no "En línea", no abbreviations). The `Presencial` option MUST always be enabled. The `Online` option MUST be disabled (with a Tailwind `disabled` style and a `title` / tooltip attribute reading exactly `"Este doctor no ofrece consultas online"`) when `doctor.aceptaOnline === false`; the `Online` option MUST be enabled when `doctor.aceptaOnline === true`. The `doctor.aceptaOnline` value MUST be sourced from the same `getDoctorFullProfile` query the page already uses (no extra round-trip).
3. Confirm — a single button labelled `"Confirmar reserva"` that calls `bookings.createAppointment` with BOTH `modalidad` and `motivoConsulta` in a single mutation. Sending the two fields together in one round-trip is intentional (AD-4 in the proposal) — splitting them into two mutations would create a half-created cita in flight if the second call fails.

The picker MUST render a visual cue (highlighted button / filled radio / `aria-checked="true"`) for the currently selected modality. The `Online` button when disabled MUST be a focusable but non-clickable element (Tailwind `disabled:cursor-not-allowed` or equivalent) — it MUST NOT be removed from the DOM (the patient MUST see that online is an option that the doctor has explicitly disabled, not that the option does not exist). The "Confirmar reserva" button MUST be disabled until BOTH a modality is selected AND a motivo is non-empty (a non-empty motivo is the pre-change validation rule, unchanged).

#### Scenario: Doctor with online enabled — both options clickable

- GIVEN a doctor with `aceptaOnline === true`
- WHEN the user selects an available slot
- THEN the modality picker MUST appear with two options
- AND `"Presencial"` MUST be enabled and clickable
- AND `"Online"` MUST be enabled and clickable
- AND NEITHER option MUST show the `"Este doctor no ofrece consultas online"` tooltip
- WHEN the user picks `"Online"` and submits a valid motivo
- THEN `bookings.createAppointment` MUST be called with `modalidad: "ONLINE"` AND the motivo

#### Scenario: Doctor with online disabled — Online option is disabled with tooltip

- GIVEN a doctor with `aceptaOnline === false`
- WHEN the user selects an available slot
- THEN the modality picker MUST appear with two options
- AND `"Presencial"` MUST be enabled and clickable
- AND `"Online"` MUST be visible but disabled (focusable, with `cursor-not-allowed`)
- AND `"Online"` MUST have a `title` (or `aria-label`) reading exactly `"Este doctor no ofrece consultas online"`
- AND selecting `"Online"` MUST NOT be possible (no state change)
- WHEN the user picks `"Presencial"` and submits a valid motivo
- THEN `bookings.createAppointment` MUST be called with `modalidad: "PRESENCIAL"`

#### Scenario: Server-side rejection surfaces as a sonner toast

- GIVEN a doctor with `aceptaOnline === false` at API call time (e.g. toggled off between the load and the click)
- WHEN the user picks `"Presencial"` (the client thinks it's the safe pick) and submits
- AND the response is unrelated to the modality gate
- AND if the user managed to send `modalidad: "ONLINE"` through some means
- THEN the server MUST respond with `BAD_REQUEST` and message `"El doctor no ofrece consultas online"`
- AND the page MUST surface the error via a sonner toast
- AND the cita MUST NOT be created

#### Scenario: Combined createAppointment call sends both fields

- GIVEN the user has selected a slot, a modality, and a motivo
- WHEN the user clicks `"Confirmar reserva"`
- THEN a SINGLE `bookings.createAppointment` mutation MUST be called
- AND the input MUST include `modalidad` AND `motivoConsulta` AND `doctorId` AND `fechaHora` (all four fields, one round-trip)
- AND on success, the user MUST be redirected to `/citas/[newId]`
- AND on failure, the user MUST stay on the page with the error toast

### Requirement: REQ-BU-MOD-2 — Modality label on cita detail page

The existing appointment detail page `/citas/[id]` MUST render a small `<Badge>` next to the existing `StatusBadge` that displays the cita's modality. The badge MUST read exactly `"Presencial"` when `cita.modalidad === 'PRESENCIAL'` and exactly `"Online"` when `cita.modalidad === 'ONLINE'` (Spanish, exactly as written — no "En línea", no "Videollamada", no abbreviations). The badge MUST be placed in the page header (the same row as the existing status badge), MUST be a separate visual element (its own `<Badge>` component, not a variant of `StatusBadge`), and MUST be rendered for BOTH the DOCTOR and PACIENTE views.

The badge MUST render for every cita on the detail page regardless of `estado` — the modality is a property of the cita, not a property of the call state. The badge MUST NOT include an icon (no `Video` icon, no `MapPin` icon) — the text alone is the spec. The badge MUST use the `Badge` component already in use for the `StatusBadge` (or a sibling variant); it MUST NOT introduce a new shadcn primitive.

The `<JoinCallButton>` on the same page MUST continue to gate its visibility on modality (per `video-calls-ui/spec.md` REQ-VU-MOD-1) — the badge is informational, the button is the action; the two are independent. The detail page MUST pass the `modalidad` prop to the `JoinCallButton` in BOTH the doctor and patient views (the absence of this prop is what made the prior `JoinCallButton` show for PRESENCIAL citas — see `video-calls-ui/spec.md` REQ-VU-MOD-1).

#### Scenario: PRESENCIAL cita shows "Presencial" badge

- GIVEN a cita with `modalidad === 'PRESENCIAL'`
- WHEN the detail page renders (doctor OR patient view)
- THEN a `<Badge>` with the text `"Presencial"` MUST be in the DOM
- AND the badge MUST be adjacent to the `StatusBadge` (in the same header row)
- AND the badge MUST render alongside the existing status badge regardless of `estado`

#### Scenario: ONLINE cita shows "Online" badge

- GIVEN a cita with `modalidad === 'ONLINE'`
- WHEN the detail page renders (doctor OR patient view)
- THEN a `<Badge>` with the text `"Online"` MUST be in the DOM
- AND the badge MUST be adjacent to the `StatusBadge`

#### Scenario: Badge renders for every estado

- GIVEN a cita with `modalidad === 'ONLINE'` and `estado === 'COMPLETADA'`
- WHEN the detail page renders
- THEN the `"Online"` badge MUST be in the DOM (the modality badge does not depend on `estado`)

#### Scenario: No icon on the badge

- GIVEN the modality badge is in the DOM
- WHEN the badge is inspected
- THEN the badge MUST contain only the text (`"Presencial"` or `"Online"`)
- AND MUST NOT contain a `Video` icon, `MapPin` icon, or any other lucide-react icon
- AND MUST NOT contain a nested element other than the text node
