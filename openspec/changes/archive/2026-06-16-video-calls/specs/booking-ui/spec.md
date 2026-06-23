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
