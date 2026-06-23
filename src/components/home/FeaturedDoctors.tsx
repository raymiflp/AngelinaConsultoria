"use client";

import Link from "next/link";
import { AlertCircle, Stethoscope } from "lucide-react";

import { api } from "@/infrastructure/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DoctorCard } from "@/components/profiles/DoctorCard";

/**
 * FeaturedDoctors — client island for the home page.
 *
 * Fetches up to 8 doctors via the existing public tRPC procedure
 * `listDoctorProfiles`. Four render states:
 *
 *  - loading:  8 `Card`-shaped `Skeleton` placeholders
 *  - empty:    a single centered message
 *  - error:    a polite error + a "Reintentar" button that calls `refetch`
 *  - success:  a responsive grid of `DoctorCard`s wrapped in `Link`s
 *
 * The "Ver todos los doctores" link is hidden in the empty and error states
 * (the spec allows it in loading) so the section does not advertise a
 * "ver todos" flow that has no data behind it.
 */
const DOCTOR_LIMIT = 8;

export function FeaturedDoctors() {
  const { data, isLoading, isError, refetch } =
    api.profiles.listDoctorProfiles.useQuery({ limit: DOCTOR_LIMIT });

  return (
    <section
      className="container mx-auto px-4 py-12 md:py-16"
      aria-labelledby="featured-doctors-heading"
    >
      <h2
        id="featured-doctors-heading"
        className="mb-6 text-2xl font-bold tracking-tight md:text-3xl"
      >
        Doctores destacados
      </h2>

      {isLoading ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-busy="true"
          aria-live="polite"
        >
          {Array.from({ length: DOCTOR_LIMIT }).map((_, i) => (
            <Card key={i} className="w-full max-w-lg">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <Skeleton className="size-16 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-12 w-full" />
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-10 w-32 rounded-md" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <div className="py-12 text-center" role="alert" aria-live="polite">
          <AlertCircle
            className="text-destructive mx-auto mb-3 size-10"
            aria-hidden="true"
          />
          <p className="text-destructive mb-4">
            Hubo un error al cargar los doctores.
          </p>
          <Button onClick={() => void refetch()} variant="outline">
            Reintentar
          </Button>
        </div>
      ) : data && data.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.map((doctor) => (
              <Link
                key={doctor.id}
                href={`/doctores/${doctor.id}`}
                className="block transition-colors hover:no-underline"
              >
                <DoctorCard doctor={doctor} showBookingLink={false} />
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button variant="link" asChild>
              <Link href="/doctores">Ver todos los doctores</Link>
            </Button>
          </div>
        </>
      ) : (
        <div className="py-12 text-center">
          <Stethoscope
            className="text-muted-foreground/50 mx-auto mb-3 size-10"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">
            No hay doctores disponibles por el momento.
          </p>
        </div>
      )}
    </section>
  );
}
