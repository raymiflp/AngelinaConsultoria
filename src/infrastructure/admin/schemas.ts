import { z } from "zod";

/**
 * ─── Admin-specific Zod Schemas ─────────────────────────────────────
 * These schemas are used by the adminRouter for doctor CRUD operations.
 */

/**
 * Schema for creating a new doctor (admin only).
 * Includes both Usuario fields (email, password, nombre, telefono)
 * and Doctor-specific fields (numeroColegiado, especialidad, etc.).
 */
export const createDoctorSchema = z.object({
  email: z.string().email("El email no es válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  telefono: z.string().min(1, "El teléfono es requerido").default(""),
  numeroColegiado: z.string().min(1, "El número de colegiado es requerido"),
  especialidad: z.string().min(1, "La especialidad es requerida"),
  precioConsulta: z.number().positive("El precio debe ser positivo").optional(),
  biografia: z.string().optional(),
  verificado: z.boolean().optional().default(false),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;

/**
 * Schema for updating an existing doctor (admin only).
 * All fields are optional — only provided fields are updated.
 * Email and role cannot be changed.
 */
export const updateDoctorSchema = z.object({
  doctorId: z.string().uuid("ID de doctor inválido"),
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres").optional(),
  telefono: z.string().optional(),
  numeroColegiado: z.string().min(1, "El número de colegiado es requerido").optional(),
  especialidad: z.string().min(1, "La especialidad es requerida").optional(),
  precioConsulta: z.number().positive("El precio debe ser positivo").optional(),
  biografia: z.string().optional(),
  verificado: z.boolean().optional(),
});

export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;

/**
 * Schema for listing doctors with pagination and search (admin only).
 */
export const listDoctoresSchema = z.object({
  busqueda: z.string().optional(),
  pagina: z.number().int().positive().optional().default(1),
  limite: z.number().int().positive().max(100).optional().default(10),
});

export type ListDoctoresInput = z.infer<typeof listDoctoresSchema>;

/**
 * Schema for getting a single doctor by ID (admin only).
 */
export const getDoctorSchema = z.object({
  doctorId: z.string().uuid("ID de doctor inválido"),
});

export type GetDoctorInput = z.infer<typeof getDoctorSchema>;

/**
 * Schema for deleting a doctor (admin only).
 * Supports soft delete (set activo=false) and hard delete (remove rows).
 */
export const deleteDoctorSchema = z.object({
  doctorId: z.string().uuid("ID de doctor inválido"),
  tipo: z.enum(["soft", "hard"]).optional().default("soft"),
});

export type DeleteDoctorInput = z.infer<typeof deleteDoctorSchema>;

/**
 * Response types for admin operations.
 */
export interface DoctorListItem {
  id: string;
  usuarioId: string;
  numeroColegiado: string;
  especialidad: string;
  biografia: string | null;
  precioConsulta: number | null;
  verificado: boolean;
  nombre: string;
  email: string;
  telefono: string;
  activo: boolean;
}

export interface DoctorDetail extends DoctorListItem {
  calificacionMedia: number | null;
}

export interface ListDoctoresResponse {
  doctores: DoctorListItem[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

export interface DashboardStats {
  totalDoctores: number;
  totalPacientes: number;
  totalCitas: number;
  citasPorEstado: Record<string, number>;
  registrosDiarios: Array<{ fecha: string; count: number }>;
  ingresos: number;
}
