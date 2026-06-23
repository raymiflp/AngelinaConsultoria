import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Star, Calendar } from "lucide-react";
import type { DoctorPublicResponse } from "@/infrastructure/profiles/schemas";
import Link from "next/link";

interface DoctorCardProps {
  doctor: DoctorPublicResponse;
  /**
   * Whether to show the "Reservar cita" link in the footer.
   * Set to `false` when the card is used inside a parent link (e.g. listing grid).
   * @default true
   */
  showBookingLink?: boolean;
}

/**
 * DoctorCard — public read-only card displaying doctor professional info.
 *
 * - Name, specialty badge, bio, price, rating
 * - Book appointment button (when `showBookingLink` is true)
 */
export function DoctorCard({ doctor, showBookingLink = true }: DoctorCardProps) {
  const initials = doctor.nombre
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <div className="flex items-start gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col gap-1">
            <CardTitle className="text-xl">{doctor.nombre}</CardTitle>
            <CardDescription>{doctor.email}</CardDescription>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{doctor.especialidad}</Badge>
              {doctor.calificacionMedia != null && (
                <div className="flex items-center gap-1 text-sm text-yellow-500">
                  <Star className="size-4 fill-current" />
                  <span className="font-medium text-foreground">
                    {doctor.calificacionMedia.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      {doctor.biografia && (
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {doctor.biografia}
          </p>
        </CardContent>
      )}

      <CardFooter className="flex items-center justify-between border-t pt-4">
        {doctor.precioConsulta != null ? (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">
              {doctor.precioConsulta.toFixed(2)}
            </span>
            <span className="text-sm text-muted-foreground">€</span>
            <span className="text-sm text-muted-foreground ml-1">
              / consulta
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            Precio no disponible
          </span>
        )}

        {showBookingLink && (
          <Button asChild>
            <Link href={`/doctores/${doctor.id}/agendar`}>
              <Calendar data-icon="inline-start" />
              Reservar cita
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
