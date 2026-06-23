"use client";

import { useParams } from "next/navigation";
import { api } from "@/infrastructure/api";
import { DoctorHero } from "@/components/profiles/DoctorHero";
import { DoctorExperience } from "@/components/profiles/DoctorExperience";
import { DoctorServices } from "@/components/profiles/DoctorServices";
import { DoctorConditions } from "@/components/profiles/DoctorConditions";
import { DoctorProfileSkeleton } from "@/components/profiles/DoctorProfileSkeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

// ─── Page ───────────────────────────────────────────────────────────────

export default function DoctorDetailPage() {
  const params = useParams();
  const doctorId = params.id as string;

  const { data: doctor, isLoading, isError, error } =
    api.profiles.getDoctorFullProfile.useQuery(
      { doctorId },
      { enabled: !!doctorId },
    );

  // ─── Loading state ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <DoctorProfileSkeleton />
      </div>
    );
  }

  // ─── Error / Not found state ──────────────────────────────────
  if (isError || !doctor) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Doctor no encontrado</AlertTitle>
          <AlertDescription>
            {error?.message === "NOT_FOUND"
              ? "El doctor que buscas no existe o ha sido dado de baja."
              : error?.message ?? "Ha ocurrido un error inesperado."}
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/">
            <ArrowLeft data-icon="inline-start" />
            Volver
          </Link>
        </Button>
      </div>
    );
  }

  // ─── Success state ────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl py-8">
      {/* Back link */}
      <Link
        href="/doctores"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a la lista
      </Link>

      <div className="space-y-6">
        <DoctorHero
          id={doctor.id}
          nombre={doctor.nombre}
          especialidad={doctor.especialidad}
          fotoUrl={doctor.fotoUrl}
          ubicacionConsulta={doctor.ubicacionConsulta}
          numeroColegiado={doctor.numeroColegiado}
          añosExperiencia={doctor.añosExperiencia}
          idiomas={doctor.idiomas}
          calificacionMedia={doctor.calificacionMedia}
          totalReviews={doctor.totalReviews}
          telefonoConsulta={doctor.telefonoConsulta}
        />

        <Separator />

        <DoctorExperience experience={doctor.experience} />

        <Separator />

        <DoctorServices services={doctor.services} />

        <Separator />

        <DoctorConditions conditions={doctor.conditions} />
      </div>
    </div>
  );
}
