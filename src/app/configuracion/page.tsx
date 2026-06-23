"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { api } from "@/infrastructure/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings, AlertCircle, ArrowLeft, User, Shield, Mail, Phone } from "lucide-react";

export default function ConfiguracionPage() {
  const { data: session } = useSession();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const isDoctor = sessionRole === "DOCTOR";

  const {
    data: profile,
    isLoading,
    isError,
  } = api.profiles.getMyProfile.useQuery();

  const utils = api.useUtils();
  const updateMutation = api.profiles.updateAcceptsOnline.useMutation({
    onSuccess: () => {
      utils.profiles.getMyProfile.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al actualizar la preferencia");
    },
  });

  const roleLabel: Record<string, string> = {
    ADMIN: "Administrador",
    DOCTOR: "Doctor",
    PACIENTE: "Paciente",
  };

  const doctorProfile = profile?.doctor as
    | { aceptaOnline?: boolean }
    | null
    | undefined;
  const aceptaOnline = doctorProfile?.aceptaOnline ?? false;

  const handleToggle = (newValue: boolean) => {
    updateMutation.mutate({ aceptaOnline: newValue });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al panel
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-5" />
            Información de la cuenta
          </CardTitle>
          <CardDescription>
            Tus datos registrados en la plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-24" />
            </div>
          ) : isError || !profile ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                No se pudo cargar la información de la cuenta.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <User className="size-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Nombre</p>
                    <p className="font-medium">{profile.nombre}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="size-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{profile.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="size-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Teléfono</p>
                    <p className="font-medium">{profile.telefono || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Shield className="size-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Rol</p>
                    <Badge variant="outline">
                      {roleLabel[profile.rol] ?? profile.rol}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-5" />
            Preferencias
          </CardTitle>
          <CardDescription>
            Personalizá tu experiencia en la plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Existing Tema row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Tema</p>
              <p className="text-sm text-muted-foreground">
                Cambiá entre modo claro y oscuro desde el botón de tema en la
                barra superior.
              </p>
            </div>
          </div>

          {/* Modalidad de consulta — DOCTOR-only */}
          {isDoctor && (
            <div
              className="flex items-center justify-between border-t pt-4"
              data-testid="modality-card"
            >
              <div className="space-y-1">
                <p className="font-medium">Acepto consultas online</p>
                <p className="text-sm text-muted-foreground">
                  Aceptar consultas online habilita la opción de videollamada en
                  el perfil público y en la agenda de los pacientes.
                </p>
              </div>
              {isLoading ? (
                <Skeleton className="h-6 w-11" />
              ) : isError ? (
                <Alert variant="destructive" className="max-w-xs">
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    No se pudo cargar la preferencia.
                  </AlertDescription>
                </Alert>
              ) : (
                <Switch
                  checked={aceptaOnline}
                  onCheckedChange={handleToggle}
                  disabled={updateMutation.isPending}
                  aria-label="Acepto consultas online"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
