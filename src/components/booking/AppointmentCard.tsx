"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, User, FileText } from "lucide-react";
import { ConsultationStatus, UserRole } from "@/domain/enums";
import { StatusBadge } from "./StatusBadge";
import { useRouter } from "next/navigation";

/**
 * Shape returned by getMyAppointments.
 */
export interface AppointmentData {
  id: string;
  doctorId: string;
  pacienteId: string;
  fechaHora: string;
  estado: string;
  motivo: string;
  duracionMinutos: number;
  precio: string | null;
  notas: string | null;
  doctorNombre: string | null;
  pacienteNombre: string | null;
}

interface AppointmentCardProps {
  appointment: AppointmentData;
  userRole: UserRole;
  onCancel?: (citaId: string) => void;
}

/**
 * AppointmentCard — role-aware card showing appointment summary.
 *
 * - PACIENTE view: shows doctor name
 * - DOCTOR view: shows patient name
 * - Navigates to /citas/[id] on click
 */
export function AppointmentCard({
  appointment,
  userRole,
  onCancel,
}: AppointmentCardProps) {
  const router = useRouter();

  const date = new Date(appointment.fechaHora);
  const formattedDate = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const otherPartyName =
    userRole === UserRole.PACIENTE
      ? (appointment.doctorNombre ?? "Doctor")
      : (appointment.pacienteNombre ?? "Paciente");

  const otherPartyLabel =
    userRole === UserRole.PACIENTE ? "Doctor" : "Paciente";

  const canCancel =
    userRole === UserRole.PACIENTE &&
    (appointment.estado === ConsultationStatus.PENDIENTE ||
      appointment.estado === ConsultationStatus.CONFIRMADA);

  const handleClick = () => {
    router.push(`/citas/${appointment.id}`);
  };

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={handleClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">{otherPartyName}</CardTitle>
              <p className="text-xs text-muted-foreground">{otherPartyLabel}</p>
            </div>
          </div>
          <StatusBadge
            status={appointment.estado as ConsultationStatus}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" />
            <span>{formattedDate}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <span>
              {formattedTime} ({appointment.duracionMinutos} min)
            </span>
          </div>
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 size-4 text-muted-foreground shrink-0" />
            <span className="line-clamp-2 text-muted-foreground">
              {appointment.motivo}
            </span>
          </div>
        </div>

        {canCancel && onCancel && (
          <div className="mt-4 flex justify-end" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(appointment.id)}
            >
              Cancelar cita
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
