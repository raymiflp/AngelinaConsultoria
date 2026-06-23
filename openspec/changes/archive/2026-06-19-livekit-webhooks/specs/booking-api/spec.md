# Delta for Booking API

## LIVEKIT WEBHOOKS ADDITIONS (2026-06-19)

The following requirement is ADDED to the booking-api spec by the `2026-06-19-livekit-webhooks` change. The `updateAppointmentStatusUseCase` is unchanged on its public wire surface — it remains the DOCTOR-only path that checks `cita.doctorId === actor.doctorId` and throws `FORBIDDEN` on mismatch. A SECOND entry point now exists: the system actor (LiveKit server, no user session) can transition a cita from `EN_CURSO` to `COMPLETADA` or `NO_ASISTIO` via `autoCompleteOnRoomFinishedUseCase` (full contract in `video-calls-api/spec.md` REQ-VCA-WH-2), which runs the optimistic UPDATE directly without going through `updateAppointmentStatusUseCase`. This delta documents the invariant that the doctor-only path is NOT widened — system actors use a separate, internal orchestration primitive (AD-9 — exposing it as a tRPC procedure would be a privilege escalation: a doctor with curl could otherwise force-complete any `EN_CURSO` cita). **D10 is RESOLVED.**

### Requirement: REQ-BA-WH-1 — System-Actor State Transitions via Webhook

The system MUST permit a system actor (LiveKit server, `usuarioId === null`) to transition a cita from `EN_CURSO` to `COMPLETADA` or `NO_ASISTIO`. The transition path is `autoCompleteOnRoomFinishedUseCase` (see `video-calls-api/spec.md` REQ-VCA-WH-2) — NOT `updateAppointmentStatusUseCase`. The system actor path bypasses the doctor check (`cita.doctorId === actor.doctorId`) because the LiveKit server is not a human user. The system actor path uses the same atomic SQL primitive (`UPDATE citas SET estado = $1 WHERE id = $2 AND estado = 'EN_CURSO'`) and the same `transitionStatus()` in-memory helper as the doctor path, so the state-machine invariants are unchanged.

The existing `updateAppointmentStatusUseCase` MUST be UNCHANGED: it MUST continue to enforce the doctor check, MUST continue to reject any actor who is not the cita's doctor with `FORBIDDEN`, and MUST NOT accept `usuarioId === null` (the procedure is `protectedProcedure` so there is always a session). Widening `updateAppointmentStatusUseCase` to accept the system actor is explicitly rejected — system actions and human actions are kept on separate paths with separate audit actors for clarity (AD-9). Two paths, two actors, no privilege escalation surface.

The `transitionStatus()` helper MUST continue to enforce the state machine: `EN_CURSO → {COMPLETADA, NO_ASISTIO}` is a valid transition. The webhook path uses the same helper — adding NEW transitions is out of scope (the state machine is unchanged).

#### Scenario: System actor transitions EN_CURSO to COMPLETADA via webhook

- GIVEN an ONLINE cita in `EN_CURSO`
- AND a `room_finished` webhook event with `participantCount >= 1`
- WHEN the webhook handler invokes `autoCompleteOnRoomFinishedUseCase`
- THEN the use case MUST transition `citas.estado` to `'COMPLETADA'`
- AND MUST write an `audit_logs` row with `usuarioId: null` and `accion: 'CITA_AUTO_COMPLETED_BY_WEBHOOK'`
- AND MUST NOT call `updateAppointmentStatusUseCase`

#### Scenario: System actor transitions EN_CURSO to NO_ASISTIO via webhook

- GIVEN an ONLINE cita in `EN_CURSO`
- AND a `room_finished` webhook event with `participantCount === 0`
- WHEN the webhook handler invokes `autoCompleteOnRoomFinishedUseCase`
- THEN the use case MUST transition `citas.estado` to `'NO_ASISTIO'`
- AND MUST write an `audit_logs` row with `usuarioId: null` and `accion: 'CITA_AUTO_COMPLETED_BY_WEBHOOK'`
- AND MUST NOT call `updateAppointmentStatusUseCase`

#### Scenario: Doctor cannot transition a cita on behalf of another doctor (regression guard)

- GIVEN DOCTOR-A authenticated against a cita owned by DOCTOR-B (in `EN_CURSO`)
- WHEN `api.bookings.updateAppointmentStatus({ citaId, estado: 'COMPLETADA' })` is called
- THEN the procedure MUST reject with `FORBIDDEN` (the doctor check is unchanged)
- AND `citas.estado` MUST remain `'EN_CURSO'`
- AND the webhook system-actor path MUST NOT be reachable from the doctor session (it is internal-only — not exposed via tRPC)
