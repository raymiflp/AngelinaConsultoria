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
