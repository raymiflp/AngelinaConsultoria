import { GraduationCap, Briefcase } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { DoctorExperienceResponse } from "@/infrastructure/profiles/schemas";

// ─── Props ─────────────────────────────────────────────────────────────

export interface DoctorExperienceProps {
  experience: DoctorExperienceResponse[];
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Formats a date range string from ISO date parts.
 * "2020-01-15", null → "2020 – Presente"
 * "2015-09-01", "2019-06-30" → "2015 – 2019"
 */
function formatDateRange(fechaInicio: string, fechaFin: string | null): string {
  const startYear = fechaInicio.split("-")[0] ?? "";
  if (!fechaFin) return `${startYear} – Presente`;
  const endYear = fechaFin.split("-")[0] ?? "";
  return `${startYear} – ${endYear}`;
}

// ─── Component ──────────────────────────────────────────────────────────

/**
 * DoctorExperience — timeline of education and work experience entries.
 *
 * Education entries show a graduation cap icon; work entries show a briefcase.
 * Each entry displays the titulo, institution, and formatted date range.
 * Sorted by orden ASC then fechaInicio DESC (server-sent order preserved).
 */
export function DoctorExperience({
  experience,
}: DoctorExperienceProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Experiencia</CardTitle>
      </CardHeader>
      <CardContent>
        {experience.length === 0 ? (
          <EmptyState />
        ) : (
          <ExperienceList experience={experience} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Internal sub-components ────────────────────────────────────────────

function EmptyState() {
  return (
    <p className="text-sm text-muted-foreground">
      Sin experiencia registrada.
    </p>
  );
}

function ExperienceList({
  experience,
}: {
  experience: DoctorExperienceResponse[];
}) {
  return (
    <div className="space-y-4">
      {experience.map((entry, index) => (
        <div key={entry.id}>
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
              {entry.tipo === "education" ? (
                <GraduationCap className="size-5 text-secondary-foreground" />
              ) : (
                <Briefcase className="size-5 text-secondary-foreground" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="font-medium">{entry.titulo}</span>
              <span className="text-sm text-muted-foreground">
                {entry.institucion}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateRange(entry.fechaInicio, entry.fechaFin)}
              </span>
            </div>
          </div>
          {index < experience.length - 1 && (
            <Separator className="mt-4" />
          )}
        </div>
      ))}
    </div>
  );
}
