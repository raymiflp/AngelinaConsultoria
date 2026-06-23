import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases CSS con soporte para Tailwind v4.
 * Mergea clases conflictivas inteligentemente.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
