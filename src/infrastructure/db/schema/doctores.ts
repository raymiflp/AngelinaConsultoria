import { pgTable, uuid, varchar, text, numeric, boolean, integer, index } from "drizzle-orm/pg-core";
import { usuarios } from "./usuarios";

export const doctores = pgTable(
  "doctores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    numeroColegiado: varchar("numero_colegiado", { length: 50 }).notNull().unique(),
    especialidad: varchar("especialidad", { length: 255 }).notNull(),
    biografia: text("biografia"),
    precioConsulta: numeric("precio_consulta"),
    verificado: boolean("verificado").default(false).notNull(),
    calificacionMedia: numeric("calificacion_media"),
    fotoUrl: varchar("foto_url"),
    ubicacionConsulta: text("ubicacion_consulta"),
    añosExperiencia: integer("años_experiencia"),
    idiomas: text("idiomas").array(),
    telefonoConsulta: varchar("telefono_consulta"),
    // ── modality-toggle: opt-in flag for online consultations ──
    aceptaOnline: boolean("acepta_online").notNull().default(false),
  },
  (table) => ({
    // Index for FK lookups (citas → doctores)
    usuarioIdx: index("doctores_usuario_idx").on(table.usuarioId),
    // Index for specialty search (public listing page)
    especialidadIdx: index("doctores_especialidad_idx").on(table.especialidad),
  }),
);
