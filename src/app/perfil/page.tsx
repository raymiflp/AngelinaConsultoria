"use client";

import { useState } from "react";
import { api } from "@/infrastructure/api";
import { ProfileForm } from "@/components/profiles/ProfileForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Edit3, UserPlus, MapPin, Calendar as CalendarIcon, Activity, ArrowLeft } from "lucide-react";
import Link from "next/link";

// ─── Skeleton ─────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-4 rounded-lg border p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

// ─── View Mode ────────────────────────────────────────────────────────

function ProfileView({
  profile,
  onEdit,
}: {
  profile: NonNullable<ReturnType<typeof useProfileData>["data"]>;
  onEdit: () => void;
}) {
  const isDoctor = profile.rol === "DOCTOR";
  const doctor = profile.doctor;
  const paciente = profile.paciente;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={isDoctor ? "/dashboard" : "/citas"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {isDoctor ? "Volver al panel" : "Volver a mis citas"}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Mi Perfil</h1>
        <Button onClick={onEdit}>
          <Edit3 data-icon="inline-start" />
          <span>Editar</span>
        </Button>
      </div>

      {/* ── User info card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Información general</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nombre</p>
              <p className="font-medium">{profile.nombre}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{profile.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Teléfono</p>
              <p className="font-medium">{profile.telefono || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Rol</p>
              <Badge variant="outline">
                {isDoctor ? "Doctor" : "Paciente"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Doctor-specific card ────────────────────────────────────── */}
      {isDoctor && doctor && (
        <Card>
          <CardHeader>
            <CardTitle>Información profesional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Nº Colegiado
                </p>
                <p className="font-medium">{doctor.numeroColegiado}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Especialidad
                </p>
                <Badge>{doctor.especialidad}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Precio consulta
                </p>
                <p className="font-medium">
                  {doctor.precioConsulta != null
                    ? `${doctor.precioConsulta.toFixed(2)} €`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Verificado</p>
                <p className="font-medium">
                  {doctor.verificado ? "Sí" : "No"}
                </p>
              </div>
            </div>
            {doctor.biografia && (
              <div>
                <p className="text-sm text-muted-foreground">Biografía</p>
                <p className="mt-1 text-sm leading-relaxed">
                  {doctor.biografia}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Patient-specific card ──────────────────────────────────── */}
      {!isDoctor && paciente && (
        <Card>
          <CardHeader>
            <CardTitle>Información personal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Fecha de nacimiento
                  </p>
                  <p className="font-medium">
                    {paciente.fechaNacimiento ?? "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Grupo sanguíneo
                  </p>
                  <p className="font-medium">
                    {paciente.grupoSanguineo ?? "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">Dirección</p>
                <p className="font-medium">
                  {paciente.direccionCalle}, {paciente.direccionCiudad},{" "}
                  {paciente.direccionProvincia} —{" "}
                  {paciente.direccionCodigoPostal},{" "}
                  {paciente.direccionPais}
                </p>
              </div>
            </div>

            {paciente.alergias.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  Alergias
                </p>
                <div className="flex flex-wrap gap-1">
                  {paciente.alergias.map((a, i) => (
                    <Badge key={i} variant="secondary">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {paciente.notasMedicas && (
              <div>
                <p className="text-sm text-muted-foreground">
                  Notas médicas
                </p>
                <p className="mt-1 text-sm leading-relaxed">
                  {paciente.notasMedicas}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function useProfileData() {
  const { data, isLoading, isError, error, refetch } =
    api.profiles.getMyProfile.useQuery();

  return { data, isLoading, isError, error, refetch };
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function PerfilPage() {
  const [isEditing, setIsEditing] = useState(false);
  const { data: profile, isLoading, isError, error, refetch } =
    useProfileData();

  // Loading state
  if (isLoading) {
    return <ProfileSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error al cargar el perfil</AlertTitle>
          <AlertDescription>
            {error?.message ?? "Ha ocurrido un error inesperado"}
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => refetch()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  // Empty state — user has no profile extension
  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Perfil no encontrado</CardTitle>
            <CardDescription>
              No tienes un perfil configurado todavía.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Para usar la plataforma necesitas crear tu perfil.
            </p>
            <Button asChild>
              <Link href="/perfil">
                <UserPlus data-icon="inline-start" />
                Crear perfil
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // View / Edit toggle
  if (isEditing) {
    const isDoctor = profile.rol === "DOCTOR";
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={isDoctor ? "/dashboard" : "/citas"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {isDoctor ? "Volver al panel" : "Volver a mis citas"}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          Editar Perfil
        </h1>
        <ProfileForm
          profile={profile}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  return <ProfileView profile={profile} onEdit={() => setIsEditing(true)} />;
}
