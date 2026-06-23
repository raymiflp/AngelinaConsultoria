"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/infrastructure/api";
import { ModalityPicker, SlotGrid, type SlotData } from "@/components/booking";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ConsultaModalidad } from "@/domain/enums";

// ─── Skeleton ───────────────────────────────────────────────────────────

function AgendarSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function AgendarPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const doctorId = params.id as string;

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    undefined,
  );
  // modality-toggle (PR-B): the page now owns the wizard state. The SlotGrid
  // callback only emits the slot; modality + motivo are owned here so the
  // canConfirm rule (per design §9.4) can evaluate all three at once.
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null);
  const [modalidad, setModalidad] = useState<ConsultaModalidad | undefined>(
    undefined,
  );
  const [motivo, setMotivo] = useState("");

  const bookingMutation = api.bookings.createAppointment.useMutation();

  // Fetch doctor profile
  const {
    data: doctor,
    isLoading: doctorLoading,
    isError: doctorError,
  } = api.profiles.getDoctorProfile.useQuery(
    { doctorId },
    { enabled: !!doctorId },
  );

  // Map Spanish day names to JS getDay() indexes (0=domingo, 6=sabado)
  const DAY_INDEX_MAP: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miercoles: 3,
    jueves: 4, viernes: 5, sabado: 6,
  };

  // Fetch doctor's weekly availability pattern
  const { data: availability } = api.bookings.getDoctorAvailability.useQuery(
    { doctorId },
    { enabled: !!doctorId },
  );

  const availableDayIndexes = availability
    ? availability.availableDays.map(
        (d) => DAY_INDEX_MAP[d],
      ).filter((i): i is number => i !== undefined)
    : undefined;

  // Fetch slots for selected date
  const dateStr = selectedDate
    ? format(selectedDate, "yyyy-MM-dd")
    : undefined;

  const {
    data: slots,
    isLoading: slotsLoading,
    isError: slotsError,
  } = api.bookings.getDoctorSlots.useQuery(
    { doctorId, date: dateStr! },
    { enabled: !!doctorId && !!dateStr },
  );

  // The Online option is hidden/disabled when the doctor has not opted in.
  // The server-side gate in `createAppointmentUseCase` is the security
  // boundary; this is purely a UX hint (per AD-13 / D5).
  const onlineDisabled = doctor?.aceptaOnline === false;

  const handleSlotSelect = (slot: SlotData) => {
    setSelectedSlot(slot);
    // Reset downstream state when the user picks a new slot.
    setModalidad(undefined);
    setMotivo("");
  };

  const handleConfirm = async () => {
    if (!selectedSlot || !modalidad || !motivo.trim()) return;
    if (!session) {
      toast.error("Debes iniciar sesión para reservar una cita");
      router.push("/login");
      return;
    }

    try {
      const result = await bookingMutation.mutateAsync({
        doctorId,
        fechaHora: selectedSlot.start,
        motivoConsulta: motivo.trim(),
        modalidad,
      });
      toast.success("Cita reservada correctamente");
      if (result) router.push(`/citas/${result.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al reservar la cita";
      toast.error(message);
    }
  };

  // Loading doctor
  if (doctorLoading) {
    return (
      <div className="mx-auto max-w-lg">
        <AgendarSkeleton />
      </div>
    );
  }

  // Doctor error
  if (doctorError || !doctor) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Doctor no encontrado</AlertTitle>
          <AlertDescription>
            El doctor que buscas no existe o ha sido dado de baja.
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

  // The "Confirmar reserva" button is enabled iff all three fields are set
  // (slot + modality + motivo) and the mutation is not in flight (per
  // design §9.4).
  const canConfirm =
    selectedSlot !== null &&
    modalidad !== undefined &&
    motivo.trim().length > 0 &&
    !bookingMutation.isPending;

  const selectedSlotDate = selectedSlot ? new Date(selectedSlot.start) : null;
  const selectedSlotLabel = selectedSlotDate
    ? `${selectedSlotDate.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })} a las ${selectedSlotDate.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : null;

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      {/* Back link */}
      <Link
        href={`/doctores/${doctorId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al perfil del doctor
      </Link>

      {/* Doctor info */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {doctor.nombre}
        </h1>
        <p className="text-sm text-muted-foreground">{doctor.especialidad}</p>
      </div>

      {/* Slot selector */}
      <SlotGrid
        slots={(slots ?? []) as SlotData[]}
        isLoading={slotsLoading}
        selectedDate={selectedDate}
        onDateSelect={(d) => {
          setSelectedDate(d);
          setSelectedSlot(null);
          setModalidad(undefined);
          setMotivo("");
        }}
        onSlotSelect={handleSlotSelect}
        selectedSlot={selectedSlot}
        availableDayIndexes={availableDayIndexes}
      />

      {/* Wizard: modality + motivo + confirm (modality-toggle, PR-B) */}
      {selectedSlot && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1">
            <h3 className="font-medium">Confirmar cita</h3>
            <p className="text-sm text-muted-foreground">{selectedSlotLabel}</p>
          </div>

          <ModalityPicker
            value={modalidad}
            onChange={setModalidad}
            onlineDisabled={onlineDisabled}
            disabled={bookingMutation.isPending}
          />

          <div className="space-y-2">
            <label htmlFor="motivo" className="text-sm font-medium">
              Motivo de consulta
            </label>
            <Textarea
              id="motivo"
              placeholder="Describe el motivo de tu consulta..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={1000}
              disabled={bookingMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              {motivo.length}/1000 caracteres
            </p>
          </div>

          <Button
            className="w-full"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {bookingMutation.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Confirmar reserva
          </Button>
        </div>
      )}

      {slotsError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error al cargar los turnos</AlertTitle>
          <AlertDescription>
            Intenta de nuevo más tarde.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
