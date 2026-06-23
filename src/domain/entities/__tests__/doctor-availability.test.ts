import { describe, expect, it } from "vitest";
import { DoctorAvailability, disponibilidadSchema } from "../doctor-availability";
import { generateSlots } from "@/infrastructure/booking/slot-utils";

describe("DoctorAvailability", () => {
  describe("create", () => {
    it("creates with valid disponibilidad", () => {
      const da = DoctorAvailability.create({
        doctorId: "doctor-uuid",
        disponibilidad: {
          lunes: [{ inicio: "09:00", fin: "12:00" }],
        },
      });
      expect(da.id).toBeTruthy();
      expect(da.doctorId).toBe("doctor-uuid");
      expect(da.disponibilidad.lunes).toHaveLength(1);
    });

    it("rejects invalid day key via Zod", () => {
      expect(() =>
        DoctorAvailability.create({
          doctorId: "doctor-uuid",
          disponibilidad: {
            lunes: [{ inicio: "09:00", fin: "12:00" }],
            invalidDay: [{ inicio: "10:00", fin: "14:00" }],
          } as any,
        }),
      ).toThrow();
    });
  });

  describe("hasOverlappingRanges", () => {
    it("detects overlapping ranges", () => {
      const ranges = [
        { inicio: "09:00", fin: "12:00" },
        { inicio: "11:00", fin: "13:00" },
      ];
      expect(DoctorAvailability.hasOverlappingRanges(ranges)).toBe(true);
    });

    it("accepts non-overlapping ranges", () => {
      const ranges = [
        { inicio: "09:00", fin: "12:00" },
        { inicio: "13:00", fin: "17:00" },
      ];
      expect(DoctorAvailability.hasOverlappingRanges(ranges)).toBe(false);
    });

    it("touching ranges (end = next start) are not overlapping", () => {
      const ranges = [
        { inicio: "09:00", fin: "12:00" },
        { inicio: "12:00", fin: "17:00" },
      ];
      expect(DoctorAvailability.hasOverlappingRanges(ranges)).toBe(false);
    });
  });
});

describe("disponibilidadSchema", () => {
  it("validates correct disponibilidad", () => {
    const input = {
      lunes: [{ inicio: "09:00", fin: "12:00" }],
      miercoles: [{ inicio: "14:00", fin: "18:00" }],
    };
    const result = disponibilidadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects empty array per day", () => {
    const input = { lunes: [] };
    const result = disponibilidadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects start >= end", () => {
    const input = {
      lunes: [{ inicio: "12:00", fin: "09:00" }],
    };
    const result = disponibilidadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("generateSlots", () => {
  it("generates 30-min slots from a single range", () => {
    const slots = generateSlots("2026-07-15", [{ inicio: "09:00", fin: "10:00" }], new Set());
    expect(slots).toHaveLength(2);
    // Use getHours/getMinutes which are timezone-local — works in any TZ
    expect(new Date(slots[0]!.start).getHours()).toBe(9);
    expect(new Date(slots[0]!.start).getMinutes()).toBe(0);
    expect(new Date(slots[1]!.start).getHours()).toBe(9);
    expect(new Date(slots[1]!.start).getMinutes()).toBe(30);
  });

  it("marks booked slots as unavailable", () => {
    const booked = new Set(["09:30"]);
    const slots = generateSlots("2026-07-15", [{ inicio: "09:00", fin: "11:00" }], booked);
    // 09:00, 09:30, 10:00, 10:30 → 4 slots
    expect(slots).toHaveLength(4);
    expect(slots[0]!.available).toBe(true);
    expect(slots[1]!.available).toBe(false); // 09:30 booked
    expect(slots[2]!.available).toBe(true);
    expect(slots[3]!.available).toBe(true);
  });

  it("returns empty when no ranges", () => {
    const slots = generateSlots("2026-07-15", [], new Set());
    expect(slots).toHaveLength(0);
  });

  it("handles multiple ranges in the same day", () => {
    const slots = generateSlots(
      "2026-07-15",
      [
        { inicio: "09:00", fin: "10:00" },
        { inicio: "14:00", fin: "15:00" },
      ],
      new Set(),
    );
    expect(slots).toHaveLength(4); // 09:00, 09:30, 14:00, 14:30
    expect(new Date(slots[0]!.start).getHours()).toBe(9);
    expect(new Date(slots[0]!.start).getMinutes()).toBe(0);
    expect(new Date(slots[2]!.start).getHours()).toBe(14);
    expect(new Date(slots[2]!.start).getMinutes()).toBe(0);
  });

  it("marks all slots unavailable when all times are booked", () => {
    const booked = new Set(["09:00", "09:30"]);
    const slots = generateSlots("2026-07-15", [{ inicio: "09:00", fin: "10:00" }], booked);
    expect(slots.every((s) => !s.available)).toBe(true);
  });

  it("does not generate slots past end boundary", () => {
    // Range 09:00-10:00 → 09:00 and 09:30 (30 min each). 10:00 is exactly end, not included.
    const slots = generateSlots("2026-07-15", [{ inicio: "09:00", fin: "10:00" }], new Set());
    expect(slots).toHaveLength(2);
    expect(new Date(slots[slots.length - 1]!.start).getHours()).toBe(9);
    expect(new Date(slots[slots.length - 1]!.start).getMinutes()).toBe(30);
  });
});
