import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Test plan for `/doctores/[id]/agendar` — modality picker (modality-toggle, PR-B):
 *
 *   1. The ModalityPicker is NOT visible until a slot is picked
 *   2. The ModalityPicker IS visible after a slot is picked
 *   3. Full submit with modality + motivo calls createAppointment.mutate
 *      with the right payload
 */

// ─── Mocks (hoisted before the page import) ───────────────────────────

/**
 * Dynamic test date — tomorrow at 10:00 local time. Computed once at
 * module load instead of hardcoded so the test stays valid as time
 * passes (the original hardcoded `2026-06-22T00:00:00` made this a
 * time-bomb that broke a few days after the modality-toggle change was
 * archived).
 *
 * `vi.hoisted` guarantees these constants are initialized before any
 * vi.mock factory runs (the calendar mock factory references them).
 */
const { tomorrowMidnight, tomorrowStartIso, tomorrowEndIso, ALL_DAYS_ES } = vi.hoisted(() => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const midnight = new Date(start);
  midnight.setHours(0, 0, 0, 0);
  return {
    tomorrowMidnight: midnight,
    tomorrowStartIso: start.toISOString(),
    tomorrowEndIso: end.toISOString(),
    ALL_DAYS_ES: [
      "domingo",
      "lunes",
      "martes",
      "miércoles",
      "jueves",
      "viernes",
      "sábado",
    ],
  };
});

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseMutation = vi.hoisted(() => vi.fn());
const mockUseParams = vi.hoisted(() => vi.fn());
const mockUseRouter = vi.hoisted(() => vi.fn());
const mockUseSession = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockMutateAsync = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/api", () => ({
  api: {
    profiles: {
      getDoctorProfile: {
        useQuery: (...args: unknown[]) => mockUseQuery("getDoctorProfile", ...args),
      },
    },
    bookings: {
      getDoctorAvailability: {
        useQuery: (...args: unknown[]) => mockUseQuery("getDoctorAvailability", ...args),
      },
      getDoctorSlots: {
        useQuery: (...args: unknown[]) => mockUseQuery("getDoctorSlots", ...args),
      },
      createAppointment: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
    },
  },
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useParams: () => mockUseParams(),
    useRouter: () => mockUseRouter(),
  };
});

vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Stub the Popover to always be open and the Calendar to a single-click
// date picker (jsdom + react-day-picker is fragile).
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (d: Date) => void }) => (
    <button
      type="button"
      data-testid="calendar-pick-date"
      onClick={() => onSelect(tomorrowMidnight)}
    >
      pick test date
    </button>
  ),
}));

// ─── Import the page AFTER the mocks are in place ─────────────────────

import AgendarPage from "../page";

// ─── Constants & helpers ──────────────────────────────────────────────

const DOCTOR_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
const PATIENT_USER_ID = "user-pac-1";

const mockPush = vi.fn();

function makeDoctor(aceptaOnline: boolean) {
  return {
    id: DOCTOR_ID,
    nombre: "Dr. Test",
    email: "doc@example.com",
    especialidad: "Cardiología",
    biografia: null,
    precioConsulta: 100,
    calificacionMedia: 4.5,
    aceptaOnline,
  };
}

/**
 * Mock the page's three useQuery calls (procedureKey is the first arg that
 * vi.mock injects) and the createAppointment useMutation.
 */
function mockQueries(opts: {
  doctor?: { data: ReturnType<typeof makeDoctor> | null; isLoading?: boolean };
  availability?: { data: { availableDays: string[] } | null };
  slots?: { data: ReadonlyArray<{ start: string; end: string; available: boolean }> | null };
  mutateAsyncResult?: { id: string };
  mutationIsPending?: boolean;
}) {
  mockUseQuery.mockImplementation((procedureKey: string) => {
    if (procedureKey === "getDoctorProfile") {
      return {
        data: opts.doctor?.data ?? makeDoctor(true),
        isLoading: opts.doctor?.isLoading ?? false,
        isError: false,
        error: null,
      };
    }
    if (procedureKey === "getDoctorAvailability") {
      return {
        data: opts.availability?.data ?? { availableDays: [...ALL_DAYS_ES] },
        isLoading: false,
        isError: false,
        error: null,
      };
    }
    if (procedureKey === "getDoctorSlots") {
      return {
        data: opts.slots?.data ?? [],
        isLoading: false,
        isError: false,
        error: null,
      };
    }
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    };
  });

  mockUseMutation.mockImplementation(() => ({
    mutateAsync: mockMutateAsync.mockResolvedValue(
      opts.mutateAsyncResult ?? { id: "new-cita-id" },
    ),
    isPending: opts.mutationIsPending ?? false,
    isError: false,
    error: null,
  }));
}

