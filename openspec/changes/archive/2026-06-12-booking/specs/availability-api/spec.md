# Availability API Specification

## Purpose

Define the tRPC availability router — the doctor-protected procedures to view and manage weekly schedules. Availability drives slot generation in the booking workflow.

## Requirements

### Requirement: getAvailability

The system MUST expose a protected `getAvailability` query restricted to DOCTOR role. It MUST return the authenticated doctor's weekly schedule as a record of day-of-week keys (lunes–domingo) mapped to arrays of `{ inicio, fin }` time ranges. If no availability is configured, it MUST return an empty record.

#### Scenario: Doctor views their schedule

- GIVEN an authenticated DOCTOR with availability set for lunes (09:00–12:00) and miercoles (14:00–18:00)
- WHEN `getAvailability` is called
- THEN the response MUST include `lunes: [{ inicio: "09:00", fin: "12:00" }]`
- AND `miercoles: [{ inicio: "14:00", fin: "18:00" }]`
- AND all other days MUST be absent from the record

#### Scenario: No availability configured

- GIVEN an authenticated DOCTOR who has never set availability
- WHEN `getAvailability` is called
- THEN the response MUST be an empty object `{}`

### Requirement: setAvailability

The system MUST expose a protected `setAvailability` mutation restricted to DOCTOR role. Input: a `disponibilidad` record of day-of-week keys to time range arrays. It MUST UPSERT — create if no row exists, replace if one does. Each time range MUST have `inicio` < `fin`. Overlapping ranges within the same day MUST be rejected with BAD_REQUEST.

#### Scenario: Doctor sets their weekly schedule

- GIVEN an authenticated DOCTOR with no existing availability
- WHEN `setAvailability({ disponibilidad: { lunes: [{ inicio: "09:00", fin: "12:00" }] } })` is called
- THEN the schedule MUST be persisted
- AND a subsequent `getAvailability` call MUST return the same schedule

#### Scenario: Doctor updates their existing schedule

- GIVEN an authenticated DOCTOR with existing availability (lunes 09:00–12:00)
- WHEN `setAvailability({ disponibilidad: { lunes: [{ inicio: "10:00", fin: "14:00" }], martes: [{ inicio: "09:00", fin: "13:00" }] } })` is called
- THEN the lunes range MUST be replaced (not merged)
- AND martes MUST be added
- AND the previous lunes 09:00–12:00 MUST no longer exist

#### Scenario: Overlapping time ranges rejected

- GIVEN an authenticated DOCTOR
- WHEN `setAvailability` is called with overlapping ranges on the same day: `[{ inicio: "09:00", fin: "12:00" }, { inicio: "11:00", fin: "13:00" }]`
- THEN a BAD_REQUEST error MUST be thrown

#### Scenario: Invalid time range (start >= end) rejected

- GIVEN an authenticated DOCTOR
- WHEN `setAvailability` is called with `[{ inicio: "14:00", fin: "12:00" }]`
- THEN a BAD_REQUEST error MUST be thrown

#### Scenario: Non-doctor caller rejected

- GIVEN an authenticated PACIENTE user
- WHEN `setAvailability` is called
- THEN a FORBIDDEN error MUST be thrown
