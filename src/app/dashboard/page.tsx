"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/infrastructure/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Stethoscope,
  Users,
  Calendar,
  Activity,
  TrendingUp,
  DollarSign,
  Clock,
  UserRound,
  Search,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import { ConsultationStatus } from "@/domain/enums";

// ─── Admin Dashboard ──────────────────────────────────────────────────────

function AdminDashboard() {
  const {
    data: stats,
    isLoading,
    isError,
    error,
    refetch,
  } = api.admin.getDashboardStats.useQuery(undefined, {
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panel de Administración</h1>
          <p className="text-muted-foreground">Resumen general del sistema</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-6">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panel de Administración</h1>
          <p className="text-muted-foreground">Resumen general del sistema</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error al cargar estadísticas</AlertTitle>
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

  const totalCitasValue = Object.values(stats?.citasPorEstado ?? {}).reduce(
    (sum, count) => sum + count,
    0,
  );

  const isEmpty =
    stats &&
    stats.totalDoctores === 0 &&
    stats.totalPacientes === 0 &&
    stats.totalCitas === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de Administración</h1>
        <p className="text-muted-foreground">Resumen general del sistema</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Doctores
            </CardTitle>
            <Stethoscope className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDoctores ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Pacientes
            </CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPacientes ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Citas
            </CardTitle>
            <Calendar className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCitasValue}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ingresos (30 días)
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Number(stats?.ingresos ?? 0).toFixed(2)} €
            </div>
            <p className="text-xs text-muted-foreground">Citas completadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Registros (7 días)
            </CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.registrosDiarios?.reduce((sum, r) => sum + r.count, 0) ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Nuevos usuarios</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Citas pendientes
            </CardTitle>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.citasPorEstado?.PENDIENTE ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {isEmpty && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Activity className="mx-auto mb-2 size-8" />
            <p>Aún no hay datos registrados en el sistema.</p>
          </CardContent>
        </Card>
      )}

      {stats?.citasPorEstado && Object.keys(stats.citasPorEstado).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Citas por estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(stats.citasPorEstado).map(([estado, count]) => (
                <div
                  key={estado}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2"
                >
                  <span className="text-sm capitalize">{estado.toLowerCase()}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {stats?.registrosDiarios && stats.registrosDiarios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Registros diarios (últimos 7 días)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {stats.registrosDiarios.map((r) => (
                <div
                  key={r.fecha}
                  className="flex flex-col items-center rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.fecha).toLocaleDateString("es", {
                      weekday: "short",
                    })}
                  </span>
                  <span className="font-semibold">{r.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Doctor Dashboard ─────────────────────────────────────────────────────

function QuickActionCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer transition-colors hover:bg-accent/50">
        <CardContent className="flex items-center gap-4 pt-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function DoctorDashboard() {
  const { data: session } = useSession();
  const doctorName = session?.user?.name ?? "Doctor";

  const { data: appointments, isLoading: loadingAppointments } =
    api.bookings.getMyAppointments.useQuery({});

  const today = new Date();
  const todayStr = today.toLocaleDateString("es", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const todayAppointments =
    appointments?.filter((a) => {
      const aDate = new Date(a.fechaHora);
      return (
        aDate.getFullYear() === today.getFullYear() &&
        aDate.getMonth() === today.getMonth() &&
        aDate.getDate() === today.getDate()
      );
    }) ?? [];

  const pendingAppointments =
    appointments?.filter(
      (a) => a.estado === ConsultationStatus.PENDIENTE,
    ) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bienvenido, Dr. {doctorName}
        </h1>
        <p className="text-muted-foreground">{todayStr}</p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Citas de hoy
            </CardTitle>
            <Calendar className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayAppointments.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Citas pendientes
            </CardTitle>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingAppointments.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Today's appointments preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-4" />
            Citas de hoy
          </CardTitle>
          <CardDescription>
            {todayAppointments.length === 0
              ? "No tienes citas programadas para hoy"
              : `${todayAppointments.length} cita${todayAppointments.length !== 1 ? "s" : ""} programada${todayAppointments.length !== 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAppointments ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : todayAppointments.length > 0 ? (
            <div className="space-y-2">
              {todayAppointments.slice(0, 5).map((cita) => (
                <div
                  key={cita.id}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <UserRound className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {cita.pacienteNombre ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {new Date(cita.fechaHora).toLocaleTimeString("es", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge
                      variant={
                        cita.estado === ConsultationStatus.PENDIENTE
                          ? "outline"
                          : cita.estado === ConsultationStatus.CONFIRMADA
                            ? "secondary"
                            : "default"
                      }
                    >
                      {cita.estado}
                    </Badge>
                  </div>
                </div>
              ))}
              {todayAppointments.length > 5 && (
                <p className="text-center text-sm text-muted-foreground">
                  y {todayAppointments.length - 5} más
                </p>
              )}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No hay citas programadas para hoy
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick action cards */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Acciones rápidas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard
            title="Ver mis citas"
            description="Gestiona tu agenda de citas"
            href="/citas"
            icon={Calendar}
          />
          <QuickActionCard
            title="Gestionar disponibilidad"
            description="Configura tu horario semanal"
            href="/dashboard/disponibilidad"
            icon={Clock}
          />
          <QuickActionCard
            title="Ver pacientes"
            description="Lista de tus pacientes"
            href="/dashboard/pacientes"
            icon={Users}
          />
          <QuickActionCard
            title="Mi perfil"
            description="Actualiza tu información"
            href="/perfil"
            icon={UserCircle}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Paciente Dashboard ──────────────────────────────────────────────────

function PacienteDashboard() {
  const { data: session } = useSession();
  const pacienteName = session?.user?.name ?? "Paciente";

  const { data: appointments, isLoading: loadingAppointments } =
    api.bookings.getMyAppointments.useQuery({});

  const upcomingAppointments =
    appointments?.filter(
      (a) =>
        new Date(a.fechaHora) > new Date() &&
        a.estado !== ConsultationStatus.CANCELADA &&
        a.estado !== ConsultationStatus.COMPLETADA &&
        a.estado !== ConsultationStatus.NO_ASISTIO,
    ) ?? [];

  const today = new Date();
  const todayStr = today.toLocaleDateString("es", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bienvenido, {pacienteName}
        </h1>
        <p className="text-muted-foreground">{todayStr}</p>
      </div>

      {/* Upcoming appointments preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-4" />
            Próximas citas
          </CardTitle>
          <CardDescription>
            {upcomingAppointments.length === 0
              ? "No tienes citas programadas"
              : `${upcomingAppointments.length} cita${upcomingAppointments.length !== 1 ? "s" : ""} próxima${upcomingAppointments.length !== 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAppointments ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : upcomingAppointments.length > 0 ? (
            <div className="space-y-2">
              {upcomingAppointments.slice(0, 5).map((cita) => (
                <div
                  key={cita.id}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Stethoscope className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {cita.doctorNombre ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {new Date(cita.fechaHora).toLocaleDateString("es", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {new Date(cita.fechaHora).toLocaleTimeString("es", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge
                      variant={
                        cita.estado === ConsultationStatus.PENDIENTE
                          ? "outline"
                          : cita.estado === ConsultationStatus.CONFIRMADA
                            ? "secondary"
                            : "default"
                      }
                    >
                      {cita.estado}
                    </Badge>
                  </div>
                </div>
              ))}
              {upcomingAppointments.length > 5 && (
                <p className="text-center text-sm text-muted-foreground">
                  y {upcomingAppointments.length - 5} más
                </p>
              )}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No tienes citas programadas
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick action cards */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Acciones rápidas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickActionCard
            title="Buscar doctores"
            description="Encuentra especialistas disponibles"
            href="/doctores"
            icon={Search}
          />
          <QuickActionCard
            title="Mis citas"
            description="Revisa y gestiona tus citas"
            href="/citas"
            icon={Calendar}
          />
          <QuickActionCard
            title="Mi perfil"
            description="Actualiza tu información personal"
            href="/perfil"
            icon={UserCircle}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard Page ─────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-6">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const role = (session?.user as { role?: string })?.role;

  switch (role) {
    case "DOCTOR":
      return <DoctorDashboard />;
    case "PACIENTE":
      return <PacienteDashboard />;
    case "ADMIN":
      return <AdminDashboard />;
    default:
      return (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Acceso denegado</AlertTitle>
          <AlertDescription>
            No tienes un rol válido para acceder al dashboard.
          </AlertDescription>
        </Alert>
      );
  }
}
