"use client";

import { useRouter } from "next/navigation";
import { api } from "@/infrastructure/api";
import { DoctorForm, type DoctorFormValues } from "@/components/admin/DoctorForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TRPCClientError } from "@trpc/client";

/**
 * Create doctor page.
 *
 * Renders the DoctorForm in create mode.
 * On success, redirects to the doctor list page.
 * Displays inline error for duplicate email/colegiado.
 */
export default function NuevoDoctorPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const createMutation = api.admin.createDoctor.useMutation();

  const handleSubmit = async (values: DoctorFormValues) => {
    setError(null);
    try {
      const result = await createMutation.mutateAsync({
        email: values.email,
        password: values.password,
        nombre: values.nombre,
        telefono: values.telefono,
        especialidad: values.especialidad,
        numeroColegiado: values.numeroColegiado,
        precioConsulta: values.precioConsulta
          ? parseFloat(values.precioConsulta)
          : undefined,
        biografia: values.biografia || undefined,
        verificado: values.verificado,
      });
      router.push(`/dashboard/doctores/${result.id}`);
    } catch (err) {
      if (err instanceof TRPCClientError) {
        setError(err.message);
      } else {
        setError("Error inesperado al crear el doctor");
      }
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/dashboard/doctores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a la lista
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo Doctor</h1>
        <p className="text-muted-foreground">
          Completa el formulario para registrar un nuevo doctor
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border p-6">
        <DoctorForm
          mode="create"
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
        />
      </div>
    </div>
  );
}