beforeEach(() => {
  mockUseParams.mockReset();
  mockUseRouter.mockReset();
  mockUseSession.mockReset();
  mockUseQuery.mockReset();
  mockUseMutation.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockMutateAsync.mockReset();
  mockPush.mockReset();

  mockUseParams.mockReturnValue({ id: DOCTOR_ID });
  mockUseRouter.mockReturnValue({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  });
  mockUseSession.mockReturnValue({
    data: { user: { id: PATIENT_USER_ID, role: "PACIENTE" } },
  });
});

// ─── Tests ────────────────────────────────────────────────────────────

describe("AgendarPage — modality picker (modality-toggle, PR-B)", () => {
  it("ModalityPicker is NOT visible until a slot is picked", () => {
    mockQueries({});

    render(<AgendarPage />);

    // The radiogroup is rendered inside the wizard card which only shows
    // after a slot is picked. With no slot selected, it MUST NOT be in
    // the DOM.
    expect(
      screen.queryByRole("radiogroup", { name: /modalidad de consulta/i }),
    ).toBeNull();
  });

  it("ModalityPicker IS visible after a slot is picked", async () => {
    mockQueries({
      slots: {
        data: [
          {
            start: tomorrowStartIso,
            end: tomorrowEndIso,
            available: true,
          },
        ],
      },
    });

    const user = userEvent.setup();
    render(<AgendarPage />);

    // Open the date popover and pick the mocked date (a single click).
    await user.click(screen.getByTestId("calendar-pick-date"));

    // Wait for the slot grid to render. The slot time is rendered with
    // toLocaleTimeString, which depends on the host's timezone; we just
    // wait for any slot button (filtered to the slot grid via the
    // outline variant).
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const slot = buttons.find(
        (b) => b.getAttribute("data-variant") === "outline" && /\d{2}:\d{2}/.test(b.textContent ?? ""),
      );
      expect(slot).toBeDefined();
    });
    const slotButton = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-variant") === "outline" &&
          /\d{2}:\d{2}/.test(b.textContent ?? ""),
      )!;
    await user.click(slotButton);

    expect(
      screen.getByRole("radiogroup", { name: /modalidad de consulta/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /presencial/i })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /videollamada/i })).toBeEnabled();
  });

  it("full submit with modality + motivo calls createAppointment.mutate with the right payload", async () => {
    mockQueries({
      slots: {
        data: [
          {
            start: tomorrowStartIso,
            end: tomorrowEndIso,
            available: true,
          },
        ],
      },
    });

    const user = userEvent.setup();
    render(<AgendarPage />);

    // Pick the date.
    await user.click(screen.getByTestId("calendar-pick-date"));

    // Wait for the slot grid to render.
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const slot = buttons.find(
        (b) => b.getAttribute("data-variant") === "outline" && /\d{2}:\d{2}/.test(b.textContent ?? ""),
      );
      expect(slot).toBeDefined();
    });
    const slotButton = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-variant") === "outline" &&
          /\d{2}:\d{2}/.test(b.textContent ?? ""),
      )!;

    // Pick a slot.
    await user.click(slotButton);

    // Pick modality.
    await user.click(screen.getByRole("radio", { name: /presencial/i }));

    // Write motivo.
    const motivo = screen.getByLabelText(/motivo de consulta/i);
    await user.type(motivo, "Control anual");

    // Submit.
    const submit = screen.getByRole("button", { name: /confirmar reserva/i });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    // The fechaHora value flows through the SlotData → mutateAsync pipeline.
    // We assert the doctorId, motivoConsulta, and modalidad (the new field)
    // and that fechaHora is a non-empty ISO string in the future.
    const payload = mockMutateAsync.mock.calls[0]![0] as {
      doctorId: string;
      fechaHora: string;
      motivoConsulta: string;
      modalidad: string;
    };
    expect(payload.doctorId).toBe(DOCTOR_ID);
    expect(payload.motivoConsulta).toBe("Control anual");
    expect(payload.modalidad).toBe("PRESENCIAL");
    expect(payload.fechaHora).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(payload.fechaHora).getTime()).toBeGreaterThan(Date.now());

    // On success, the page pushes to /citas/{id}.
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/citas/new-cita-id");
    });
  });
});
