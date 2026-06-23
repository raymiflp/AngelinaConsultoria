import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Test plan for `/citas/[id]` — modality badge (modality-toggle, PR-B):
 *
 *   1. Badge shows "Presencial" for a PRESENCIAL cita
 *   2. Badge shows "Online" for an ONLINE cita
 *   3. JoinCallButton is hidden (returns null) for a PRESENCIAL cita
 *      that would otherwise be visible (CONFIRMADA + within time window)
 *
 * These are page-level tests that exercise the wire from `getMyAppointments`
 * through the badge render and the JoinCallButton prop. The cita detail
 * page is a client component that fetches via tRPC; the test mocks the
 * tRPC client at the top level.
 */

// ─── Mocks (hoisted before the page import) ───────────────────────────

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseMutation = vi.hoisted(() => vi.fn());
const mockUseParams = vi.hoisted(() => vi.fn());
const mockUseRouter = vi.hoisted(() => vi.fn());
const mockUseSession = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/api", () => ({
  api: {
    bookings: {
      getMyAppointments: {
        useQuery: (...args: unknown[]) => mockUseQuery("getMyAppointments", ...args),
      },
      updateAppointmentStatus: {
        useMutation: (...args: unknown[]) => mockUseMutation("updateAppointmentStatus", ...args),
      },
      cancelAppointment: {
        useMutation: (...args: unknown[]) => mockUseMutation("cancelAppointment", ...args),
      },
      updateAppointmentNotes: {
        useMutation: (...args: unknown[]) => mockUseMutation("updateAppointmentNotes", ...args),
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
  toast: { error: vi.fn(), success: vi.fn() },
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

// ─── Import the page AFTER the mocks are in place ─────────────────────

import CitaDetailPage from "../page";

// ─── Constants & helpers ──────────────────────────────────────────────

const CITA_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";
const PATIENT_USER_ID = "user-pac-1";

const BUTTON_LABEL = /unirse a la videollamada/i;

function makeCita(modalidad: "PRESENCIAL" | "ONLINE", estado = "CONFIRMADA") {
  // The fechaHora is pinned to 5 minutes in the future so the cita is
  // inside the ±15 minute visibility window for JoinCallButton.
  const fechaHora = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return {
    id: CITA_ID,
    doctorId: "doc-1",
    pacienteId: "pac-1",
    fechaHora,
    estado,
    motivo: "Control",
    duracionMinutos: 30,
    precio: null,
    notas: null,
    modalidad,
    doctorNombre: "Dr. Test",
    pacienteNombre: "Paciente Test",
  };
}

function mockAppointments(cita: ReturnType<typeof makeCita> | null) {
  mockUseQuery.mockImplementation((procedureKey: string) => {
    if (procedureKey === "getMyAppointments") {
      return {
        data: cita ? [cita] : [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
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
    mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
    isPending: false,
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

  mockUseParams.mockReturnValue({ id: CITA_ID });
  mockUseRouter.mockReturnValue({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  });
  // Default to PACIENTE so the patient view is rendered (the patient view
  // is the simpler shape; doctor view is tested in the existing
  // integration tests).
  mockUseSession.mockReturnValue({
    data: { user: { id: PATIENT_USER_ID, role: "PACIENTE" } },
  });
});

// ─── Tests ────────────────────────────────────────────────────────────

describe("CitaDetailPage — modality badge (modality-toggle, PR-B)", () => {
  it("renders the 'Presencial' badge for a PRESENCIAL cita", () => {
    mockAppointments(makeCita("PRESENCIAL"));

    render(<CitaDetailPage />);

    const badge = screen.getByTestId("modality-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-modality", "PRESENCIAL");
    expect(badge).toHaveTextContent("Presencial");
  });

  it("renders the 'Online' badge for an ONLINE cita", () => {
    mockAppointments(makeCita("ONLINE"));

    render(<CitaDetailPage />);

    const badge = screen.getByTestId("modality-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-modality", "ONLINE");
    expect(badge).toHaveTextContent("Online");
  });

  it("hides the JoinCallButton for a PRESENCIAL cita within the time window (modality gate)", () => {
    mockAppointments(makeCita("PRESENCIAL", "CONFIRMADA"));

    render(<CitaDetailPage />);

    // The cita is CONFIRMADA + within the time window (5 min in the
    // future), so the status / time gates PASS. The modality gate MUST
    // block the button anyway — this is the PR-B regression guard.
    expect(screen.queryByRole("button", { name: BUTTON_LABEL })).toBeNull();
  });
});
