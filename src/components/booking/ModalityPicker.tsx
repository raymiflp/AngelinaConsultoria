"use client";

import { MapPin, Video } from "lucide-react";

import { ConsultaModalidad } from "@/domain/enums";
import { cn } from "@/lib/utils";

export interface ModalityPickerProps {
  /**
   * Currently selected modality, or `undefined` when the user has not yet
   * picked one. The picker renders a radio group where each option is
   * `aria-checked` when its value matches.
   */
  value: ConsultaModalidad | undefined;
  /**
   * Called when the user clicks a modality card. The disabled-Online
   * option does NOT fire onChange (the click is swallowed).
   */
  onChange: (modalidad: ConsultaModalidad) => void;
  /**
   * When true, the "Online" (Videollamada) option is rendered as disabled
   * with a tooltip "Este doctor no ofrece consultas online". The
   * Presencial option is always enabled.
   */
  onlineDisabled: boolean;
  /**
   * Optional disabled state for the whole picker (e.g. while a booking
   * mutation is in flight).
   */
  disabled?: boolean;
}

/**
 * ModalityPicker — two-card radio group for picking Presencial / Online.
 *
 * Visibility behavior (per design §7.1 + D4):
 * - Presencial is always enabled.
 * - Online is disabled (with a Spanish tooltip) when the doctor has not
 *   opted in to online consultations (`doctor.aceptaOnline === false`).
 *
 * Accessibility:
 * - The wrapping `<div>` has `role="radiogroup"` and an `aria-label`.
 * - Each card is a `<button role="radio">` with `aria-checked` bound to
 *   the current `value`.
 *
 * Per D7 / AD-7: a disabled button (not a tooltip-only "off" state) is
 * the right UX for "this option is not available for this doctor" — the
 * patient sees the choice exists, sees why it is unavailable, and can
 * still pick Presencial.
 */
export function ModalityPicker({
  value,
  onChange,
  onlineDisabled,
  disabled,
}: ModalityPickerProps) {
  return (
    <div
      className="space-y-2"
      role="radiogroup"
      aria-label="Modalidad de consulta"
    >
      <p className="text-sm font-medium">Modalidad de consulta</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={value === ConsultaModalidad.PRESENCIAL}
          disabled={disabled}
          onClick={() => onChange(ConsultaModalidad.PRESENCIAL)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === ConsultaModalidad.PRESENCIAL
              ? "border-primary bg-primary/5"
              : "border-input",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <MapPin className="size-4" aria-hidden="true" />
          Presencial
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === ConsultaModalidad.ONLINE}
          disabled={onlineDisabled || disabled}
          title={
            onlineDisabled
              ? "Este doctor no ofrece consultas online"
              : undefined
          }
          onClick={() => {
            if (!onlineDisabled) onChange(ConsultaModalidad.ONLINE);
          }}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === ConsultaModalidad.ONLINE
              ? "border-primary bg-primary/5"
              : "border-input",
            onlineDisabled && "cursor-not-allowed opacity-50",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <Video className="size-4" aria-hidden="true" />
          Videollamada
        </button>
      </div>
    </div>
  );
}
