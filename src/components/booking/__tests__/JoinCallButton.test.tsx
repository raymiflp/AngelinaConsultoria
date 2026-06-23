import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConsultaModalidad, ConsultationStatus } from "@/domain/enums";

import { JoinCallButton } from "../JoinCallButton";

// ─── Router mock ───────────────────────────────────────────────────────
//
// The `tests/setup.ts` global mock stubs `useRouter` from `next/navigation`
// with `vi.fn()` methods. Here we hoist a shared ref to the same `push`
// mock so individual tests can assert the navigation target.

const mockRouterPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({
      push: mockRouterPush,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

// ─── Helpers ───────────────────────────────────────────────────────────

const CITA_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
const BUTTON_LABEL = /unirse a la videollamada/i;

/**
 * Build a `fechaHora` Date offset from "now" by the given minutes.
 * Pinned to the `Date.now()` returned by `vi.useFakeTimers()`.
 */
function fechaHoraOffsetMinutes(offsetMinutes: number): Date {
  return new Date(Date.now() + offsetMinutes * 60 * 1000);
}

beforeEach(() => {
  // Pin "now" to a fixed instant so the ±15 min window is deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T14:30:00.000Z"));
  mockRouterPush.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("JoinCallButton", () => {
  describe("visibility — visible states (modality=ONLINE)", () => {
    it("is visible for EN_CURSO regardless of time", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.EN_CURSO}
          fechaHora={fechaHoraOffsetMinutes(60 * 24 * 7)} // 7 days in the future
          isDoctor={true}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      const button = screen.getByRole("button", { name: BUTTON_LABEL });
      expect(button).toBeInTheDocument();
    });

    it("is visible for CONFIRMADA +10 min (within forward window)", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.CONFIRMADA}
          fechaHora={fechaHoraOffsetMinutes(10)}
          isDoctor={true}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      expect(
        screen.getByRole("button", { name: BUTTON_LABEL }),
      ).toBeInTheDocument();
    });

    it("is visible for CONFIRMADA -10 min (within backward window, symmetric)", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.CONFIRMADA}
          fechaHora={fechaHoraOffsetMinutes(-10)}
          isDoctor={false}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      expect(
        screen.getByRole("button", { name: BUTTON_LABEL }),
      ).toBeInTheDocument();
    });
  });

  describe("visibility — hidden states (modality=ONLINE)", () => {
    it("is hidden for PENDIENTE", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.PENDIENTE}
          fechaHora={fechaHoraOffsetMinutes(0)}
          isDoctor={true}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      expect(screen.queryByRole("button", { name: BUTTON_LABEL })).toBeNull();
    });

    it("is hidden for CONFIRMADA +30 min (outside forward window)", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.CONFIRMADA}
          fechaHora={fechaHoraOffsetMinutes(30)}
          isDoctor={true}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      expect(screen.queryByRole("button", { name: BUTTON_LABEL })).toBeNull();
    });

    it("is hidden for CONFIRMADA -30 min (outside backward window)", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.CONFIRMADA}
          fechaHora={fechaHoraOffsetMinutes(-30)}
          isDoctor={false}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      expect(screen.queryByRole("button", { name: BUTTON_LABEL })).toBeNull();
    });

    it("is hidden for COMPLETADA", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.COMPLETADA}
          fechaHora={fechaHoraOffsetMinutes(0)}
          isDoctor={true}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      expect(screen.queryByRole("button", { name: BUTTON_LABEL })).toBeNull();
    });

    it("is hidden for CANCELADA", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.CANCELADA}
          fechaHora={fechaHoraOffsetMinutes(0)}
          isDoctor={true}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      expect(screen.queryByRole("button", { name: BUTTON_LABEL })).toBeNull();
    });

    it("is hidden for NO_ASISTIO", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.NO_ASISTIO}
          fechaHora={fechaHoraOffsetMinutes(0)}
          isDoctor={true}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      expect(screen.queryByRole("button", { name: BUTTON_LABEL })).toBeNull();
    });
  });

  describe("interaction", () => {
    it("clicking the button navigates to /citas/{citaId}/llamada", async () => {
      // The visibility check has already been evaluated at render time under
      // fake timers. For the click we switch to real timers so userEvent's
      // internal scheduling can complete without a stuck fake clock.
      vi.useRealTimers();

      const user = userEvent.setup();
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.EN_CURSO}
          fechaHora={new Date()}
          isDoctor={true}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      const button = screen.getByRole("button", { name: BUTTON_LABEL });
      await user.click(button);

      expect(mockRouterPush).toHaveBeenCalledTimes(1);
      expect(mockRouterPush).toHaveBeenCalledWith(
        `/citas/${CITA_ID}/llamada`,
      );
    });
  });

  // ── modality-toggle (PR-B) — D7 modality gate ──────────────────────

  describe("modality gate (modality=PRESENCIAL hard gate)", () => {
    it.each([
      ["PENDIENTE"],
      ["CONFIRMADA"],
      ["EN_CURSO"],
      ["COMPLETADA"],
      ["CANCELADA"],
      ["NO_ASISTIO"],
    ])("PRESENCIAL + %s returns null (modality gate runs first, idempotent)", (estadoLabel) => {
      const estadoMap: Record<string, ConsultationStatus> = {
        PENDIENTE: ConsultationStatus.PENDIENTE,
        CONFIRMADA: ConsultationStatus.CONFIRMADA,
        EN_CURSO: ConsultationStatus.EN_CURSO,
        COMPLETADA: ConsultationStatus.COMPLETADA,
        CANCELADA: ConsultationStatus.CANCELADA,
        NO_ASISTIO: ConsultationStatus.NO_ASISTIO,
      };
      const estado = estadoMap[estadoLabel]!;
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={estado}
          fechaHora={fechaHoraOffsetMinutes(0)}
          isDoctor={true}
          modalidad={ConsultaModalidad.PRESENCIAL}
        />,
      );

      // The modality gate is the FIRST check. For every estado, the
      // button MUST be null. No DOM residue.
      expect(screen.queryByRole("button", { name: BUTTON_LABEL })).toBeNull();
    });

    it("PRESENCIAL + EN_CURSO + within window: modality gate runs first (status gate would pass, but modality blocks)", () => {
      // Belt-and-suspenders: this is the most likely regression — a future
      // refactor that reorders the gates would let the button show for
      // PRESENCIAL + EN_CURSO. The gate MUST run first.
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.EN_CURSO}
          fechaHora={fechaHoraOffsetMinutes(0)}
          isDoctor={true}
          modalidad={ConsultaModalidad.PRESENCIAL}
        />,
      );

      expect(screen.queryByRole("button", { name: BUTTON_LABEL })).toBeNull();
    });

    it("ONLINE + EN_CURSO still renders the button (regression guard — gate does not over-reject)", () => {
      render(
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.EN_CURSO}
          fechaHora={fechaHoraOffsetMinutes(0)}
          isDoctor={true}
          modalidad={ConsultaModalidad.ONLINE}
        />,
      );

      expect(
        screen.getByRole("button", { name: BUTTON_LABEL }),
      ).toBeInTheDocument();
    });
  });

  describe("prop type contract", () => {
    // Compile-time regression guard: omitting `modalidad` is a TypeScript
    // error (per D7 / AD-7). The `@ts-expect-error` comment asserts the
    // compile error and acts as a regression test. If a future refactor
    // makes `modalidad` optional, the directive becomes unused and the
    // compiler reports TS2578 — this test then fails the tsc gate.
    it("requires `modalidad` to be passed (compile-time @ts-expect-error guard)", () => {
      const _compileErrorGuard = (
        // @ts-expect-error — `modalidad` is REQUIRED (modality-toggle, PR-B, D7)
        <JoinCallButton
          citaId={CITA_ID}
          estado={ConsultationStatus.EN_CURSO}
          fechaHora={fechaHoraOffsetMinutes(0)}
          isDoctor={true}
        />
      );
      expect(_compileErrorGuard).toBeDefined();
    });
  });
});
