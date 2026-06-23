import { pgTable, uuid, varchar, boolean, timestamp, foreignKey } from "drizzle-orm/pg-core";
import { usuarios } from "./usuarios";

export const consentimientos = pgTable(
  "consentimientos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    tipo: varchar("tipo", { length: 100 }).notNull(),
    version: varchar("version", { length: 20 }).notNull(),
    aceptado: boolean("aceptado").notNull(),
    fechaAceptacion: timestamp("fecha_aceptacion"),
    fechaExpiracion: timestamp("fecha_expiracion"),
  },
);
