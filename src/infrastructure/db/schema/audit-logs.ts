import { pgTable, uuid, varchar, text, jsonb, timestamp, foreignKey } from "drizzle-orm/pg-core";
import { usuarios } from "./usuarios";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // ── livekit-webhooks: nullable so system actors (e.g. LiveKit server)
    // can write audit rows without attributing them to a human usuario.
    // The FK and onDelete: "cascade" stay — existing human-actor rows are
    // unaffected; new system-actor rows use null.
    usuarioId: uuid("usuario_id").references(() => usuarios.id, {
      onDelete: "cascade",
    }),
    accion: varchar("accion", { length: 100 }).notNull(),
    entidadAfectada: varchar("entidad_afectada", { length: 100 }).notNull(),
    entidadId: varchar("entidad_id", { length: 100 }).notNull(),
    detalles: jsonb("detalles"),
    direccionIP: varchar("direccion_ip", { length: 45 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
