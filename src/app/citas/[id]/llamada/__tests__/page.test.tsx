import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ─── Mocks (hoisted before the page import) ───────────────────────────

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseParams = vi.hoisted(() => vi.fn());
const mockUseRouter = vi.hoisted(() => vi.fn());
const mockUseSession = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/api", () => ({
  api: {
    bookings: {
      getRoomToken: {
        useQuery: (...args: unknown[]) => mockUseQuery("getRoomToken", ...args),
      },
      getMyAppointments: {
        useQuery: (...args: unknown[]) =>
          mockUseQuery("getMyAppointments", ...args),
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

// Mock the LiveKit React components — they have a hard requirement on
// a real MediaStream API that jsdom does not provide. The wrapper is the
// public surface; we substitute stub elements with stable test ids.
vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({
    children,
    "data-testid": testId,
    onDisconnected,
  }: {
    children?: React.ReactNode;
    "data-testid"?: string;
    onDisconnected?: () => void;
  }) => (
    <div data-testid={testId ?? "livekit-room"} data-on-disconnected="present">
      {/* Surface onDisconnected so the test can invoke it. */}
      {onDisconnected && (
        <button
          type="button"
          data-testid="trigger-disconnect"
          onClick={onDisconnected}
        >
          disconnect
        </button>
      )}
      {children}
    </div>
  ),
  VideoConference: () => (
    <div data-testid="video-conference">video conference</div>
  ),
}));

vi.mock("@livekit/components-styles", () => ({}));
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

import CallPage from "../page";

// ─── Constants & helpers ──────────────────────────────────────────────

const CITA_ID = "8d2a1f8e-2b1c-4f00-aaaa-000000000001";

const mockPush = vi.fn();
const mockRefetch = vi.fn();

/**
 * Mock the two `useQuery` calls in the call page. The page calls
 * `getRoomToken` AND `getMyAppointments` (to source the top-bar date).
 * `procedureKey` is the first arg that vi.mock injects.
 */
