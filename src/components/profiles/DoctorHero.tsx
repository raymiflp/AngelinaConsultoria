"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Star, MapPin, Phone, Calendar, MessageSquare, Video } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Props ─────────────────────────────────────────────────────────────

export interface DoctorHeroProps {
  id: string;
  nombre: string;
  especialidad: string;
  fotoUrl: string | null;
  ubicacionConsulta: string | null;
  numeroColegiado: string;
  añosExperiencia: number | null;
  idiomas: string[];
  calificacionMedia: number | null;
  totalReviews: number;
  telefonoConsulta: string | null;
  aceptaOnline?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Component ──────────────────────────────────────────────────────────

/**
 * DoctorHero — rich hero section at the top of the doctor profile page.
 *
 * Displays the doctor's photo (or initials fallback), name, specialty badge,
 * location, license, years of experience, languages, rating, phone, and CTA
 * buttons for booking, calling, and messaging.
 */
export function DoctorHero({
  id,
  nombre,
  especialidad,
  fotoUrl,
  ubicacionConsulta,
  numeroColegiado,
  añosExperiencia,
  idiomas,
  calificacionMedia,
  totalReviews,
  telefonoConsulta,
  aceptaOnline,
}: DoctorHeroProps) {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  const hideBookButton = userRole === "DOCTOR" || userRole === "ADMIN";

  const initials = getInitials(nombre);

  return (
    <div className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm md:flex-row md:items-start">
      {/* ─── Left column: Avatar + name + specialty + location ─── */}
      <div className="flex flex-col items-center gap-3 md:items-start md:min-w-48">
        <Avatar className="size-24 md:size-32">
          {fotoUrl && <AvatarImage src={fotoUrl} alt={nombre} />}
          <AvatarFallback className="text-2xl md:text-3xl">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="text-center md:text-left">
          <h1 className="text-2xl font-bold md:text-3xl">{nombre}</h1>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
            <Badge variant="secondary">{especialidad}</Badge>

            {ubicacionConsulta && (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                {ubicacionConsulta}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Right column: details + CTAs ───────────────────────── */}
      <div className="flex flex-1 flex-col gap-3">
        {/* License number */}
        <span className="text-sm text-muted-foreground">
          Nº Colegiado: {numeroColegiado}
        </span>

        {/* Years of experience */}
        {añosExperiencia != null && (
          <span className="text-sm text-muted-foreground">
            {añosExperiencia} años de experiencia
          </span>
        )}

        {/* Languages */}
        {idiomas.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {idiomas.map((idioma) => (
              <Badge key={idioma} variant="outline" className="text-xs">
                {idioma}
              </Badge>
            ))}
          </div>
        )}

        {/* Rating */}
        {calificacionMedia != null && (
          <div className="flex items-center gap-1 text-sm">
            <Star className="size-4 fill-yellow-500 text-yellow-500" />
            <span className="font-medium">
              {calificacionMedia.toFixed(1)}
            </span>
            <span className="text-muted-foreground">
              ({totalReviews} reseñas)
            </span>
          </div>
        )}

        {/* Online consultations badge (strict aceptaOnline === true) */}
        {aceptaOnline === true && (
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs">
              <Video className="mr-1 size-3" aria-hidden="true" />
              Disponible online
            </Badge>
          </div>
        )}

        {/* Phone */}
        {telefonoConsulta && (
          <a
            href={`tel:${telefonoConsulta}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Phone className="size-3.5" />
            {telefonoConsulta}
          </a>
        )}

        {/* ─── CTA Buttons ─────────────────────────────────────── */}
        <div className="mt-2 flex flex-wrap gap-2">
          {!hideBookButton && (
            <Button asChild>
              <Link href={`/doctores/${id}/agendar`}>
                <Calendar data-icon="inline-start" />
                Reservar cita
              </Link>
            </Button>
          )}

          {telefonoConsulta && (
            <Button variant="outline" asChild>
              <a href={`tel:${telefonoConsulta}`}>
                <Phone data-icon="inline-start" />
                Llamar
              </a>
            </Button>
          )}

          <Button variant="outline" asChild>
            <Link href="/proximamente?feature=Mensajer%C3%ADa">
              <MessageSquare data-icon="inline-start" />
              Enviar mensaje
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
