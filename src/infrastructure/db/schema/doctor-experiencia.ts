import { pgTable, uuid, varchar, text, integer, date, timestamp, index } from "drizzle-orm/pg-core";
import { doctores } from "./doctores";

/**
 * Doctor experience table — stores education and work history entries.
 *
 * Each row represents either an education entry (tipo="education") or a
 * work entry (tipo="work"). Entries are ordered by `orden` ASC, then
 * `fecha_inicio` DESC.
 */
export const doctorExperiencia = pgTable(
  "doctor_experiencia",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctores.id, { onDelete: "cascade" }),
    tipo: varchar("tipo", { length: 20 }).notNull(),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    institucion: varchar("institucion", { length: 255 }).notNull(),
    fechaInicio: date("fecha_inicio").notNull(),
    fechaFin: date("fecha_fin"),
    descripcion: text("descripcion"),
    orden: integer("orden").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    doctorIdx: index("doctor_experiencia_doctor_idx").on(table.doctorId),
  }),
);