function mockQueries(opts: {
  roomToken: {
    isLoading: boolean;
    isError: boolean;
    data?: { token: string; serverUrl: string; roomName: string };
    error?: { message: string };
  };
  appointments?: {
    data?: ReadonlyArray<{
      id: string;
      fechaHora: string;
      doctorNombre: string | null;
      pacienteNombre: string | null;
    }>;
  };
}) {
  mockUseQuery.mockImplementation((procedureKey: string) => {
    if (procedureKey === "getRoomToken") {
      return {
        data: opts.roomToken.data,
        isLoading: opts.roomToken.isLoading,
        isError: opts.roomToken.isError,
        error: opts.roomToken.error ?? null,
        refetch: mockRefetch,
      };
    }
    if (procedureKey === "getMyAppointments") {
      return {
        data: opts.appointments?.data ?? [],
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
      refetch: vi.fn(),
    };
  });
}

beforeEach(() => {
  mockUseParams.mockReset();
  mockUseRouter.mockReset();
  mockUseSession.mockReset();
  mockUseQuery.mockReset();
  mockPush.mockReset();
  mockRefetch.mockReset();

  mockUseParams.mockReturnValue({ id: CITA_ID });
  mockUseRouter.mockReturnValue({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  });
  mockUseSession.mockReturnValue({
    data: { user: { id: "u-1", role: "DOCTOR" } },
  });
});

// ─── Tests ────────────────────────────────────────────────────────────

describe("CallPage (/citas/[id]/llamada)", () => {
  describe("loading state", () => {
    beforeEach(() => {
      mockQueries({
        roomToken: { isLoading: true, isError: false },
      });
    });

    it("shows the spinner and the connecting message", () => {
      render(<CallPage />);

      expect(
        screen.getByText(/conectando con la sala/i),
      ).toBeInTheDocument();
    });

    it("does NOT mount LiveKitRoom while loading", () => {
      render(<CallPage />);

      expect(screen.queryByTestId("livekit-room")).toBeNull();
    });

    it("does NOT render the D10 limitation footer in the loading state", () => {
      render(<CallPage />);

      // REQ-VCU-WH-1 holds in ALL three states, not just success.
      expect(
        screen.queryByText(/quedar[áa] en .en curso./i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /p[áa]gina de la cita/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    beforeEach(() => {
      mockQueries({
        roomToken: {
          isLoading: false,
          isError: true,
          error: { message: "Servicio de videollamada no disponible" },
        },
      });
    });

    it("shows the error message in a role=alert region", () => {
      render(<CallPage />);

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(
        /servicio de videollamada no disponible/i,
      );
    });

    it("shows a Reintentar button that calls refetch on click", () => {
      render(<CallPage />);

      const retry = screen.getByRole("button", { name: /reintentar/i });
      fireEvent.click(retry);

      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it("shows a Volver link to /citas/{citaId}", () => {
      render(<CallPage />);

      const back = screen.getByRole("link", { name: /volver/i });
      expect(back).toHaveAttribute("href", `/citas/${CITA_ID}`);
    });

    it("does NOT mount LiveKitRoom in the error state", () => {
      render(<CallPage />);

      expect(screen.queryByTestId("livekit-room")).toBeNull();
    });

    it("does NOT render the D10 limitation footer in the error state", () => {
      render(<CallPage />);

      // REQ-VCU-WH-1 holds in ALL three states, not just success.
      expect(
        screen.queryByText(/quedar[áa] en .en curso./i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /p[áa]gina de la cita/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("success state", () => {
    beforeEach(() => {
      mockQueries({
        roomToken: {
          isLoading: false,
          isError: false,
          data: {
            token: "jwt-fixture",
            serverUrl: "ws://localhost:7880",
            roomName: `cita-${CITA_ID}`,
          },
        },
        appointments: {
          data: [
            {
              id: CITA_ID,
              fechaHora: "2026-06-15T14:30:00.000Z",
              doctorNombre: "Dr. Test",
              pacienteNombre: "Paciente Test",
            },
          ],
        },
      });
    });

    it("mounts the LiveKitRoom wrapper", () => {
      render(<CallPage />);

      expect(screen.getByTestId("livekit-room")).toBeInTheDocument();
    });

    it("renders the VideoConference inside LiveKitRoom", () => {
      render(<CallPage />);

      expect(screen.getByTestId("video-conference")).toBeInTheDocument();
    });

    it("renders the 'En vivo' badge with aria-live=polite", () => {
      render(<CallPage />);

      const badge = screen.getByTestId("en-vivo-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("aria-live", "polite");
      expect(badge).toHaveTextContent(/en vivo/i);
    });

    it("renders the top-bar Volver link to /citas/{citaId}", () => {
      render(<CallPage />);

      const back = screen.getByRole("link", { name: /volver a la cita/i });
      expect(back).toHaveAttribute("href", `/citas/${CITA_ID}`);
    });

    it("renders the cita summary in Spanish (top bar)", () => {
      render(<CallPage />);

      // The format is "15 de junio de 2026, HH:MM" (es-ES locale). The
      // exact time depends on the system timezone (jsdom default is the
      // host's local TZ), so the test asserts the date part and the
      // HH:MM time format only.
      const summary = screen.getByTestId("cita-summary");
      expect(summary).toBeInTheDocument();
      expect(summary).toHaveTextContent(/15 de junio/i);
      expect(summary.textContent).toMatch(/\d{2}:\d{2}/);
    });

    it("does NOT render the D10 limitation footer (livekit-webhooks, REQ-VCU-WH-1)", () => {
      render(<CallPage />);

      // The previous D10 footer was the "we know this is broken"
      // confession. After livekit-webhooks ships, the
      // autoCompleteOnRoomFinishedUseCase handles completion on
      // room_finished; the footer is removed. Asserting the footer is
      // absent in the success state is the REQ-VCU-WH-1 acceptance
      // criterion.
      expect(
        screen.queryByText(/quedar[áa] en .en curso./i),
      ).not.toBeInTheDocument();
      // The footer had a Link with the text "página de la cita" pointing
      // to /citas/{citaId}; that link is removed too. Asserting the link
      // is absent (the loading-state "Volver a la cita" / error-state
      // "Volver" links do NOT match this text).
      expect(
        screen.queryByRole("link", { name: /p[áa]gina de la cita/i }),
      ).not.toBeInTheDocument();
    });

    it("does NOT show the loading message or the error alert", () => {
      render(<CallPage />);

      expect(
        screen.queryByText(/conectando con la sala/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("disconnect handler", () => {
    beforeEach(() => {
      mockQueries({
        roomToken: {
          isLoading: false,
          isError: false,
          data: {
            token: "jwt-fixture",
            serverUrl: "ws://localhost:7880",
            roomName: `cita-${CITA_ID}`,
          },
        },
        appointments: { data: [] },
      });
    });

    it("calls router.push('/citas/{citaId}') when LiveKitRoom onDisconnected fires", () => {
      render(<CallPage />);

      const trigger = screen.getByTestId("trigger-disconnect");
      fireEvent.click(trigger);

      expect(mockPush).toHaveBeenCalledWith(`/citas/${CITA_ID}`);
    });
  });
});
