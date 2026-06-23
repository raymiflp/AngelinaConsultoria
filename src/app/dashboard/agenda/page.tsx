"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { api } from "@/infrastructure/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  Calendar,
  Clock,
  UserRound,
  Stethoscope,
  Filter,
  ArrowLeft,
} from "lucide-react";
import { ConsultationStatus } from "@/domain/enums";

const STATUS_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: ConsultationStatus.PENDIENTE, label: "Pendientes" },
  { value: ConsultationStatus.CONFIRMADA, label: "Confirmadas" },
  { value: ConsultationStatus.EN_CURSO, label: "En curso" },
  { value: ConsultationStatus.COMPLETADA, label: "Completadas" },
  { value: ConsultationStatus.CANCELADA, label: "Canceladas" },
  { value: ConsultationStatus.NO_ASISTIO, label: "No asistió" },
] as const;

function getStatusColor(
  estado: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (estado) {
    case ConsultationStatus.PENDIENTE:
      return "outline";
    case ConsultationStatus.CONFIRMADA:
      return "secondary";
    case ConsultationStatus.EN_CURSO:
      return "default";
    case ConsultationStatus.COMPLETADA:
      return "default";
    case ConsultationStatus.CANCELADA:
      return "destructive";
    case ConsultationStatus.NO_ASISTIO:
      return "destructive";
    default:
      return "outline";
  }
}

function groupByTime(appointments: Array<{
  id: string;
  fechaHora: string | Date;
  pacienteNombre: string | null;
  estado: string;
  motivo: string | null;
  duracionMinutos: number | null;
}>) {
  const morning: typeof appointments = [];
  const afternoon: typeof appointments = [];
  const evening: typeof appointments = [];

  for (const apt of appointments) {
    const hour = new Date(apt.fechaHora).getHours();
    if (hour < 12) morning.push(apt);
    else if (hour < 18) afternoon.push(apt);
    else evening.push(apt);
  }

  return { morning, afternoon, evening };
}

export default function AgendaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");

  // Guard: redirect non-DOCTOR
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      const role = (session?.user as { role?: string })?.role;
      if (role !== "DOCTOR") {
        router.push("/dashboard");
      }
    }
  }, [status, session, router]);

  const {
    data: appointments,
    isLoading,
    isError,
    error,
    refetch,
  } = api.bookings.getMyAppointments.useQuery(
    filter !== "all" ? { estado: filter as ConsultationStatus } : {},
    { enabled: status === "authenticated" },
  );

  // Filter to today's appointments + apply status filter on client side
  // (the server already filters by estado if provided, but we also filter by today)
  const todayAppointments = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000); // +1 day

    let filtered = (appointments ?? []).filter((a) => {
      const aDate = new Date(a.fechaHora);
      return aDate >= todayStart && aDate < todayEnd;
    });

    // If server already filtered by estado, client filter is redundant but harmless
    if (filter !== "all") {
      filtered = filtered.filter((a) => a.estado === filter);
    }

    // Sort by time
    filtered.sort(
      (a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime(),
    );

    return filtered;
  }, [appointments, filter]);

  const grouped = useMemo(() => groupByTime(todayAppointments), [todayAppointments]);

  const todayStr = new Date().toLocaleDateString("es", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (status === "loading" || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="mb-2 h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mi Agenda</h1>
          <p className="text-muted-foreground">{todayStr}</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error al cargar la agenda</AlertTitle>
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

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al panel
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mi Agenda</h1>
        <p className="text-muted-foreground capitalize">{todayStr}</p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <Filter className="size-4 text-muted-foreground" />
        <Tabs value={filter} onValueChange={setFilter} className="flex-1">
          <TabsList className="flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value}>
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Empty state */}
      {todayAppointments.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto mb-4 size-12 text-muted-foreground/40" />
            <p className="text-lg font-medium">No hay citas para hoy</p>
            <p className="text-sm text-muted-foreground">
              {filter !== "all"
                ? "No hay citas con el filtro seleccionado para hoy"
                : "No tienes citas programadas para el día de hoy"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Time-grouped agenda */}
      {todayAppointments.length > 0 && (
        <div className="space-y-8">
          {/* Morning */}
          {grouped.morning.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Mañana
              </h2>
              <div className="space-y-2">
                {grouped.morning.map((cita) => (
                  <AppointmentCard key={cita.id} cita={cita} />
                ))}
              </div>
            </section>
          )}

          {/* Afternoon */}
          {grouped.afternoon.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Tarde
              </h2>
              <div className="space-y-2">
                {grouped.afternoon.map((cita) => (
                  <AppointmentCard key={cita.id} cita={cita} />
                ))}
              </div>
            </section>
          )}

          {/* Evening */}
          {grouped.evening.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Noche
              </h2>
              <div className="space-y-2">
                {grouped.evening.map((cita) => (
                  <AppointmentCard key={cita.id} cita={cita} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Summary card */}
      {todayAppointments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Resumen del día
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 text-sm">
              <span>
                Total: <strong>{todayAppointments.length}</strong>
              </span>
              <span>
                Pendientes:{" "}
                <strong>
                  {todayAppointments.filter(
                    (a) => a.estado === ConsultationStatus.PENDIENTE,
                  ).length}
                </strong>
              </span>
              <span>
                Confirmadas:{" "}
                <strong>
                  {todayAppointments.filter(
                    (a) => a.estado === ConsultationStatus.CONFIRMADA,
                  ).length}
                </strong>
              </span>
              <span>
                Completadas:{" "}
                <strong>
                  {todayAppointments.filter(
                    (a) => a.estado === ConsultationStatus.COMPLETADA,
                  ).length}
                </strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AppointmentCard({
  cita,
}: {
  cita: {
    id: string;
    fechaHora: string | Date;
    pacienteNombre: string | null;
    estado: string;
    motivo: string | null;
    duracionMinutos: number | null;
  };
}) {
  const timeStr = new Date(cita.fechaHora).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card className="transition-colors hover:bg-accent/30">
      <CardContent className="flex items-center gap-4 py-4">
        {/* Time */}
        <div className="flex w-16 flex-col items-center">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{timeStr}</span>
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-border" />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium truncate">{cita.pacienteNombre ?? "—"}</span>
          </div>
          {cita.motivo && (
            <p className="mt-0.5 text-sm text-muted-foreground truncate">
              {cita.motivo}
            </p>
          )}
        </div>

        {/* Badge */}
        <Badge variant={getStatusColor(cita.estado)}>
          {cita.estado}
        </Badge>
      </CardContent>
    </Card>
  );
}
