"use client";

import { useState } from "react";
import { api } from "@/infrastructure/api";
import { AppointmentCard } from "@/components/booking/AppointmentCard";
import { StatusBadge } from "@/components/booking/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, CalendarX, ArrowLeft } from "lucide-react";
import { ConsultationStatus, UserRole } from "@/domain/enums";
import { useSession } from "next-auth/react";
import Link from "next/link";

// ─── Filter tabs ────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{
  label: string;
  value: ConsultationStatus | undefined;
}> = [
  { label: "Todas", value: undefined },
  { label: "Pendientes", value: ConsultationStatus.PENDIENTE },
  { label: "Confirmadas", value: ConsultationStatus.CONFIRMADA },
  { label: "En curso", value: ConsultationStatus.EN_CURSO },
  { label: "Completadas", value: ConsultationStatus.COMPLETADA },
  { label: "Canceladas", value: ConsultationStatus.CANCELADA },
];

// ─── Skeleton ───────────────────────────────────────────────────────────

function CitasListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function CitasPage() {
  const { data: session } = useSession();
  const [activeFilter, setActiveFilter] = useState<ConsultationStatus | undefined>(undefined);

  const {
    data: appointments,
    isLoading,
    isError,
    error,
    refetch,
  } = api.bookings.getMyAppointments.useQuery(
    { estado: activeFilter },
    { enabled: !!session },
  );

  const cancelMutation = api.bookings.cancelAppointment.useMutation();

  const handleCancel = async (citaId: string) => {
    try {
      await cancelMutation.mutateAsync({ citaId });
      refetch();
    } catch {
      // Error is handled by tRPC
    }
  };

  const userRole = (session?.user as { role?: string })?.role as UserRole | undefined;

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Mis Citas</h1>
        <CitasListSkeleton />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Mis Citas</h1>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error al cargar las citas</AlertTitle>
          <AlertDescription>
            {error?.message ?? "Ha ocurrido un error inesperado"}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  // Empty state
  const hasAppointments = appointments && appointments.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al panel
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Mis Citas</h1>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            onClick={() => setActiveFilter(filter.value)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              activeFilter === filter.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Appointments list */}
      {hasAppointments ? (
        <div className="space-y-4">
          {appointments!.map((apt) => (
            <AppointmentCard
              key={apt.id}
              appointment={apt}
              userRole={userRole ?? UserRole.PACIENTE}
              onCancel={handleCancel}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-16">
          <CalendarX className="size-12 text-muted-foreground" />
          <p className="text-center text-muted-foreground">
            No tienes citas con este filtro.
          </p>
        </div>
      )}
    </div>
  );
}
