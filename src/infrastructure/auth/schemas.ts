import { z } from "zod";

/**
 * Schema for user registration.
 *
 * - `email`: must be a valid email address
 * - `password`: minimum 8 characters, at least one uppercase letter and one digit
 * - `nombre`: minimum 2 characters
 * - `telefono`: optional, validated as a Spanish phone number (starts with +34 or 6/7/9)
 */
export const registerSchema = z.object({
  email: z
    .string()
    .email("El email no es válido")
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "La contraseña debe contener al menos una mayúscula")
    .regex(/[0-9]/, "La contraseña debe contener al menos un número"),
  nombre: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres"),
  telefono: z
    .string()
    .regex(
      /^(\+34\d{9}|\d{9})$/,
      "El teléfono debe ser un número español válido (9 dígitos, opcional +34)",
    )
    .optional(),
});

/**
 * Schema for login credentials.
 */
export const loginSchema = z.object({
  email: z.string().email("El email no es válido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
