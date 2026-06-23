import { TRPCError } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import { hash } from "@/infrastructure/auth/password";
import { signIn, auth } from "@/auth";
import type { RegisterInput } from "@/infrastructure/auth/schemas";
import { captureEvent } from "@/infrastructure/analytics";
import { EVENTS } from "@/infrastructure/analytics/events";

export interface RegisterOutput {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  expires: string;
}

/**
 * Registers a new PACIENTE user.
 *
 * Creates both the usuario and a minimal paciente record in a single
 * transaction. On success, establishes a session so the user is
 * immediately logged in.
 */
export async function registerUserUseCase(
  db: NodePgDatabase<typeof schema>,
  input: RegisterInput,
): Promise<RegisterOutput> {
  const { email, password, nombre, telefono } = input;

  // Check email uniqueness
  const existing = await db
    .select({ id: schema.usuarios.id })
    .from(schema.usuarios)
    .where(eq(schema.usuarios.email, email))
    .then((rows) => rows[0] ?? null);

  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "El email ya está registrado",
    });
  }

  const passwordHash = await hash(password);

  // Transaction: create usuario + paciente record atomically
  let newUserId: string | undefined;
  await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(schema.usuarios)
      .values({
        email,
        passwordHash,
        nombre,
        telefono: telefono ?? "",
        rol: "PACIENTE",
        activo: true,
      })
      .returning();

    if (!newUser) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Error al crear el usuario",
      });
    }

    newUserId = newUser.id;

    // Create minimal paciente record — user fills details later
    await tx.insert(schema.pacientes).values({
      usuarioId: newUser.id,
      alergias: [],
    });
  });

  // Fire-and-forget analytics event — never blocks or throws
  if (newUserId) {
    captureEvent({
      distinctId: newUserId,
      event: EVENTS.USER_REGISTERED,
      properties: { role: "PACIENTE", email },
    });
  }

  // Establish a session immediately after registration
  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
  } catch {
    // Ignore signIn errors here — user was created successfully
  }

  const session = await auth();

  return {
    user: {
      id: session?.user?.id ?? "",
      email: session?.user?.email ?? email,
      name: session?.user?.name ?? nombre,
      role: (session?.user as { role?: string })?.role ?? "PACIENTE",
    },
    expires: session?.expires ?? "",
  };
}
