import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test plan for /doctores — "Disponible online" filter pill (modality-toggle, PR-A):
 *
 *   1. Inactive pill (no URL param) calls listDoctorProfiles WITHOUT aceptaOnline
 *   2. URL with ?aceptaOnline=true renders active pill, calls listDoctorProfiles WITH aceptaOnline: true
 *   3. Clicking inactive pill calls router.replace with ?aceptaOnline=true
 *   4. Clicking active pill calls router.replace without the param
 *   5. Other search params are preserved on toggle
 */

const {
  useRouterMock,
  useSearchParamsMock,
  useQueryMock,
} = vi.hoisted(() => ({
  useRouterMock: vi.fn(),
  useSearchParamsMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => useRouterMock(),
  useSearchParams: () => useSearchParamsMock(),
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

vi.mock("@/infrastructure/api", () => ({
  api: {
    profiles: {
      listDoctorProfiles: { useQuery: (...args: unknown[]) => useQueryMock(...args) },
    },
  },
}));

import DoctorsListPage from "@/app/doctores/page";

const fakeDoctors = [
  {
    id: "doc-1",
    nombre: "Dr. Online",
    email: "online@example.com",
    especialidad: "Cardiología",
    biografia: null,
    precioConsulta: 100,
    calificacionMedia: 4.5,
    aceptaOnline: true,
  },
  {
    id: "doc-2",
    nombre: "Dr. Presencial",
    email: "presencial@example.com",
    especialidad: "Pediatría",
    biografia: null,
    precioConsulta: 80,
    calificacionMedia: 4.0,
    aceptaOnline: false,
  },
];

function makeRouterMock() {
  return {
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };
}

function makeSearchParamsMock(initial: Record<string, string> = {}) {
  const map = new URLSearchParams();
  for (const [k, v] of Object.entries(initial)) {
    map.set(k, v);
  }
  return {
    get: (key: string) => map.get(key),
    has: (key: string) => map.has(key),
    toString: () => map.toString(),
    entries: () => map.entries(),
    keys: () => map.keys(),
    values: () => map.values(),
    forEach: (cb: (v: string, k: string) => void) => map.forEach(cb),
  };
}

describe("/doctores — filter pill (modality-toggle, PR-A)", () => {
  let routerInstance: ReturnType<typeof makeRouterMock>;
  let searchParamsInstance: ReturnType<typeof makeSearchParamsMock>;

  beforeEach(() => {
    useRouterMock.mockReset();
    useSearchParamsMock.mockReset();
    useQueryMock.mockReset();

    routerInstance = makeRouterMock();
    useRouterMock.mockReturnValue(routerInstance);

    searchParamsInstance = makeSearchParamsMock();
    useSearchParamsMock.mockReturnValue(searchParamsInstance);

    useQueryMock.mockReturnValue({
      data: fakeDoctors,
      isLoading: false,
      isError: false,
    });
  });

  it("Inactive pill renders in the inactive state and calls listDoctorProfiles WITHOUT aceptaOnline", () => {
    render(<DoctorsListPage />);

    const pill = screen.getByTestId("disponible-online-pill");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(pill).toHaveTextContent("Disponible online");
    expect(screen.getByText("Dr. Online")).toBeInTheDocument();
    expect(screen.getByText("Dr. Presencial")).toBeInTheDocument();

    // The query was called without the aceptaOnline filter.
    const queryArg = useQueryMock.mock.calls[0]![0] as {
      aceptaOnline?: boolean;
    };
    expect(queryArg.aceptaOnline).toBeUndefined();
  });

  it("URL with ?aceptaOnline=true renders the pill in the active state and applies the filter", () => {
    searchParamsInstance = makeSearchParamsMock({ aceptaOnline: "true" });
    useSearchParamsMock.mockReturnValue(searchParamsInstance);
    useQueryMock.mockReturnValue({
      data: [fakeDoctors[0]],
      isLoading: false,
      isError: false,
    });

    render(<DoctorsListPage />);

    const pill = screen.getByTestId("disponible-online-pill");
    expect(pill).toHaveAttribute("aria-pressed", "true");

    const queryArg = useQueryMock.mock.calls[0]![0] as {
      aceptaOnline?: boolean;
    };
    expect(queryArg.aceptaOnline).toBe(true);
  });

  it("Clicking the inactive pill calls router.replace with ?aceptaOnline=true", async () => {
    const user = userEvent.setup();
    render(<DoctorsListPage />);

    await user.click(screen.getByTestId("disponible-online-pill"));

    expect(routerInstance.replace).toHaveBeenCalledTimes(1);
    expect(routerInstance.replace).toHaveBeenCalledWith(
      "/doctores?aceptaOnline=true",
    );
  });

  it("Clicking the active pill calls router.replace with the param removed", async () => {
    const user = userEvent.setup();
    searchParamsInstance = makeSearchParamsMock({ aceptaOnline: "true" });
    useSearchParamsMock.mockReturnValue(searchParamsInstance);
    useQueryMock.mockReturnValue({
      data: [fakeDoctors[0]],
      isLoading: false,
      isError: false,
    });

    render(<DoctorsListPage />);

    await user.click(screen.getByTestId("disponible-online-pill"));

    expect(routerInstance.replace).toHaveBeenCalledTimes(1);
    expect(routerInstance.replace).toHaveBeenCalledWith("/doctores");
  });

  it("Other search params are preserved when toggling the pill", async () => {
    const user = userEvent.setup();
    searchParamsInstance = makeSearchParamsMock({ search: "cardiologo" });
    useSearchParamsMock.mockReturnValue(searchParamsInstance);

    render(<DoctorsListPage />);

    await user.click(screen.getByTestId("disponible-online-pill"));

    expect(routerInstance.replace).toHaveBeenCalledWith(
      "/doctores?search=cardiologo&aceptaOnline=true",
    );
  });

  it("Empty-state copy adjusts to the online filter when no doctors match", () => {
    searchParamsInstance = makeSearchParamsMock({ aceptaOnline: "true" });
    useSearchParamsMock.mockReturnValue(searchParamsInstance);
    useQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<DoctorsListPage />);

    expect(
      screen.getByText("No hay doctores disponibles online"),
    ).toBeInTheDocument();
  });
});
