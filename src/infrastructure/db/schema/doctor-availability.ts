import { pgTable, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";
import { doctores } from "./doctores";

/**
 * Doctor availability table — stores weekly schedule as a JSON column.
 *
 * Column `disponibilidad` stores a record of day-of-week keys mapped to
 * time-range arrays, e.g.:
 *   { "lunes": [{ "inicio": "09:00", "fin": "12:00" }] }
 *
 * A unique constraint on `doctorId` ensures at most one row per doctor.
 */
export const doctorDisponibilidad = pgTable("doctor_disponibilidad", {
  id: uuid("id").defaultRandom().primaryKey(),
  doctorId: uuid("doctor_id")
    .notNull()
    .unique()
    .references(() => doctores.id, { onDelete: "cascade" }),
  disponibilidad: jsonb("disponibilidad").notNull().default("{}"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
