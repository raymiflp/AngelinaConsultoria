"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/infrastructure/api";
import { DoctorForm, type DoctorFormValues } from "@/components/admin/DoctorForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertCircle,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import Link from "next/link";

/**
 * Edit doctor page.
 *
 * Loads doctor data and pre-fills the DoctorForm.
 * Supports update and delete operations.
 * Shows 404-equivalent error for non-existent doctors.
 */
export default function EditarDoctorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    data: doctor,
    isLoading,
    isError: isLoadError,
    error: loadError,
    refetch,
  } = api.admin.getDoctor.useQuery({ doctorId: id }, { retry: 1 });

  const updateMutation = api.admin.updateDoctor.useMutation();
  const deleteMutation = api.admin.deleteDoctor.useMutation();

  const handleSubmit = async (values: DoctorFormValues) => {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        doctorId: id,
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
      router.push("/dashboard/doctores");
    } catch (err) {
      if (err instanceof TRPCClientError) {
        setError(err.message);
      } else {
        setError("Error inesperado al actualizar el doctor");
      }
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `¿Estás seguro de eliminar a ${doctor?.nombre}? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ doctorId: id, tipo: "soft" });
      router.push("/dashboard/doctores");
    } catch (err) {
      if (err instanceof TRPCClientError) {
        setError(err.message);
      } else {
        setError("Error inesperado al eliminar el doctor");
      }
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error / Not found state
  if (isLoadError) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/doctores">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Editar Doctor</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Doctor no encontrado</AlertTitle>
          <AlertDescription>
            {loadError?.message ?? "El doctor solicitado no existe o ha sido eliminado."}
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/dashboard/doctores">
            Volver a la lista
          </Link>
        </Button>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/doctores">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Editar Doctor</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Doctor no encontrado</AlertTitle>
          <AlertDescription>
            El doctor solicitado no existe o ha sido eliminado.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/dashboard/doctores">
            Volver a la lista
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/doctores">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Editar Doctor
            </h1>
            <p className="text-muted-foreground">
              {doctor.nombre} — {doctor.especialidad}
            </p>
          </div>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="mr-2 size-4" />
          {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <div className="rounded-xl border p-6">
        <DoctorForm
          mode="edit"
          initialData={{
            id: doctor.id,
            nombre: doctor.nombre,
            email: doctor.email,
            telefono: doctor.telefono,
            especialidad: doctor.especialidad,
            numeroColegiado: doctor.numeroColegiado,
            precioConsulta: doctor.precioConsulta,
            biografia: doctor.biografia,
            verificado: doctor.verificado,
          }}
          onSubmit={handleSubmit}
          isSubmitting={updateMutation.isPending}
        />
      </div>
    </div>
  );
}
