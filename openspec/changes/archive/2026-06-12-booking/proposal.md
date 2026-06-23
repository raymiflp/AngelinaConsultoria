# Proposal: Appointment Booking System

## Intent

Patients cannot book appointments with doctors. The `citas` table and domain entity exist, but no API or UI to create, list, or manage appointments. Doctors cannot manage availability.

## Scope

### In Scope

1. tRPC booking router: `getAvailableSlots` (public), `getMyAppointments` (protected), `createAppointment` (patient), `cancelAppointment` (any), `updateAppointmentStatus` (doctor)
2. Availability: weekly schedule per doctor in new `doctor_availability` Drizzle table
3. UI pages: `/citas` (list + status filter), `/doctores/[id]/agendar` (slot picker + form), `/citas/[id]` (detail)
4. Components: `AppointmentCard`, `SlotPicker`, `AvailabilityForm`
5. Add shadcn: calendar, popover, dialog, radio-group; add `react-day-picker`

### Out of Scope

Notifications, payments, recurring, waiting list, video calls — all future.

## Capabilities

### New Capabilities

- `booking-api`: tRPC router + slot logic
- `booking-ui`: Pages and components
- `availability`: Doctor schedule CRUD

### Modified Capabilities

- `domain-entities`: Add `DoctorAvailability` entity
- `db-schema`: Add `doctor_availability` table
- `ui-navigation`: Add `/citas`, `/doctores/[id]/agendar` routes

## Approach

1. **Availability table**: weekly schedule per doctor (day_of_week, start_time, end_time).
2. **Booking router**: 5 procedures. Slots = availability minus existing citas, no overlaps.
3. **UI pages**: `/citas` with status filter, `/citas/[id]` detail, `/doctores/[id]/agendar` with Calendar + time grid.
4. **SlotPicker**: renders available time blocks; selection opens motivo form → `createAppointment`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/infrastructure/api/routers/bookings.ts` | Modified | Empty → 5 procedures |
| `src/infrastructure/db/schema/availability.ts` | New | Doctor availability table |
| `src/domain/entities/availability.ts` | New | DoctorAvailability entity |
| `src/app/citas/page.tsx` | New | Appointment list |
| `src/app/citas/[id]/page.tsx` | New | Appointment detail |
| `src/app/doctores/[id]/agendar/page.tsx` | New | Booking page |
| `src/components/bookings/` | New | AppointmentCard, SlotPicker |
| `src/components/ui/` | Modified | +calendar, popover, dialog, radio-group |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Slot race condition | Low | DB constraint + tRPC transaction |
| Missing profile rows | Low | Both lookups before insert; clear errors |

## Rollback Plan

1. Revert `bookings.ts` to empty `router({})`.
2. Delete `src/app/citas/`, `src/app/doctores/[id]/agendar/`, `src/components/bookings/`.
3. Delete availability entity and schema files + generate migration to drop table.
4. Test: `build` passes, existing pages unaffected.

## Dependencies

- `react-day-picker`, `date-fns` — slot calculation and calendar
- Shadcn components: calendar, popover, dialog, radio-group

## Success Criteria

- [ ] `getAvailableSlots` returns non-overlapping slots for a doctor+date
- [ ] `createAppointment` creates Cita (PENDIENTE), rejects overlap
- [ ] `getMyAppointments` filters by role (patient vs doctor)
- [ ] `cancelAppointment` works for own patient citas or any doctor cita
- [ ] `updateAppointmentStatus` enforces valid ConsultationStatus transitions
- [ ] `/doctores/[id]/agendar` shows slots and allows booking
- [ ] `/citas` lists appointments with status filter
- [ ] `npm run build` passes
