import { pgTable, uuid, varchar, text, numeric, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { doctores } from "./doctores";

/**
 * Doctor services table — stores the services offered by a doctor with pricing.
 *
 * Only active services (activo=true) are shown on the public profile page.
 * Services are ordered by `orden` ASC.
 */
export const doctorServicios = pgTable(
  "doctor_servicios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctores.id, { onDelete: "cascade" }),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    descripcion: text("descripcion"),
    precio: numeric("precio").notNull(),
    duracionMinutos: integer("duracion_minutos"),
    activo: boolean("activo").notNull().default(true),
    orden: integer("orden").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    doctorIdx: index("doctor_servicios_doctor_idx").on(table.doctorId),
  }),
);
