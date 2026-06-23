"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/infrastructure/api";
import { StatusBadge } from "@/components/booking/StatusBadge";
import { JoinCallButton } from "@/components/booking/JoinCallButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  User,
  FileText,
  Stethoscope,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { ConsultaModalidad, ConsultationStatus, UserRole } from "@/domain/enums";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

/**
 * Available status transitions for the doctor action buttons.
 */
const STATUS_ACTIONS: Array<{
  label: string;
  from: ConsultationStatus[];
  to: ConsultationStatus;
}> = [
  {
    label: "Confirmar",
    from: [ConsultationStatus.PENDIENTE],
    to: ConsultationStatus.CONFIRMADA,
  },
  {
    label: "Iniciar consulta",
    from: [ConsultationStatus.CONFIRMADA],
    to: ConsultationStatus.EN_CURSO,
  },
  {
    label: "Completar",
    from: [ConsultationStatus.EN_CURSO],
    to: ConsultationStatus.COMPLETADA,
  },
  {
    label: "No asistió",
    from: [ConsultationStatus.EN_CURSO],
    to: ConsultationStatus.NO_ASISTIO,
  },
  {
    label: "Cancelar cita",
    from: [
      ConsultationStatus.PENDIENTE,
      ConsultationStatus.CONFIRMADA,
      ConsultationStatus.EN_CURSO,
    ],
    to: ConsultationStatus.CANCELADA,
  },
];

// ─── Detail Skeleton ────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-6 w-32" />
      <div className="space-y-4 rounded-lg border p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function CitaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const citaId = params.id as string;

  const [notesValue, setNotesValue] = useState("");

  const {
    data: appointments,
    isLoading,
    isError,
    error,
    refetch,
  } = api.bookings.getMyAppointments.useQuery(
    {},
    { enabled: !!session },
  );

  const statusMutation = api.bookings.updateAppointmentStatus.useMutation();
  const cancelMutation = api.bookings.cancelAppointment.useMutation();
  const notesMutation = api.bookings.updateAppointmentNotes.useMutation();

  const cita = appointments?.find((a) => a.id === citaId);

  const userRole = (session?.user as { role?: string })?.role as
    | UserRole
    | undefined;
  const isDoctor = userRole === UserRole.DOCTOR;

  const handleStatusUpdate = async (nuevoEstado: ConsultationStatus) => {
    try {
      await statusMutation.mutateAsync({
        citaId,
        nuevoEstado,
      });
      toast.success("Estado actualizado correctamente");
      refetch();
    } catch {
      toast.error("Error al actualizar el estado");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ citaId });
      toast.success("Cita cancelada correctamente");
      refetch();
    } catch {
      toast.error("Error al cancelar la cita");
    }
  };

  const handleSaveNotes = async () => {
    try {
      await notesMutation.mutateAsync({
        citaId,
        notas: notesValue,
      });
      toast.success("Notas guardadas correctamente");
      refetch();
    } catch {
      toast.error("Error al guardar las notas");
    }
  };

  // Initialize notes field when cita loads
  if (cita && notesValue === "" && cita.notas) {
    setNotesValue(cita.notas);
  }

  // Loading
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <DetailSkeleton />
      </div>
    );
  }

  // Error
  if (isError) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error al cargar la cita</AlertTitle>
          <AlertDescription>
            {error?.message ?? "Ha ocurrido un error inesperado"}
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  // Not found
  if (!cita) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Cita no encontrada</AlertTitle>
          <AlertDescription>
            La cita que buscas no existe o no tienes acceso a ella.
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/citas">
            <ArrowLeft data-icon="inline-start" />
            Volver a mis citas
          </Link>
        </Button>
      </div>
    );
  }

  const date = new Date(cita.fechaHora);
  const formattedDate = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const currentStatus = cita.estado as ConsultationStatus;
  const currentModalidad = cita.modalidad as ConsultaModalidad;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      {/* Back link */}
      <Link
        href="/citas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a mis citas
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Detalle de Cita</h1>

      {/* Main info card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle>
                {isDoctor
                  ? `Paciente: ${cita.pacienteNombre ?? "—"}`
                  : `Doctor: ${cita.doctorNombre ?? "—"}`}
              </CardTitle>
              <CardDescription>
                {isDoctor ? "Paciente" : "Doctor"}
              </CardDescription>
            </div>
            <StatusBadge status={currentStatus} />
            {/* modality-toggle (PR-B): the modality badge is a per-cita
                marker that does NOT depend on `estado`. It sits next to
                the StatusBadge so the patient/doctor can read the
                modality at a glance. */}
            <Badge
              variant="outline"
              data-testid="modality-badge"
              data-modality={currentModalidad}
            >
              {currentModalidad === ConsultaModalidad.ONLINE
                ? "Online"
                : "Presencial"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date & time */}
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" />
            <span className="text-sm">{formattedDate}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <span className="text-sm">
              {formattedTime} ({cita.duracionMinutos} min)
            </span>
          </div>

          {/* Motivo */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Motivo de consulta</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {cita.motivo}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Doctor actions */}
      {isDoctor && (
        <>
          {/* Status transition buttons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <JoinCallButton
                  citaId={cita.id}
                  estado={currentStatus}
                  fechaHora={date}
                  isDoctor={true}
                  modalidad={currentModalidad}
                />
                {STATUS_ACTIONS.map((action) => {
                  if (!action.from.includes(currentStatus)) return null;
                  return (
                    <Button
                      key={action.to}
                      variant={
                        action.to === ConsultationStatus.CANCELADA
                          ? "destructive"
                          : "default"
                      }
                      size="sm"
                      onClick={() => handleStatusUpdate(action.to)}
                      disabled={statusMutation.isPending}
                    >
                      {statusMutation.isPending && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      {action.label}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Notes editor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notas de consulta</CardTitle>
              <CardDescription>
                Notas internas visibles solo para doctores
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Añade notas sobre la consulta..."
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={4}
                maxLength={5000}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {notesValue.length}/5000 caracteres
                </span>
                <Button
                  size="sm"
                  onClick={handleSaveNotes}
                  disabled={notesMutation.isPending}
                >
                  {notesMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Guardar notas
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Cancel button for patient-eligible statuses */}
          {currentStatus !== ConsultationStatus.CANCELADA &&
            currentStatus !== ConsultationStatus.COMPLETADA &&
            currentStatus !== ConsultationStatus.NO_ASISTIO && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={cancelMutation.isPending}
                >
                  Cancelar cita
                </Button>
              </div>
            )}
        </>
      )}

      {/* Patient videollamada affordance */}
      {!isDoctor && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Videollamada</CardTitle>
            <CardDescription>
              Únete a la videollamada cuando sea la hora de la cita.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JoinCallButton
              citaId={cita.id}
              estado={currentStatus}
              fechaHora={date}
              isDoctor={false}
              modalidad={currentModalidad}
            />
          </CardContent>
        </Card>
      )}

      {/* Patient cancel option */}
      {!isDoctor &&
        (currentStatus === ConsultationStatus.PENDIENTE ||
          currentStatus === ConsultationStatus.CONFIRMADA) && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              Cancelar cita
            </Button>
          </div>
        )}
    </div>
  );
}
