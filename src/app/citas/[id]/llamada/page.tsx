"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { AlertTriangle, ArrowLeft, Calendar, Loader2 } from "lucide-react";

import { api } from "@/infrastructure/api";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Call page at `/citas/[id]/llamada`.
 *
 * Renders the LiveKit video room for an in-progress or imminent cita.
 *
 * Three states:
 *   1. **Loading** — spinner + "Conectando con la sala…"
 *   2. **Error**   — error message + Reintentar + Volver
 *   3. **Success** — sticky top bar + `<LiveKitRoom>` + `<VideoConference>`
 *
 * On room disconnect, navigates back to the detail page.
 *
 * The query is gated on `!!session` so anonymous users do not fire a
 * request that would 401. The auth boundary is upstream (the route
 * group / middleware); this page is protected by the app's auth layer.
 */
export default function CallPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();

  const citaId = params.id;
  const { data, isLoading, isError, error, refetch } =
    api.bookings.getRoomToken.useQuery(
      { citaId },
      { enabled: !!session, retry: 1 },
    );

  // The cita summary in the top bar needs `fechaHora`. We re-use the
  // existing `getMyAppointments` query (the same one the detail page
  // already calls) and find the matching cita by id. The list is small
  // and the React Query cache is shared with the detail page.
  const { data: appointments } = api.bookings.getMyAppointments.useQuery(
    {},
    { enabled: !!session },
  );
  const cita = appointments?.find((a) => a.id === citaId);
  const citaSummary = cita
    ? formatCitaDateTime(new Date(cita.fechaHora))
    : null;

  // ─── Loading state ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-3 py-24">
        <Loader2
          className="size-8 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <p
          className="text-sm text-muted-foreground"
          aria-live="polite"
        >
          Conectando con la sala…
        </p>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────
  if (isError) {
    const errorMessage =
      error?.message ?? "No se pudo establecer la conexión con la videollamada.";

    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 py-12">
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>No se pudo iniciar la videollamada</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void refetch()}>Reintentar</Button>
          <Button variant="outline" asChild>
            <Link href={`/citas/${citaId}`}>
              <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
              Volver
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ─── Success state ──────────────────────────────────────────────
  if (!data) {
    return null;
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      {/* Sticky top bar — always-visible back link, "En vivo" badge, cita summary. */}
      <div className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`/citas/${citaId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Volver a la cita</span>
            <span className="sm:hidden">Volver</span>
          </Link>

          <div
            className="flex items-center gap-2"
            aria-live="polite"
            data-testid="en-vivo-badge"
          >
            <span
              className="size-2 animate-pulse rounded-full bg-red-500"
              aria-hidden="true"
            />
            <span className="text-sm font-medium">En vivo</span>
          </div>

          {citaSummary && (
            <div
              className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"
              data-testid="cita-summary"
            >
              <Calendar className="size-3" aria-hidden="true" />
              <span>{citaSummary}</span>
            </div>
          )}
        </div>
      </div>

      {/* LiveKit room — fills the remaining viewport height. */}
      <div className="flex-1 bg-black">
        <LiveKitRoom
          serverUrl={data.serverUrl}
          token={data.token}
          connect
          video
          audio
          onDisconnected={() => router.push(`/citas/${citaId}`)}
          data-testid="livekit-room"
        >
          <VideoConference />
        </LiveKitRoom>
      </div>

      {/*
        livekit-webhooks (D10 mitigation): the previous "Si la videollamada
        termina, recuerda marcar la cita como completada..." footer was the
        confession of a known limitation. It is now auto-completed by the
        POST /api/livekit/webhook → autoCompleteOnRoomFinishedUseCase
        pipeline, so the footer is removed. The audit log is the
        traceability surface; the call page shows the current state, period.
        See video-calls-ui/spec.md REQ-VCU-WH-1.
      */}
    </div>
  );
}

/**
 * Format a cita's `fechaHora` for the top bar (e.g. "15 jun 2026, 14:30").
 * Spanish locale; full month + short year; 24-hour time.
 */
function formatCitaDateTime(d: Date): string {
  const date = d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${time}`;
}

