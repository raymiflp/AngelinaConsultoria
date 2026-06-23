// Table schemas
export { usuarios } from "./usuarios";
export { doctores } from "./doctores";
export { pacientes } from "./pacientes";
export { citas } from "./citas";
export { auditLogs } from "./audit-logs";
export { consentimientos } from "./consentimientos";
export { doctorDisponibilidad } from "./doctor-availability";
export { doctorExperiencia } from "./doctor-experiencia";
export { doctorServicios } from "./doctor-servicios";
export { doctorCondiciones } from "./doctor-condiciones";

// Relations
import { relations } from "drizzle-orm";
import { usuarios } from "./usuarios";
import { doctores } from "./doctores";
import { pacientes } from "./pacientes";
import { citas } from "./citas";
import { auditLogs } from "./audit-logs";
import { consentimientos } from "./consentimientos";
import { doctorDisponibilidad } from "./doctor-availability";
import { doctorExperiencia } from "./doctor-experiencia";
import { doctorServicios } from "./doctor-servicios";
import { doctorCondiciones } from "./doctor-condiciones";

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  doctores: many(doctores),
  pacientes: many(pacientes),
  auditLogs: many(auditLogs),
  consentimientos: many(consentimientos),
}));

export const doctoresRelations = relations(doctores, ({ one, many }) => ({
  usuario: one(usuarios, {
    fields: [doctores.usuarioId],
    references: [usuarios.id],
  }),
  citas: many(citas),
  disponibilidad: one(doctorDisponibilidad, {
    fields: [doctores.id],
    references: [doctorDisponibilidad.doctorId],
  }),
  experiencia: many(doctorExperiencia),
  servicios: many(doctorServicios),
  condiciones: many(doctorCondiciones),
}));

export const pacientesRelations = relations(pacientes, ({ one, many }) => ({
  usuario: one(usuarios, {
    fields: [pacientes.usuarioId],
    references: [usuarios.id],
  }),
  citas: many(citas),
}));

export const citasRelations = relations(citas, ({ one }) => ({
  doctor: one(doctores, {
    fields: [citas.doctorId],
    references: [doctores.id],
  }),
  paciente: one(pacientes, {
    fields: [citas.pacienteId],
    references: [pacientes.id],
  }),
}));

export const doctorDisponibilidadRelations = relations(
  doctorDisponibilidad,
  ({ one }) => ({
    doctor: one(doctores, {
      fields: [doctorDisponibilidad.doctorId],
      references: [doctores.id],
    }),
  }),
);

export const doctorExperienciaRelations = relations(
  doctorExperiencia,
  ({ one }) => ({
    doctor: one(doctores, {
      fields: [doctorExperiencia.doctorId],
      references: [doctores.id],
    }),
  }),
);

export const doctorServiciosRelations = relations(
  doctorServicios,
  ({ one }) => ({
    doctor: one(doctores, {
      fields: [doctorServicios.doctorId],
      references: [doctores.id],
    }),
  }),
);

export const doctorCondicionesRelations = relations(
  doctorCondiciones,
  ({ one }) => ({
    doctor: one(doctores, {
      fields: [doctorCondiciones.doctorId],
      references: [doctores.id],
    }),
  }),
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [auditLogs.usuarioId],
    references: [usuarios.id],
  }),
}));

export const consentimientosRelations = relations(consentimientos, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [consentimientos.usuarioId],
    references: [usuarios.id],
  }),
}));
