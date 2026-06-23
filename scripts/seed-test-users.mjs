/**
 * Seed script for test users of each role.
 *
 * Usage: node scripts/seed-test-users.mjs
 *
 * Creates one user per role (DOCTOR, PACIENTE, ADMIN) if not exists.
 * ADMIN is created by seed-admin.mjs — this script only creates DOCTOR + PACIENTE.
 * Idempotent — safe to run multiple times.
 */

import postgres from "postgres";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

const USERS = [
  {
    email: "doctor@test.com",
    password: "Doctor123!",
    nombre: "Dr. Martínez",
    telefono: "+34 611 111 111",
    rol: "DOCTOR",
    doctor: {
      numero_colegiado: "28/1234567",
      especialidad: "Cardiología",
      precio_consulta: "80.00",
      verificado: true,
    },
  },
  {
    email: "paciente@test.com",
    password: "Paciente123!",
    nombre: "María López",
    telefono: "+34 622 222 222",
    rol: "PACIENTE",
    paciente: {
      fecha_nacimiento: "1990-05-15",
      direccion_calle: "Calle Mayor 10",
      direccion_ciudad: "Madrid",
      direccion_provincia: "Madrid",
      direccion_codigo_postal: "28001",
      direccion_pais: "España",
    },
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    for (const user of USERS) {
      // Check if user already exists
      const existing = await sql`
        SELECT id, email FROM usuarios WHERE email = ${user.email} LIMIT 1
      `;

      if (existing.length > 0) {
        console.log(`ℹ️  ${user.rol} already exists: ${user.email}`);

        // Ensure existing doctors have default availability
        if (user.rol === "DOCTOR") {
          const [doctorRow] = await sql`
            SELECT id FROM doctores WHERE usuario_id = ${existing[0].id} LIMIT 1
          `;
          if (doctorRow) {
            const availExists = await sql`
              SELECT id FROM doctor_disponibilidad WHERE doctor_id = ${doctorRow.id} LIMIT 1
            `;
            if (availExists.length === 0) {
              const disponibilidad = {
                lunes: [{ inicio: "09:00", fin: "14:00" }],
                martes: [{ inicio: "09:00", fin: "14:00" }],
                miercoles: [{ inicio: "09:00", fin: "14:00" }],
                jueves: [{ inicio: "09:00", fin: "14:00" }],
                viernes: [{ inicio: "09:00", fin: "14:00" }],
              };
              await sql`
                INSERT INTO doctor_disponibilidad (doctor_id, disponibilidad)
                VALUES (${doctorRow.id}, ${JSON.stringify(disponibilidad)})
              `;
              console.log(`   ✅ Added default availability (09:00-14:00 Mon-Fri)`);
            }
          }
        }

        continue;
      }

      // Hash password
      console.log(`🔐 Creating ${user.rol}: ${user.email}...`);
      const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
      const now = new Date();

      // Insert usuario
      const [newUser] = await sql`
        INSERT INTO usuarios (email, password_hash, rol, nombre, telefono, activo, created_at, updated_at)
        VALUES (${user.email}, ${passwordHash}, ${user.rol}, ${user.nombre}, ${user.telefono}, true, ${now}, ${now})
        RETURNING id, email, rol
      `;

      // Insert role-specific extension (no created_at/updated_at in doctores/pacientes tables)
      if (user.rol === "DOCTOR" && user.doctor) {
        const [newDoctor] = await sql`
          INSERT INTO doctores (usuario_id, numero_colegiado, especialidad, precio_consulta, verificado)
          VALUES (${newUser.id}, ${user.doctor.numero_colegiado}, ${user.doctor.especialidad}, ${user.doctor.precio_consulta}, ${user.doctor.verificado})
          RETURNING id
        `;

        // Add default weekly availability for the test doctor
        const disponibilidad = {
          lunes: [{ inicio: "09:00", fin: "14:00" }],
          martes: [{ inicio: "09:00", fin: "14:00" }],
          miercoles: [{ inicio: "09:00", fin: "14:00" }],
          jueves: [{ inicio: "09:00", fin: "14:00" }],
          viernes: [{ inicio: "09:00", fin: "14:00" }],
        };

        const existingAvail = await sql`
          SELECT id FROM doctor_disponibilidad WHERE doctor_id = ${newDoctor.id} LIMIT 1
        `;

        if (existingAvail.length === 0) {
          await sql`
            INSERT INTO doctor_disponibilidad (doctor_id, disponibilidad)
            VALUES (${newDoctor.id}, ${JSON.stringify(disponibilidad)})
          `;
          console.log(`   ✅ Default availability (09:00-14:00 Mon-Fri)`);
        }
      }

      if (user.rol === "PACIENTE" && user.paciente) {
        await sql`
          INSERT INTO pacientes (usuario_id, fecha_nacimiento, direccion_calle, direccion_ciudad, direccion_provincia, direccion_codigo_postal, direccion_pais)
          VALUES (${newUser.id}, ${user.paciente.fecha_nacimiento}, ${user.paciente.direccion_calle}, ${user.paciente.direccion_ciudad}, ${user.paciente.direccion_provincia}, ${user.paciente.direccion_codigo_postal}, ${user.paciente.direccion_pais})
        `;
      }

      console.log(`✅ ${user.rol} created: ${user.email} / ${user.password}`);
    }
  } catch (error) {
    console.error("❌ Error seeding test users:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
