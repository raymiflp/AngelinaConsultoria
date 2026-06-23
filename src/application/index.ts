// ── Bookings ──
export { getDoctorSlotsUseCase } from "./use-cases/bookings/get-doctor-slots.use-case";
export type { GetDoctorSlotsInput } from "./use-cases/bookings/get-doctor-slots.use-case";

export { createAppointmentUseCase } from "./use-cases/bookings/create-appointment.use-case";
export type { CreateAppointmentInput, CreateAppointmentOutput } from "./use-cases/bookings/create-appointment.use-case";

export { cancelAppointmentUseCase } from "./use-cases/bookings/cancel-appointment.use-case";
export type { CancelAppointmentInput, CancelAppointmentOutput } from "./use-cases/bookings/cancel-appointment.use-case";

export { updateAppointmentStatusUseCase } from "./use-cases/bookings/update-appointment-status.use-case";
export type { UpdateAppointmentStatusInput } from "./use-cases/bookings/update-appointment-status.use-case";

export { getMyPatientsUseCase } from "./use-cases/bookings/get-my-patients.use-case";
export type { GetMyPatientsInput, PatientSummary } from "./use-cases/bookings/get-my-patients.use-case";

export { getMyAppointmentsUseCase } from "./use-cases/bookings/get-my-appointments.use-case";
export type { GetMyAppointmentsInput } from "./use-cases/bookings/get-my-appointments.use-case";

// ── Bookings (video-calls) ──
export { getRoomTokenUseCase } from "./use-cases/bookings/get-room-token.use-case";
export type {
  GetRoomTokenInput,
  GetRoomTokenOutput,
} from "./use-cases/bookings/get-room-token.use-case";

// ── Bookings (livekit-webhooks) ──
// Invoked by the route handler at POST /api/livekit/webhook — NOT a
// tRPC procedure (AD-9). System-actor path (usuarioId: null audit).
export { autoCompleteOnRoomFinishedUseCase } from "./use-cases/bookings/auto-complete-on-room-finished.use-case";
export type {
  AutoCompleteOnRoomFinishedInput,
  AutoCompleteOnRoomFinishedOutput,
} from "./use-cases/bookings/auto-complete-on-room-finished.use-case";

// ── Profiles ──
export { getProfileUseCase } from "./use-cases/profiles/get-profile.use-case";
export { updateProfileUseCase } from "./use-cases/profiles/update-profile.use-case";
export { getDoctorFullProfileUseCase } from "./use-cases/profiles/get-doctor-full-profile.use-case";
export { getHomeStatsUseCase } from "./use-cases/profiles/get-home-stats.use-case";
export type { HomeStats } from "./use-cases/profiles/get-home-stats.use-case";
export { updateAcceptsOnlineUseCase } from "./use-cases/profiles/update-accepts-online.use-case";
export type {
  UpdateAcceptsOnlineInput,
  UpdateAcceptsOnlineOutput,
} from "./use-cases/profiles/update-accepts-online.use-case";

// ── Auth ──
export { registerUserUseCase } from "./use-cases/auth/register-user.use-case";
export type { RegisterOutput } from "./use-cases/auth/register-user.use-case";

// ── Audit ──
export { writeAuditLogUseCase } from "./use-cases/audit/write-audit-log.use-case";
export type { WriteAuditLogInput, AuditAction } from "./use-cases/audit/write-audit-log.use-case";

