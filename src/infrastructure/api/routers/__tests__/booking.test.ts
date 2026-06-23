import { describe, expect, it } from "vitest";
import { generateSlots } from "@/infrastructure/booking/slot-utils";

// The rest of the booking procedures are tested via integration tests
// that require a database. Here we test the pure functions.

describe("generateSlots (pure logic)", () => {
  it("generates slots for a simple range", () => {
    const slots = generateSlots("2026-07-15", [{ inicio: "09:00", fin: "10:00" }], new Set());
    expect(slots).toHaveLength(2);
  });

  it("filters out booked slots correctly", () => {
    const booked = new Set(["09:00"]);
    const slots = generateSlots("2026-07-15", [{ inicio: "09:00", fin: "11:00" }], booked);
    expect(slots[0]!.available).toBe(false);
    expect(slots[1]!.available).toBe(true);
  });
});

describe("Slot boundary cases", () => {
  it("handles edge of day times (early morning)", () => {
    const slots = generateSlots("2026-07-15", [{ inicio: "00:00", fin: "01:00" }], new Set());
    expect(slots).toHaveLength(2);
    // Verify slots are valid ISO strings with 30-min difference
    expect(() => new Date(slots[0]!.start)).not.toThrow();
    expect(() => new Date(slots[1]!.start)).not.toThrow();
    const diff = new Date(slots[1]!.start).getTime() - new Date(slots[0]!.start).getTime();
    expect(diff).toBe(30 * 60 * 1000);
  });

  it("handles full day range (generates 48 slots for 24h)", () => {
    const slots = generateSlots("2026-07-15", [{ inicio: "00:00", fin: "24:00" }], new Set());
    expect(slots).toHaveLength(48);
  });

  it("returns empty for no availability", () => {
    const slots = generateSlots("2026-07-15", [], new Set());
    expect(slots).toHaveLength(0);
  });
});
