import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DoctorServiceResponse } from "@/infrastructure/profiles/schemas";

// ─── Props ─────────────────────────────────────────────────────────────

export interface DoctorServicesProps {
  services: DoctorServiceResponse[];
}

// ─── Component ──────────────────────────────────────────────────────────

/**
 * DoctorServices — list of service cards with prices and booking CTA.
 *
 * Each service shows: name, description, price (formatted in €), duration
 * (when present), and a visual-only "Reservar" button (Phase 1 — no action).
 * Inactive services (activo=false) are already filtered server-side.
 */
export function DoctorServices({
  services,
}: DoctorServicesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Servicios</CardTitle>
      </CardHeader>
      <CardContent>
        {services.length === 0 ? (
          <EmptyState />
        ) : (
          <ServicesList services={services} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Internal sub-components ────────────────────────────────────────────

function EmptyState() {
  return (
    <p className="text-sm text-muted-foreground">
      No hay servicios configurados.
    </p>
  );
}

function ServicesList({
  services,
}: {
  services: DoctorServiceResponse[];
}) {
  return (
    <div className="space-y-3">
      {services.map((service) => (
        <div
          key={service.id}
          className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex-1 space-y-1">
            <span className="font-medium">{service.nombre}</span>
            {service.descripcion && (
              <p className="text-sm text-muted-foreground">
                {service.descripcion}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {service.precio.toFixed(2)} €
              </span>
              {service.duracionMinutos != null && (
                <span className="text-xs text-muted-foreground">
                  {service.duracionMinutos} min
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" disabled>
            Reservar
          </Button>
        </div>
      ))}
    </div>
  );
}
