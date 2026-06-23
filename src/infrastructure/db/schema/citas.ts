import { pgTable, uuid, timestamp, varchar, text, integer, numeric, index } from "drizzle-orm/pg-core";
import { doctores } from "./doctores";
import { pacientes } from "./pacientes";

export const citas = pgTable(
  "citas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctores.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "cascade" }),
    fechaHora: timestamp("fecha_hora").notNull(),
    estado: varchar("estado", { length: 20 }).notNull().default("PENDIENTE"),
    motivo: text("motivo").notNull(),
    duracionMinutos: integer("duracion_minutos").notNull().default(30),
    precio: numeric("precio"),
    notas: text("notas"),
    // ── video-calls: nullable, unused in MVP, reserved for future explicit room naming ──
    livekitRoomName: varchar("livekit_room_name", { length: 128 }),
    // ── modality-toggle: PRESENCIAL | ONLINE, required at runtime, default in Drizzle for dev ergonomics ──
    modalidad: varchar("modalidad", { length: 20 }).notNull().default("PRESENCIAL"),
  },
  (table) => ({
    // Index for the most frequent query: slots by doctor + date
    doctorFechaIdx: index("citas_doctor_fecha_idx").on(table.doctorId, table.fechaHora),
    // Index for status filtering (dashboard, counts)
    estadoIdx: index("citas_estado_idx").on(table.estado),
    // Index for patient lookup
    pacienteIdx: index("citas_paciente_idx").on(table.pacienteId),
  }),
);
