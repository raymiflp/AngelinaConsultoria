import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test plan for /configuracion — ModalityToggle card (modality-toggle, PR-A):
 *
 *   1. DOCTOR session renders the "Modalidad de consulta" card with a Switch
 *   2. PACIENTE session does NOT render the card
 *   3. Loading state shows a Skeleton placeholder
 *   4. Query error shows an Alert, not a Switch
 *   5. Click on the Switch calls api.profiles.updateAcceptsOnline
 *   6. Failed mutation shows a sonner toast
 *   7. Switch is disabled while mutation is in flight
 */

// ── Mocks ──────────────────────────────────────────────────────────────

const {
  useQueryMock,
  useMutationMock,
  useUtilsMock,
  useSessionMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
  useUtilsMock: vi.fn(),
  useSessionMock: vi.fn(),
  toastErrorMock: vi.fn(),
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

vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
}));

vi.mock("@/infrastructure/api", () => ({
  api: {
    profiles: {
      getMyProfile: { useQuery: () => useQueryMock() },
      updateAcceptsOnline: { useMutation: (...args: unknown[]) => useMutationMock(...args) },
    },
    useUtils: () => useUtilsMock(),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

import ConfiguracionPage from "@/app/configuracion/page";

const doctorProfile = (aceptaOnline: boolean) => ({
  id: "user-doc-1",
  email: "doc@example.com",
  nombre: "Dr. Test",
  telefono: "612345678",
  rol: "DOCTOR" as const,
  activo: true,
  doctor: {
    id: "doc-1",
    numeroColegiado: "12345",
    especialidad: "Cardiología",
    biografia: null,
    precioConsulta: 100,
    verificado: true,
    calificacionMedia: 4.5,
    aceptaOnline,
  },
  paciente: null,
});

const pacienteProfile = {
  id: "user-pac-1",
  email: "pac@example.com",
  nombre: "Ana Test",
  telefono: "698765432",
  rol: "PACIENTE" as const,
  activo: true,
  doctor: null,
  paciente: {
    id: "pac-1",
    fechaNacimiento: "1990-01-15",
    direccionCalle: "Calle Mayor 10",
    direccionCiudad: "Madrid",
    direccionProvincia: "Madrid",
    direccionCodigoPostal: "28001",
    direccionPais: "España",
    alergias: [],
    grupoSanguineo: null,
    notasMedicas: null,
  },
};

describe("/configuracion — ModalityToggle card (modality-toggle, PR-A)", () => {
  let mutateMock: ReturnType<typeof vi.fn>;
  let invalidateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    useUtilsMock.mockReset();
    useSessionMock.mockReset();
    toastErrorMock.mockReset();

    mutateMock = vi.fn();
    invalidateMock = vi.fn();
    useUtilsMock.mockReturnValue({
      profiles: { getMyProfile: { invalidate: invalidateMock } },
    });
    useMutationMock.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    });
    useSessionMock.mockReturnValue({ data: null });
  });

  it("DOCTOR session renders the card with the Switch in the unchecked state", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "DOCTOR" } } });
    useQueryMock.mockReturnValue({
      data: doctorProfile(false),
      isLoading: false,
      isError: false,
    });

    render(<ConfiguracionPage />);

    expect(screen.getByTestId("modality-card")).toBeInTheDocument();
    expect(
      screen.getByText("Acepto consultas online"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Aceptar consultas online habilita la opción de videollamada en el perfil público y en la agenda de los pacientes.",
      ),
    ).toBeInTheDocument();
    const switchEl = screen.getByRole("switch", { name: /acepto consultas online/i });
    expect(switchEl).toBeInTheDocument();
    expect(switchEl).toHaveAttribute("data-state", "unchecked");
  });

  it("DOCTOR session with aceptaOnline=true renders the Switch in the checked state", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "DOCTOR" } } });
    useQueryMock.mockReturnValue({
      data: doctorProfile(true),
      isLoading: false,
      isError: false,
    });

    render(<ConfiguracionPage />);

    const switchEl = screen.getByRole("switch", { name: /acepto consultas online/i });
    expect(switchEl).toHaveAttribute("data-state", "checked");
  });

  it("PACIENTE session does NOT render the modality card", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "PACIENTE" } } });
    useQueryMock.mockReturnValue({
      data: pacienteProfile,
      isLoading: false,
      isError: false,
    });

    render(<ConfiguracionPage />);

    expect(screen.queryByTestId("modality-card")).not.toBeInTheDocument();
    expect(screen.queryByText("Acepto consultas online")).not.toBeInTheDocument();
  });

  it("Loading state shows a Skeleton placeholder in place of the Switch", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "DOCTOR" } } });
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<ConfiguracionPage />);

    expect(screen.getByTestId("modality-card")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    // Skeleton class is "animate-pulse" (the shadcn primitive applies it).
    const card = screen.getByTestId("modality-card");
    expect(card.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("Query error shows an Alert and hides the Switch", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "DOCTOR" } } });
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<ConfiguracionPage />);

    expect(screen.getByTestId("modality-card")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.getByText("No se pudo cargar la preferencia."),
    ).toBeInTheDocument();
  });

  it("Clicking the Switch calls updateAcceptsOnline with the new value", async () => {
    const user = userEvent.setup();
    useSessionMock.mockReturnValue({ data: { user: { role: "DOCTOR" } } });
    useQueryMock.mockReturnValue({
      data: doctorProfile(false),
      isLoading: false,
      isError: false,
    });

    render(<ConfiguracionPage />);

    const switchEl = screen.getByRole("switch", { name: /acepto consultas online/i });
    await user.click(switchEl);

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith({ aceptaOnline: true });
  });

  it("Successful mutation invalidates getMyProfile", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "DOCTOR" } } });
    let capturedOnSuccess:
      | (() => void)
      | undefined;
    useMutationMock.mockImplementation(
      (opts: { onSuccess?: () => void } = {}) => {
        capturedOnSuccess = opts.onSuccess;
        return { mutate: mutateMock, isPending: false };
      },
    );
    useQueryMock.mockReturnValue({
      data: doctorProfile(false),
      isLoading: false,
      isError: false,
    });

    render(<ConfiguracionPage />);

    capturedOnSuccess?.();
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("Failed mutation shows a sonner error toast", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "DOCTOR" } } });
    let capturedOnError:
      | ((err: { message: string }) => void)
      | undefined;
    useMutationMock.mockImplementation(
      (opts: { onError?: (err: { message: string }) => void } = {}) => {
        capturedOnError = opts.onError;
        return { mutate: mutateMock, isPending: false };
      },
    );
    useQueryMock.mockReturnValue({
      data: doctorProfile(false),
      isLoading: false,
      isError: false,
    });

    render(<ConfiguracionPage />);

    capturedOnError?.({ message: "DB connection lost" });
    expect(toastErrorMock).toHaveBeenCalledWith("DB connection lost");
  });

  it("Failed mutation with no message falls back to the default Spanish error", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "DOCTOR" } } });
    let capturedOnError:
      | ((err: { message?: string }) => void)
      | undefined;
    useMutationMock.mockImplementation(
      (opts: { onError?: (err: { message?: string }) => void } = {}) => {
        capturedOnError = opts.onError;
        return { mutate: mutateMock, isPending: false };
      },
    );
    useQueryMock.mockReturnValue({
      data: doctorProfile(false),
      isLoading: false,
      isError: false,
    });

    render(<ConfiguracionPage />);

    capturedOnError?.({});
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Error al actualizar la preferencia",
    );
  });

  it("Switch is disabled while the mutation is in flight", () => {
    useSessionMock.mockReturnValue({ data: { user: { role: "DOCTOR" } } });
    useQueryMock.mockReturnValue({
      data: doctorProfile(false),
      isLoading: false,
      isError: false,
    });
    useMutationMock.mockReturnValue({
      mutate: mutateMock,
      isPending: true,
    });

    render(<ConfiguracionPage />);

    const switchEl = screen.getByRole("switch", { name: /acepto consultas online/i });
    expect(switchEl).toBeDisabled();
  });
});
