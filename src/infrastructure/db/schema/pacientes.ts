import { pgTable, uuid, varchar, date, text } from "drizzle-orm/pg-core";
import { usuarios } from "./usuarios";

export const pacientes = pgTable(
  "pacientes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    fechaNacimiento: date("fecha_nacimiento"),
    direccionCalle: varchar("direccion_calle", { length: 255 }),
    direccionCiudad: varchar("direccion_ciudad", { length: 255 }),
    direccionProvincia: varchar("direccion_provincia", { length: 255 }),
    direccionCodigoPostal: varchar("direccion_codigo_postal", { length: 5 }),
    direccionPais: varchar("direccion_pais", { length: 100 }).default("España"),
    alergias: text("alergias").array().default([]).notNull(),
    grupoSanguineo: varchar("grupo_sanguineo", { length: 5 }),
    notasMedicas: text("notas_medicas"),
  },
);
