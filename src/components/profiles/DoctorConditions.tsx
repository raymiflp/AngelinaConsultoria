import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DoctorConditionResponse } from "@/infrastructure/profiles/schemas";

// ─── Props ─────────────────────────────────────────────────────────────

export interface DoctorConditionsProps {
  conditions: DoctorConditionResponse[];
}

// ─── Component ──────────────────────────────────────────────────────────

/**
 * DoctorConditions — tag cloud of treated conditions.
 *
 * Renders each condition as a secondary Badge in a flex-wrap container.
 * Handles empty state and loading skeleton with small rounded rectangles.
 */
export function DoctorConditions({
  conditions,
}: DoctorConditionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Condiciones que trata</CardTitle>
      </CardHeader>
      <CardContent>
        {conditions.length === 0 ? (
          <EmptyState />
        ) : (
          <ConditionsCloud conditions={conditions} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Internal sub-components ────────────────────────────────────────────

function EmptyState() {
  return (
    <p className="text-sm text-muted-foreground">
      No hay condiciones registradas.
    </p>
  );
}

function ConditionsCloud({
  conditions,
}: {
  conditions: DoctorConditionResponse[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {conditions.map((condition) => (
        <Badge key={condition.id} variant="secondary">
          {condition.nombre}
        </Badge>
      ))}
    </div>
  );
}
