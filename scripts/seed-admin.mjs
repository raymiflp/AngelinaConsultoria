/**
 * Seed script for admin user.
 *
 * Usage: node scripts/seed-admin.mjs
 *
 * Reads DATABASE_URL from environment, connects directly to PostgreSQL,
 * and creates an admin user if one does not already exist.
 * Idempotent — safe to run multiple times.
 */

import postgres from "postgres";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

const ADMIN_EMAIL = "admin@angelinaconsultoria.com";
const ADMIN_PASSWORD = "Admin123!";
const ADMIN_NOMBRE = "Administrador";
const ADMIN_TELEFONO = "+34 600 000 000";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    // Check if admin already exists
    const existing = await sql`
      SELECT id, email FROM usuarios WHERE email = ${ADMIN_EMAIL} LIMIT 1
    `;

    if (existing.length > 0) {
      console.log(
        `ℹ️  Admin user already exists: ${existing[0].email} (id: ${existing[0].id})`,
      );
      console.log("✅ Seed skipped — admin already present (idempotent).");
      return;
    }

    // Hash password
    console.log("🔐 Hashing password...");
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

    // Insert admin user
    const now = new Date();
    const [newUser] = await sql`
      INSERT INTO usuarios (email, password_hash, rol, nombre, telefono, activo, created_at, updated_at)
      VALUES (
        ${ADMIN_EMAIL},
        ${passwordHash},
        'ADMIN',
        ${ADMIN_NOMBRE},
        ${ADMIN_TELEFONO},
        true,
        ${now},
        ${now}
      )
      RETURNING id, email, rol
    `;

    console.log(`✅ Admin user created successfully:`);
    console.log(`   ID:    ${newUser.id}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Rol:   ${newUser.rol}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
  } catch (error) {
    console.error("❌ Error seeding admin user:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
