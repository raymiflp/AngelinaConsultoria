import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { doctores } from "./doctores";

/**
 * Doctor conditions table — stores medical conditions/diseases that a
 * doctor treats, rendered as a tag cloud on the profile page.
 */
export const doctorCondiciones = pgTable(
  "doctor_condiciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctores.id, { onDelete: "cascade" }),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    doctorIdx: index("doctor_condiciones_doctor_idx").on(table.doctorId),
  }),
);
