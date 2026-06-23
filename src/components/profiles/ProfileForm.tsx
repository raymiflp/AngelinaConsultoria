"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { api } from "@/infrastructure/api";
import type { ProfileResponse } from "@/infrastructure/profiles/schemas";

// ─── Specialties list ─────────────────────────────────────────────────

const ESPECIALIDADES = [
  "Medicina general",
  "Cardiología",
  "Dermatología",
  "Pediatría",
  "Ginecología",
  "Neurología",
  "Traumatología",
  "Oftalmología",
  "Otorrinolaringología",
  "Psiquiatría",
  "Endocrinología",
  "Gastroenterología",
  "Neumología",
  "Urología",
  "Reumatología",
  "Oncología",
  "Hematología",
  "Nefrología",
  "Medicina interna",
  "Medicina deportiva",
  "Nutrición",
  "Fisioterapia",
  "Psicología",
] as const;

// ─── Blood types ──────────────────────────────────────────────────────

const GRUPOS_SANGUINEOS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

// ─── Props ────────────────────────────────────────────────────────────

interface ProfileFormProps {
  profile: ProfileResponse;
  onCancel: () => void;
}

// ─── Flat form schema (all fields) ────────────────────────────────────

const profileFormSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  telefono: z.string().optional(),
  // Doctor fields (required when rol is DOCTOR)
  numeroColegiado: z.string().optional(),
  especialidad: z.string().optional(),
  biografia: z.string().optional(),
  precioConsulta: z.number().positive().optional(),
  // Patient fields (required when rol is PACIENTE)
  fechaNacimiento: z.string().optional(),
  direccionCalle: z.string().optional(),
  direccionCiudad: z.string().optional(),
  direccionProvincia: z.string().optional(),
  direccionCodigoPostal: z.string().optional(),
  direccionPais: z.string().optional(),
  alergiasInput: z.string().optional(),
  grupoSanguineo: z.string().optional(),
  notasMedicas: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

// ─── Component ────────────────────────────────────────────────────────

export function ProfileForm({ profile, onCancel }: ProfileFormProps) {
  const utils = api.useUtils();
  const isDoctor = profile.rol === "DOCTOR";

  const updateMutation = api.profiles.updateMyProfile.useMutation({
    onSuccess: () => {
      utils.profiles.getMyProfile.invalidate();
      toast.success("Perfil actualizado correctamente");
      onCancel();
    },
    onError: (error) => {
      toast.error(error.message ?? "Error al actualizar el perfil");
    },
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      nombre: profile.nombre,
      telefono: profile.telefono || "",
      // Doctor defaults
      numeroColegiado: profile.doctor?.numeroColegiado ?? "",
      especialidad: profile.doctor?.especialidad ?? "",
      biografia: profile.doctor?.biografia ?? "",
      precioConsulta: profile.doctor?.precioConsulta ?? undefined,
      // Patient defaults
      fechaNacimiento: profile.paciente?.fechaNacimiento ?? "",
      direccionCalle: profile.paciente?.direccionCalle ?? "",
      direccionCiudad: profile.paciente?.direccionCiudad ?? "",
      direccionProvincia: profile.paciente?.direccionProvincia ?? "",
      direccionCodigoPostal: profile.paciente?.direccionCodigoPostal ?? "",
      direccionPais: profile.paciente?.direccionPais ?? "España",
      alergiasInput: profile.paciente?.alergias?.join(", ") ?? "",
      grupoSanguineo: profile.paciente?.grupoSanguineo ?? "",
      notasMedicas: profile.paciente?.notasMedicas ?? "",
    },
  });

  function onSubmit(values: ProfileFormValues) {
    if (isDoctor) {
      updateMutation.mutate({
        rol: "DOCTOR",
        nombre: values.nombre,
        telefono: values.telefono,
        numeroColegiado: values.numeroColegiado ?? "",
        especialidad: values.especialidad ?? "",
        biografia: values.biografia,
        precioConsulta: values.precioConsulta,
      } as any);
    } else {
      updateMutation.mutate({
        rol: "PACIENTE",
        nombre: values.nombre,
        telefono: values.telefono,
        fechaNacimiento: values.fechaNacimiento ?? "",
        direccion: {
          calle: values.direccionCalle ?? "",
          ciudad: values.direccionCiudad ?? "",
          provincia: values.direccionProvincia ?? "",
          codigoPostal: values.direccionCodigoPostal ?? "",
          pais: values.direccionPais ?? "España",
        },
        alergias: values.alergiasInput
          ? values.alergiasInput.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        grupoSanguineo: values.grupoSanguineo || undefined,
        notasMedicas: values.notasMedicas,
      } as any);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* ── Shared fields ─────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre completo</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="telefono"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Teléfono</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Doctor-specific fields ────────────────────────────────── */}
        {isDoctor && (
          <>
            <FormField
              control={form.control}
              name="numeroColegiado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de colegiado</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <FormField
              control={form.control}
              name="biografia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Biografía</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Describe tu experiencia y formación"
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="precioConsulta"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio consulta (€)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val ? Number(val) : undefined);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {/* ── Patient-specific fields ───────────────────────────────── */}
        {!isDoctor && (
          <>
            <FormField
              control={form.control}
              name="fechaNacimiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de nacimiento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Address fields ──────────────────────────────────── */}
            <fieldset className="space-y-4 rounded-lg border p-4">
              <legend className="text-sm font-medium text-muted-foreground">
                Dirección
              </legend>

              <FormField
                control={form.control}
                name="direccionCalle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Calle</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="direccionCiudad"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ciudad</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="direccionProvincia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provincia</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="direccionCodigoPostal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código postal</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={5} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="direccionPais"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>País</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </fieldset>

            {/* ── Alergias ────────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="alergiasInput"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alergias</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Separa las alergias con comas"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Grupo sanguíneo ──────────────────────────────────── */}
            <FormField
              control={form.control}
              name="grupoSanguineo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grupo sanguíneo</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona grupo sanguíneo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GRUPOS_SANGUINEOS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Notas médicas ────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="notasMedicas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas médicas</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Información adicional relevante"
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {/* ── Actions ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending && (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            )}
            Guardar cambios
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={updateMutation.isPending}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
