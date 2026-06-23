"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { api } from "@/infrastructure/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Day names in Spanish matching the DB schema enum.
 */
const DAYS = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];

interface TimeRange {
  inicio: string;
  fin: string;
}

type AvailabilityState = Partial<Record<DayKey, TimeRange[]>>;

/**
 * Creates an empty availability state.
 */
function emptyAvailability(): AvailabilityState {
  return {};
}

/**
 * Checks if a time range string is valid HH:MM format.
 */
function isValidTime(val: string): boolean {
  return /^\d{2}:\d{2}$/.test(val);
}

/**
 * Validates that `inicio < fin`.
 */
function isValidRange(range: TimeRange): boolean {
  return isValidTime(range.inicio) && isValidTime(range.fin) && range.inicio < range.fin;
}

export default function DisponibilidadPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Guard: redirect non-authenticated and non-DOCTOR
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      const role = (session?.user as { role?: string })?.role;
      if (role !== "DOCTOR") {
        router.push("/dashboard");
      }
    }
  }, [status, session, router]);

  const {
    data: existingAvailability,
    isLoading,
    isError,
  } = api.availability.getMyAvailability.useQuery(undefined, {
    enabled: status === "authenticated",
  });

  const saveMutation = api.availability.setAvailability.useMutation({
    onSuccess: () => {
      toast.success("Disponibilidad guardada correctamente");
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al guardar la disponibilidad");
    },
  });

  const [availability, setAvailability] = useState<AvailabilityState>({});

  // Populate form from existing data once loaded
  useEffect(() => {
    if (existingAvailability && !saveMutation.isPending) {
      const loaded: AvailabilityState = {};
      for (const day of DAYS) {
        const ranges = (existingAvailability as Record<string, TimeRange[]> | undefined)?.[day.key];
        if (ranges && ranges.length > 0) {
          loaded[day.key] = ranges.map((r) => ({ ...r }));
        }
      }
      setAvailability(loaded);
    }
  }, [existingAvailability, saveMutation.isPending]);

  const toggleDay = useCallback((day: DayKey) => {
    setAvailability((prev) => {
      if (prev[day]) {
        const next = { ...prev };
        delete next[day];
        return next;
      }
      return { ...prev, [day]: [{ inicio: "09:00", fin: "14:00" }] };
    });
  }, []);

  const addRange = useCallback((day: DayKey) => {
    setAvailability((prev) => {
      const current = prev[day] ?? [];
      return { ...prev, [day]: [...current, { inicio: "", fin: "" }] };
    });
  }, []);

  const removeRange = useCallback((day: DayKey, index: number) => {
    setAvailability((prev) => {
      const current = prev[day] ?? [];
      const next = current.filter((_, i) => i !== index);
      const result = { ...prev };
      if (next.length === 0) {
        delete result[day];
      } else {
        result[day] = next;
      }
      return result;
    });
  }, []);

  const updateRange = useCallback(
    (day: DayKey, index: number, field: "inicio" | "fin", value: string) => {
      setAvailability((prev) => {
        const current = prev[day] ?? [];
        const updated = current.map((r, i) =>
          i === index ? { ...r, [field]: value } : r,
        );
        return { ...prev, [day]: updated };
      });
    },
    [],
  );

  const handleSave = useCallback(() => {
    // Validate all ranges before saving
    const errors: string[] = [];
    for (const day of DAYS) {
      const ranges = availability[day.key];
      if (!ranges || ranges.length === 0) continue;
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i]!;
        if (!isValidTime(r.inicio)) {
          errors.push(`${day.label}: hora de inicio inválida "${r.inicio}"`);
        }
        if (!isValidTime(r.fin)) {
          errors.push(`${day.label}: hora de fin inválida "${r.fin}"`);
        }
        if (isValidTime(r.inicio) && isValidTime(r.fin) && !isValidRange(r)) {
          errors.push(`${day.label}: la hora de inicio debe ser anterior a la de fin`);
        }
      }
    }

    if (errors.length > 0) {
      for (const err of errors) {
        toast.error(err);
      }
      return;
    }

    // Build the payload — only include days that have valid ranges
    const disponibilidad: Record<string, TimeRange[]> = {};
    for (const day of DAYS) {
      const ranges = availability[day.key];
      if (ranges && ranges.length > 0 && ranges.every((r) => isValidRange(r))) {
        disponibilidad[day.key] = ranges;
      }
    }

    if (Object.keys(disponibilidad).length === 0) {
      toast.error("Debes configurar al menos un día con horarios válidos");
      return;
    }

    saveMutation.mutate({ disponibilidad });
  }, [availability, saveMutation]);

  if (status === "loading" || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestionar Disponibilidad</h1>
          <p className="text-muted-foreground">
            Configura tu horario semanal de atención
          </p>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestionar Disponibilidad</h1>
          <p className="text-muted-foreground">
            Configura tu horario semanal de atención
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            No se pudo cargar tu disponibilidad actual. Intenta de nuevo más tarde.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al panel
      </Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestionar Disponibilidad</h1>
          <p className="text-muted-foreground">
            Configura tu horario semanal de atención
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" />
              Guardar
            </>
          )}
        </Button>
      </div>

      <div className="space-y-3">
        {DAYS.map((day) => {
          const ranges = availability[day.key] ?? [];
          const isActive = ranges.length > 0;

          return (
            <Card
              key={day.key}
              className={!isActive ? "opacity-60" : undefined}
            >
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleDay(day.key)}
                    className="p-0 hover:bg-transparent"
                  >
                    {isActive ? (
                      <CheckCircle2 className="size-5 text-green-500" />
                    ) : (
                      <XCircle className="size-5 text-muted-foreground" />
                    )}
                  </Button>
                  <CardTitle className="text-base font-medium">
                    {day.label}
                  </CardTitle>
                  {isActive && (
                    <Badge variant="outline" className="text-xs">
                      {ranges.length} {ranges.length === 1 ? "bloque" : "bloques"}
                    </Badge>
                  )}
                </div>
                {isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addRange(day.key)}
                  >
                    <Plus className="mr-1 size-4" />
                    Añadir bloque
                  </Button>
                )}
              </CardHeader>

              {isActive && (
                <CardContent className="pb-4">
                  <div className="space-y-2">
                    {ranges.map((range, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`${day.key}-inicio-${index}`} className="sr-only">
                            Hora inicio
                          </Label>
                          <Input
                            id={`${day.key}-inicio-${index}`}
                            type="time"
                            value={range.inicio}
                            onChange={(e) =>
                              updateRange(day.key, index, "inicio", e.target.value)
                            }
                            className="w-32"
                          />
                        </div>
                        <span className="text-muted-foreground">a</span>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`${day.key}-fin-${index}`} className="sr-only">
                            Hora fin
                          </Label>
                          <Input
                            id={`${day.key}-fin-${index}`}
                            type="time"
                            value={range.fin}
                            onChange={(e) =>
                              updateRange(day.key, index, "fin", e.target.value)
                            }
                            className="w-32"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRange(day.key, index)}
                          className="ml-auto size-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Save button at the bottom too */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          size="lg"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" />
              Guardar cambios
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
