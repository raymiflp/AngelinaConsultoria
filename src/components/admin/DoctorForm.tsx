"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

/**
 * Especialidades médicas disponibles.
 */
const ESPECIALIDADES = [
  "Cardiología",
  "Dermatología",
  "Endocrinología",
  "Gastroenterología",
  "Geriatría",
  "Ginecología",
  "Medicina General",
  "Neurología",
  "Oftalmología",
  "Oncología",
  "Pediatría",
  "Psiquiatría",
  "Reumatología",
  "Traumatología",
  "Urología",
] as const;

/**
 * Schema for the doctor form.
 * Used for both create and edit modes.
 */
/**
 * Doctor form values type — defined manually to match what the
 * form and resolver expect (avoids z.input / z.output mismatch).
 */
export interface DoctorFormValues {
  nombre: string;
  email: string;
  password: string;
  telefono: string;
  especialidad: string;
  numeroColegiado: string;
  precioConsulta?: string;
  biografia?: string;
  verificado: boolean;
}

/**
 * Form schema for doctor create/edit.
 * Password is required for create, optional for edit (leave blank to keep).
 */
const doctorFormSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("El email no es válido"),
  password: z.string().optional().default(""),
  telefono: z.string().min(1, "El teléfono es requerido"),
  especialidad: z.string().min(1, "Selecciona una especialidad"),
  numeroColegiado: z.string().min(1, "El número de colegiado es requerido"),
  precioConsulta: z.string().optional(),
  biografia: z.string().optional(),
  verificado: z.boolean(),
});

interface DoctorFormProps {
  /** Datos iniciales para modo edición */
  initialData?: {
    id: string;
    nombre: string;
    email: string;
    telefono: string;
    especialidad: string;
    numeroColegiado: string;
    precioConsulta: number | null;
    biografia: string | null;
    verificado: boolean;
  };
  /** Callback al enviar el formulario */
  onSubmit: (values: DoctorFormValues) => Promise<void>;
  /** Indica si el formulario está enviando */
  isSubmitting: boolean;
  /** Modo del formulario */
  mode: "create" | "edit";
}

/**
 * DoctorForm — formulario reutilizable para crear/editar doctores.
 *
 * Usa react-hook-form con Zod para validación.
 * En modo edit, el email se muestra como texto sin editar.
 */
export function DoctorForm({
  initialData,
  onSubmit,
  isSubmitting,
  mode,
}: DoctorFormProps) {
  const router = useRouter();

  const form = useForm<DoctorFormValues>({
    resolver: zodResolver(doctorFormSchema) as any,
    defaultValues: {
      nombre: initialData?.nombre ?? "",
      email: initialData?.email ?? "",
      password: "",
      telefono: initialData?.telefono ?? "",
      especialidad: initialData?.especialidad ?? "",
      numeroColegiado: initialData?.numeroColegiado ?? "",
      precioConsulta:
        initialData?.precioConsulta != null
          ? String(initialData.precioConsulta)
          : "",
      biografia: initialData?.biografia ?? "",
      verificado: initialData?.verificado ?? false,
    },
  });

  const handleSubmit = async (values: DoctorFormValues) => {
    await onSubmit(values);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Nombre */}
          <FormField
            control={form.control}
            name="nombre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre completo</FormLabel>
                <FormControl>
                  <Input placeholder="Dr. Juan Pérez" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Email */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="doctor@example.com"
                    {...field}
                    disabled={mode === "edit"}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Password (only for create) */}
          {mode === "create" && (
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Mínimo 8 caracteres"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Teléfono */}
          <FormField
            control={form.control}
            name="telefono"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <FormControl>
                  <Input placeholder="+34 600 000 000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Especialidad */}
          <FormField
            control={form.control}
            name="especialidad"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Especialidad</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una especialidad" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ESPECIALIDADES.map((esp) => (
                      <SelectItem key={esp} value={esp}>
                        {esp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Número de colegiado */}
          <FormField
            control={form.control}
            name="numeroColegiado"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nº Colegiado</FormLabel>
                <FormControl>
                  <Input placeholder="12345" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Precio consulta */}
          <FormField
            control={form.control}
            name="precioConsulta"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Precio consulta (€)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="50.00"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Verificado */}
          <FormField
            control={form.control}
            name="verificado"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Verificado</FormLabel>
                  <p className="text-sm text-muted-foreground">
                    Marca al doctor como verificado
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {/* Biografía */}
        <FormField
          control={form.control}
          name="biografia"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Biografía</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Breve descripción del doctor..."
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Acciones */}
        <div className="flex items-center justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/doctores")}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === "create" ? "Crear doctor" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
