"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Video } from "lucide-react";
import { api } from "@/infrastructure/api";
import { DoctorCard } from "@/components/profiles/DoctorCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Search, AlertCircle, Stethoscope, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Public doctors listing page.
 *
 * Shows verified doctors in a responsive grid with optional specialty search
 * and an "Disponible online" filter pill (URL-driven via `?aceptaOnline=true`).
 * Accessible to all users (no auth required), primarily for PACIENTE role.
 */
export default function DoctorsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [especialidad, setEspecialidad] = useState<string | undefined>();

  const aceptaOnlineFilter = searchParams.get("aceptaOnline") === "true";

  const { data: doctors, isLoading, isError } =
    api.profiles.listDoctorProfiles.useQuery({
      especialidad,
      aceptaOnline: aceptaOnlineFilter ? true : undefined,
      limit: 50,
    });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setEspecialidad(search.trim() || undefined);
  };

  const toggleOnlineFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (aceptaOnlineFilter) {
      params.delete("aceptaOnline");
    } else {
      params.set("aceptaOnline", "true");
    }
    const query = params.toString();
    router.replace(`/doctores${query ? `?${query}` : ""}`);
  }, [aceptaOnlineFilter, router, searchParams]);

  return (
    <div className="mx-auto max-w-5xl py-8">
      {/* Back link */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al inicio
      </Link>

      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Buscar doctores
        </h1>
        <p className="text-muted-foreground mx-auto max-w-md">
          Encontrá especialistas médicos verificados y reservá tu cita online
        </p>
      </div>

      {/* Search + filter pill */}
      <div className="mx-auto mb-8 flex max-w-2xl flex-wrap items-center gap-2">
        <form
          onSubmit={handleSearch}
          className="flex flex-1 gap-2"
          data-testid="doctor-search-form"
        >
          <Input
            placeholder="Buscar por especialidad…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading}>
            <Search data-icon="inline-start" />
            Buscar
          </Button>
        </form>
        <button
          type="button"
          onClick={toggleOnlineFilter}
          aria-pressed={aceptaOnlineFilter}
          data-testid="disponible-online-pill"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
            aceptaOnlineFilter
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:bg-accent",
          )}
        >
          <Video className="size-3.5" aria-hidden="true" />
          Disponible online
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-6">
              <div className="mb-4 flex items-start gap-4">
                <Skeleton className="size-16 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
              <Skeleton className="mb-2 h-12 w-full" />
              <div className="flex items-center justify-between border-t pt-4">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-10 w-32 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive" className="mx-auto max-w-md">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            No se pudieron cargar los doctores. Intentalo de nuevo más tarde.
          </AlertDescription>
        </Alert>
      ) : doctors && doctors.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doctor) => (
            <Link
              key={doctor.id}
              href={`/doctores/${doctor.id}`}
              className="block transition-colors hover:no-underline"
            >
              <DoctorCard doctor={doctor} showBookingLink={false} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <Stethoscope className="mx-auto mb-4 size-12 text-muted-foreground/50" />
          <h2 className="mb-2 text-lg font-semibold">
            {especialidad
              ? "No se encontraron doctores"
              : aceptaOnlineFilter
                ? "No hay doctores disponibles online"
                : "No hay doctores disponibles"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {especialidad
              ? `No hay doctores verificados con la especialidad "${especialidad}".`
              : aceptaOnlineFilter
                ? "Probá quitando el filtro de disponibilidad online."
                : "Actualmente no hay doctores verificados en el sistema."}
          </p>
        </div>
      )}
    </div>
  );
}
