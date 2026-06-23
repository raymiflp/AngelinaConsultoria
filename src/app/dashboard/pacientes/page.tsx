"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/infrastructure/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import { Users, AlertCircle, ArrowLeft, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string | Date): string {
  return format(new Date(iso), "d MMM yyyy", { locale: es });
}

function formatDateTime(iso: string | Date | null): string | null {
  if (!iso) return null;
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
}

// ─── Skeleton ──────────────────────────────────────────────────────────

function PatientsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="mt-3 flex gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────

export default function PacientesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const {
    data: patients,
    isLoading,
    isError,
  } = api.bookings.getMyPatients.useQuery(undefined, {
    enabled: status === "authenticated",
  });

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

  if (status === "loading" || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <PatientsSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver al panel
        </Link>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            No se pudieron cargar los pacientes. Intentalo de nuevo más tarde.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hasPatients = patients && patients.length > 0;

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
        <h1 className="text-2xl font-bold tracking-tight">Mis Pacientes</h1>
        <p className="text-muted-foreground">
          {hasPatients
            ? `${patients!.length} paciente${patients!.length === 1 ? "" : "s"}`
            : "Gestiona tus pacientes y su historial clínico"}
        </p>
      </div>

      {hasPatients ? (
        <div className="space-y-3">
          {patients!.map((patient) => (
            <Card key={patient.pacienteId}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{patient.nombre}</h3>
                    <p className="text-sm text-muted-foreground">
                      {patient.email}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {patient.totalVisitas}{" "}
                    {patient.totalVisitas === 1 ? "visita" : "visitas"}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    <span>
                      Última visita:{" "}
                      {patient.ultimaVisita
                        ? formatDate(patient.ultimaVisita)
                        : "—"}
                    </span>
                  </div>
                  {patient.proximaCita && (
                    <div className="flex items-center gap-1">
                      <Clock className="size-3.5" />
                      <span>
                        Próxima cita: {formatDateTime(patient.proximaCita)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5 text-muted-foreground" />
              Sin pacientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Users className="size-16 text-muted-foreground/40" />
              <div className="space-y-2">
                <p className="text-lg font-medium">
                  No tienes pacientes todavía
                </p>
                <p className="text-sm text-muted-foreground">
                  Cuando los pacientes reserven citas con vos, aparecerán aquí.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
