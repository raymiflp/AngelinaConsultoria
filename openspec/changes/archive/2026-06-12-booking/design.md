# Design: Appointment Booking System

## Technical Approach

Extend the existing `bookings.ts` placeholder (currently `router({})`) with 5 tRPC procedures, add a `doctor_availability` Drizzle table + entity for weekly schedule management, and build three Next.js App Router pages for the booking workflow. Slot calculation is pure PostgreSQL with application-level 30-min interval generation filtered against existing citas.

Alignment with proposal: add DB table (DB schema), booking router (API), availability router (API), UI pages + components (presentation), domain entity (domain). All out-of-scope items preserved.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|----------|--------|----------|--------|
| Availability storage | JSON column vs separate rows per day-slot | JSON = simpler schema, one row/doctor, no JOINs for slot gen; rows = queryable per day-of-week, normalize-able. JSON wins for write simplicity — weekly schedule read far more often than individual day queried. | **JSON column** (`disponibilidad` with Zod schema) |
| Slot generation | App-level vs DB function | App-level = testable, portable, no migration per DB; DB function = faster for large datasets. Small scale (< 100 slots/doctor/day) makes app-level fine. | **App-level** — iterate availability ranges, produce 30-min intervals, filter overlapping citas |
| Race condition guard | `SELECT FOR UPDATE` vs unique constraint on (doctorId, fechaHora) | FOR UPDATE locks only the target window; unique constraint would need a synthetic column for the slot start time. FOR UPDATE is standard tSQL and matches existing Drizzle patterns. | **`SELECT FOR UPDATE`** on citas for the doctor+hour range within a Drizzle transaction |
| Status validation | Reuse existing `transitionStatus()` domain function | Already exists in `src/domain/enums/index.ts`. No new code; the tRPC layer just calls it and lets it throw on invalid transitions. | **Reuse `transitionStatus()`** — no new enums or validation needed |

## Data Flow

```
Booking flow (patient):
  SlotGrid ──select time──→ [date + doctorId]
       │
       ├── getDoctorSlots (public) ──→ DoctorAvailability + citas ──→ available slot list
       │
  User selects slot → motivo form
       │
       └── createAppointment (protected) ──→ txn { SELECT FOR UPDATE citas → INSERT cita }

Availability flow (doctor):
  AvailabilityForm ──→ setAvailability (protected, DOCTOR) ──→ UPSERT doctor_availability
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/infrastructure/db/schema/doctor-availability.ts` | Create | Drizzle `doctorDisponibilidad` table: id (uuid PK), doctorId (FK→doctores, unique), disponibilidad (jsonb) |
| `src/infrastructure/db/schema/index.ts` | Modify | Export new table + relations (doctor → availability one-to-one) |
| `src/domain/entities/doctor-availability.ts` | Create | `DoctorAvailability` entity with Zod schema for JSON validation |
| `src/domain/entities/index.ts` | Modify | Export new entity |
| `src/infrastructure/api/routers/bookings.ts` | Modify | Replace `router({})` with 5 procedures: `getDoctorSlots`, `getMyAppointments`, `createAppointment`, `cancelAppointment`, `updateAppointmentStatus`, `updateAppointmentNotes` |
| `src/infrastructure/api/routers/availability.ts` | Create | `getMyAvailability` + `setAvailability` (both DOCTOR-protected) |
| `src/infrastructure/api/routers/_app.ts` | Modify | Add `availability` router key |
| `src/app/citas/page.tsx` | Create | Client page — fetches `getMyAppointments`, renders list with status filter + AppointmentCard |
| `src/app/citas/[id]/page.tsx` | Create | Appointment detail page — shows full cita info, doctor can update status/notes |
| `src/app/doctores/[id]/agendar/page.tsx` | Create | Booking page — doctor public info + SlotGrid calendar |
| `src/components/booking/AppointmentCard.tsx` | Create | Card display for appointment with status badge, doctor/patient name, date, actions |
| `src/components/booking/SlotGrid.tsx` | Create | Calendar (react-day-picker) + time slot buttons, calls `getDoctorSlots` |
| `src/components/booking/StatusBadge.tsx` | Create | Badge variant mapped to ConsultationStatus color |
| `src/components/booking/index.ts` | Create | Barrel export |
| `drizzle/migrations/` | Create | Migration for `doctor_availability` table |

## Interfaces / Contracts

**Zod schemas** (co-located with routers):

```typescript
// Weekly schedule shape
const disponibilidadSchema = z.record(
  z.enum(["lunes","martes","miercoles","jueves","viernes","sabado","domingo"]),
  z.array(z.object({ inicio: z.string(), fin: z.string() })),
);

// Slot output
const slotSchema = z.object({
  start: z.date(),
  end: z.date(),
  available: z.boolean(),
});
```

**tRPC procedure signatures** (on existing `bookings.ts`):

| Procedure | Type | Input | Output |
|-----------|------|-------|--------|
| `getDoctorSlots` | public query | `{ doctorId: string, date: Date }` | `Slot[]` |
| `getMyAppointments` | protected query | `{ status?: ConsultationStatus }` | `Appointment[]` |
| `createAppointment` | protected mutation | `{ doctorId, fechaHora, motivo }` | `Cita` |
| `cancelAppointment` | protected mutation | `{ citaId }` | `{ ok: true }` |
| `updateAppointmentStatus` | protected (DOCTOR) mutation | `{ citaId, estado }` | `Cita` |
| `updateAppointmentNotes` | protected (DOCTOR) mutation | `{ citaId, notas }` | `{ ok: true }` |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Zod availability schema validation | Edge cases: empty slots, overlapping ranges, invalid day keys |
| Unit | Slot generation logic | Availability + existing citas → correct available slots |
| Unit | `createAppointment` rejects past dates | Already tested in Cita entity, just verify procedure throws |
| Integration | `createAppointment` double-booking | two concurrent calls for same slot → one succeeds, one rejects |
| Integration | Status transition enforcement | call `updateAppointmentStatus` with invalid transition → TRPCError |
| Integration | Role guard on doctor-only procedures | PACIENTE calls `setAvailability` → FORBIDDEN |

## Migration / Rollout

No data migration needed. Run `npx drizzle-kit generate` + `npx drizzle-kit migrate` to create `doctor_availability` table. Rollback: drop table via `npx drizzle-kit drop` + revert schema files.

## Open Questions

- [ ] Should `getDoctorSlots` accept a date range (week view) or single date? Single date for v1, extendable later.
- [ ] `createAppointment` duraciónMinutos — use cita default (30 min) or allow override? Use cita default for v1.
