/**
 * Utility functions for slot generation — pure functions, no side effects,
 * fully testable without database access.
 */

export interface Slot {
  start: string;
  end: string;
  available: boolean;
}

/**
 * Day-of-week name mapping (Spanish) from JS getDay() index.
 */
const DAY_MAP: Record<string, string> = {
  "0": "domingo",
  "1": "lunes",
  "2": "martes",
  "3": "miercoles",
  "4": "jueves",
  "5": "viernes",
  "6": "sabado",
};

/**
 * Returns the Spanish day name for a given date.
 */
export function getDayName(date: Date): string {
  return DAY_MAP[date.getDay().toString()] ?? "lunes";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Formats a Date as "HH:mm".
 */
export function formatHHMM(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Generate 30-minute slots from availability ranges,
 * filtering out booked start-times.
 *
 * Pure function — no I/O, no side effects.
 * Creates dates in LOCAL timezone since both the availability ranges
 * (e.g. "09:00-14:00") and the DB citas use local time.
 */
export function generateSlots(
  dateStr: string,
  ranges: Array<{ inicio: string; fin: string }>,
  bookedStartTimes: Set<string>,
): Slot[] {
  const slots: Slot[] = [];

  // Parse "2026-07-15" into [year, month, day]
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return [];

  for (const range of ranges) {
    const [startH, startM] = range.inicio.split(":").map(Number);
    const [endH, endM] = range.fin.split(":").map(Number);

    if (
      startH === undefined ||
      startM === undefined ||
      endH === undefined ||
      endM === undefined
    )
      continue;

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    for (let m = startMinutes; m + 30 <= endMinutes; m += 30) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const timeStr = `${pad(h)}:${pad(min)}`;

      // Create date in LOCAL timezone to keep slot times consistent
      // with the availability ranges and DB citas
      const slotStart = new Date(year, month - 1, day, h, min, 0);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        available: !bookedStartTimes.has(timeStr),
      });
    }
  }

  return slots;
}
