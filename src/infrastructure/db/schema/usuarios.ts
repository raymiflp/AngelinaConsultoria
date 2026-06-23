import { pgTable, uuid, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    rol: varchar("rol", { length: 50 }).notNull(),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    telefono: varchar("telefono", { length: 20 }).notNull(),
    activo: boolean("activo").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Index for role-based queries (admin dashboard counts)
    rolIdx: index("usuarios_rol_idx").on(table.rol),
    // Index for active user queries
    activoIdx: index("usuarios_activo_idx").on(table.activo),
  }),
);
