"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface SlotData {
  start: string;
  end: string;
  available: boolean;
}

interface SlotGridProps {
  slots: SlotData[];
  isLoading: boolean;
  selectedDate: Date | undefined;
  onDateSelect: (date: Date | undefined) => void;
  /**
   * Called when the user clicks an available slot. The slot is the only
   * argument — the parent owns the modality and motivo state (modality-toggle,
   * PR-B).
   */
  onSlotSelect: (slot: SlotData) => void;
  /**
   * The currently selected slot (highlighted in the grid), or null.
   * Re-renders the grid when the parent clears the selection.
   */
  selectedSlot: SlotData | null;
  /**
   * JS day-of-week indexes (0=domingo, 1=lunes, ... 6=sábado) that the
   * doctor has availability. Dates outside these days are disabled.
   * When omitted, all future dates are selectable.
   */
  availableDayIndexes?: number[];
}

/**
 * SlotGrid — date picker + time slot grid.
 *
 * - Calendar (react-day-picker) for date selection
 * - 30-min slot buttons, disabled when past or booked
 * - Clicking an available slot calls `onSlotSelect(slot)` and the parent
 *   owns the rest of the wizard state (modality + motivo).
 *
 * The motivo textarea was removed in PR-B (modality-toggle): it now lives
 * in the booking page, below the <ModalityPicker>, per design §7.1 / §9.2.
 * The "Confirmar reserva" button also moved to the page so the parent can
 * enable it when slot + modality + motivo are all set (per design §9.4).
 */
export function SlotGrid({
  slots,
  isLoading,
  selectedDate,
  onDateSelect,
  onSlotSelect,
  selectedSlot,
  availableDayIndexes,
}: SlotGridProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleSlotClick = (slot: SlotData) => {
    if (!slot.available) return;

    // Disable past slots
    const slotStart = new Date(slot.start);
    if (slotStart <= new Date()) return;

    onSlotSelect(slot);
  };

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !selectedDate && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="size-4" />
            {selectedDate
              ? format(selectedDate, "PPP", { locale: es })
              : "Seleccionar fecha"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={onDateSelect}
            disabled={(date) =>
              date < today ||
              (availableDayIndexes
                ? !availableDayIndexes.includes(date.getDay())
                : false)
            }
            locale={es}
          />
        </PopoverContent>
      </Popover>

      {/* Slots grid */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && selectedDate && slots.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          El doctor no tiene turnos disponibles para esta fecha
        </p>
      )}

      {!isLoading && slots.length > 0 && (
        (() => {
          const availableSlots = slots.filter((slot) => {
            if (!slot.available) return false;
            return new Date(slot.start) > new Date();
          });

          if (availableSlots.length === 0) {
            return (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Todos los turnos de esta fecha están ocupados
              </p>
            );
          }

          return (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {availableSlots.map((slot) => {
              const slotDate = new Date(slot.start);
              const timeStr = slotDate.toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const isSelected = selectedSlot?.start === slot.start;

              return (
                <Button
                  key={slot.start}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="cursor-pointer text-xs"
                  onClick={() => handleSlotClick(slot)}
                >
                  {timeStr}
                </Button>
              );
            })}
        </div>
          );
        })()
      )}

      {!selectedDate && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Selecciona una fecha para ver los turnos disponibles
        </p>
      )}
    </div>
  );
}
