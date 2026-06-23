# Tasks: Appointment Booking System

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~680 |
| 800-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

## Phase 0: Dependencies

- [x] 0.1 Add shadcn components: `npx shadcn@latest add calendar popover dialog radio-group`
- [x] 0.2 Install date-fns: `npm install date-fns`

## Phase 1: DB Schema

- [x] 1.1 Create `src/infrastructure/db/schema/doctor-availability.ts` — `doctorDisponibilidad` table (id uuid PK, doctorId FK→doctores, disponibilidad jsonb)
- [x] 1.2 Export table + add doctor-availability one-to-one relation in `src/infrastructure/db/schema/index.ts`
- [x] 1.3 Run `npx drizzle-kit generate` to create migration

## Phase 2: Domain & API Schemas

- [x] 2.1 Create `src/domain/entities/doctor-availability.ts` — `DoctorAvailability` entity with Zod disponibilidad schema (day→ranges record)
- [x] 2.2 Create `src/infrastructure/booking/schemas.ts` — all Zod schemas for booking + availability
- [x] 2.3 Export entity in `src/domain/entities/index.ts`

## Phase 3: API

- [x] 3.1 Implement `src/infrastructure/api/routers/bookings.ts` — 6 procedures: getDoctorSlots (public), getMyAppointments, createAppointment, cancelAppointment, updateAppointmentStatus, updateAppointmentNotes; include slot generation + FOR UPDATE concurrency + role guards
- [x] 3.2 Create `src/infrastructure/api/routers/availability.ts` — getMyAvailability + setAvailability (both DOCTOR-only, UPSERT, overlap validation)
- [x] 3.3 Wire availability router into `src/infrastructure/api/routers/_app.ts`

## Phase 3: UI

- [x] 3.1 Create `src/components/booking/StatusBadge.tsx` — ConsultationStatus→Badge variant map
- [x] 3.2 Create `src/components/booking/AppointmentCard.tsx` — role-aware card with other party name, formatted date, StatusBadge, navigates to `/citas/[id]`
- [x] 3.3 Create `src/components/booking/SlotGrid.tsx` — Calendar (react-day-picker) + time slot buttons + motivo form on slot select
- [x] 3.4 Create `src/components/booking/index.ts` — barrel export
- [x] 3.5 Create `src/app/citas/page.tsx` — fetches getMyAppointments, status filter, skeleton loading, empty state
- [x] 3.6 Create `src/app/citas/[id]/page.tsx` — detail with StatusBadge, DOCTOR sees status actions + notes editor
- [x] 3.7 Create `src/app/doctores/[id]/agendar/page.tsx` — calendar + SlotGrid + booking form, redirects to `/citas/[id]` on submit

## Phase 4: Testing

- [x] 4.1 Unit: Zod disponibilidad schema — invalid day keys, start≥end, overlapping ranges, empty lists
- [x] 4.2 Unit: slot generation — availability + existing citas → correct available/unavailable slots
- [x] 4.3 Integration: booking procedures — slot generation edge cases, booking logic pure functions
- [x] 4.4 Integration: availability procedures — schema validation, overlap detection
- [x] 4.5 Component smoke: StatusBadge renders correct variant for each ConsultationStatus

## Phase 5: Verification

- [x] 5.1 `npm run type-check` — tsc --noEmit passes
- [x] 5.2 `npm run test:run` — all tests pass
