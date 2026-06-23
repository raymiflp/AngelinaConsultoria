import { z } from "zod";

/**
 * ─── Doctor Update Schema ────────────────────────────────────────────
 * Fields that a DOCTOR user can update on their own profile.
 */
export const doctorUpdateSchema = z.object({
  numeroColegiado: z
    .string()
    .min(1, "El número de colegiado es requerido"),
  especialidad: z
    .string()
    .min(1, "La especialidad es requerida"),
  biografia: z
    .string()
    .optional(),
  precioConsulta: z
    .number()
    .positive("El precio debe ser un número positivo")
    .optional(),
});

export type DoctorUpdateInput = z.infer<typeof doctorUpdateSchema>;

/**
 * ─── Paciente Update Schema ──────────────────────────────────────────
 * Fields that a PACIENTE user can update on their own profile.
 */
export const direccionSchema = z.object({
  calle: z.string().min(1, "La calle es requerida"),
  ciudad: z.string().min(1, "La ciudad es requerida"),
  provincia: z.string().min(1, "La provincia es requerida"),
  codigoPostal: z
    .string()
    .length(5, "El código postal debe tener 5 dígitos"),
  pais: z.string().min(1, "El país es requerido").default("España"),
});

export type DireccionInput = z.infer<typeof direccionSchema>;

export const pacienteUpdateSchema = z.object({
  fechaNacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato YYYY-MM-DD"),
  direccion: direccionSchema,
  alergias: z.array(z.string()).default([]),
  grupoSanguineo: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
    .optional(),
  notasMedicas: z.string().optional(),
});

export type PacienteUpdateInput = z.infer<typeof pacienteUpdateSchema>;

/**
 * ─── Discriminated Union for Profile Update ──────────────────────────
 * The `rol` field determines which set of fields are validated.
 * Common Usuario fields (nombre, telefono) are included in both branches.
 */
const commonProfileFields = {
  nombre: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres"),
  telefono: z
    .string()
    .optional(),
};

export const updateProfileSchema = z.discriminatedUnion("rol", [
  z.object({
    rol: z.literal("DOCTOR"),
    ...commonProfileFields,
    ...doctorUpdateSchema.shape,
  }),
  z.object({
    rol: z.literal("PACIENTE"),
    ...commonProfileFields,
    ...pacienteUpdateSchema.shape,
  }),
]);

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * ─── Response Types ──────────────────────────────────────────────────
 * Shapes returned by the tRPC procedures.
 */

export interface ProfileDoctorExtension {
  id: string;
  numeroColegiado: string;
  especialidad: string;
  biografia: string | null;
  precioConsulta: number | null;
  verificado: boolean;
  calificacionMedia: number | null;
  aceptaOnline: boolean;
}

export interface ProfilePacienteExtension {
  id: string;
  fechaNacimiento: string | null;
  direccionCalle: string | null;
  direccionCiudad: string | null;
  direccionProvincia: string | null;
  direccionCodigoPostal: string | null;
  direccionPais: string | null;
  alergias: string[];
  grupoSanguineo: string | null;
  notasMedicas: string | null;
}

export interface ProfileResponse {
  id: string;
  email: string;
  nombre: string;
  telefono: string;
  rol: "DOCTOR" | "PACIENTE";
  activo: boolean;
  doctor?: ProfileDoctorExtension | null;
  paciente?: ProfilePacienteExtension | null;
}

export interface DoctorPublicResponse {
  id: string;
  nombre: string;
  email: string;
  especialidad: string;
  biografia: string | null;
  precioConsulta: number | null;
  calificacionMedia: number | null;
  aceptaOnline: boolean;
}

/**
 * ─── Doctor Profile Page — Response Types ─────────────────────────────
 * New types for the rich doctor profile page (Phase 1).
 * These do NOT replace DoctorPublicResponse.
 */

export interface DoctorExperienceResponse {
  id: string;
  tipo: "education" | "work";
  titulo: string;
  institucion: string;
  fechaInicio: string;
  fechaFin: string | null;
  descripcion: string | null;
  orden: number;
}

export interface DoctorServiceResponse {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  duracionMinutos: number | null;
  activo: boolean;
  orden: number;
}

export interface DoctorConditionResponse {
  id: string;
  nombre: string;
}

export interface DoctorFullProfileResponse {
  id: string;
  nombre: string;
  email: string;
  especialidad: string;
  biografia: string | null;
  precioConsulta: number | null;
  calificacionMedia: number | null;
  fotoUrl: string | null;
  ubicacionConsulta: string | null;
  añosExperiencia: number | null;
  idiomas: string[];
  telefonoConsulta: string | null;
  numeroColegiado: string;
  totalReviews: number;
  aceptaOnline: boolean;
  experience: DoctorExperienceResponse[];
  services: DoctorServiceResponse[];
  conditions: DoctorConditionResponse[];
}

/**
 * ─── Input Schemas ────────────────────────────────────────────────────
 */

export const getDoctorFullProfileSchema = z.object({
  doctorId: z.string().uuid(),
});

export const getDoctorServicesSchema = z.object({
  doctorId: z.string().uuid(),
});
