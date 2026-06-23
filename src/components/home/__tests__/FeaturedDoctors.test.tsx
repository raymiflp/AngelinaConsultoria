import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DoctorPublicResponse } from "@/infrastructure/profiles/schemas";
import { FeaturedDoctors } from "@/components/home/FeaturedDoctors";

// ─── Mock tRPC ─────────────────────────────────────────────────────────
//
// The component imports `api` from `@/infrastructure/api`. We mock that
// module to control what `useQuery` returns per scenario. The real client
// is unused; we never need a real tRPC client for these tests.

const mockUseQuery = vi.fn();
const mockRefetch = vi.fn();

vi.mock("@/infrastructure/api", () => ({
  api: {
    profiles: {
      listDoctorProfiles: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}));

// ─── Fixtures ──────────────────────────────────────────────────────────

const fakeDoctors: ReadonlyArray<DoctorPublicResponse> = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    nombre: "Dra. Pérez",
    email: "perez@example.com",
    especialidad: "Psicólogo",
    biografia: "Bio",
    precioConsulta: 50,
    calificacionMedia: 4.5,
    aceptaOnline: false,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    nombre: "Dr. López",
    email: "lopez@example.com",
    especialidad: "Dermatólogo",
    biografia: null,
    precioConsulta: 60,
    calificacionMedia: 4.8,
    aceptaOnline: false,
  },
];

// ─── Tests ─────────────────────────────────────────────────────────────

describe("FeaturedDoctors", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockRefetch.mockReset();
  });

  describe("loading state", () => {
    beforeEach(() => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mockRefetch,
      });
    });

    it("renders 8 skeleton placeholders and no empty/error text", () => {
      const { container } = render(<FeaturedDoctors />);
      const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(8);
      expect(
        screen.queryByText(/no hay doctores disponibles/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/hubo un error/i),
      ).not.toBeInTheDocument();
    });

    it("calls useQuery with limit 8", () => {
      render(<FeaturedDoctors />);
      expect(mockUseQuery).toHaveBeenCalledWith({ limit: 8 });
    });
  });

  describe("empty state", () => {
    beforeEach(() => {
      mockUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      });
    });

    it("renders the exact empty message and no DoctorCard", () => {
      render(<FeaturedDoctors />);
      expect(
        screen.getByText("No hay doctores disponibles por el momento."),
      ).toBeInTheDocument();
      // No doctor cards.
      expect(screen.queryByText(/dra\. pérez/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/dr\. lópez/i)).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    beforeEach(() => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetch,
      });
    });

    it("renders the polite error message and a Reintentar button", () => {
      render(<FeaturedDoctors />);
      expect(
        screen.getByText(/hubo un error al cargar los doctores/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /reintentar/i }),
      ).toBeInTheDocument();
    });

    it("clicking Reintentar calls refetch", async () => {
      const user = userEvent.setup();
      render(<FeaturedDoctors />);
      await user.click(screen.getByRole("button", { name: /reintentar/i }));
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it("the error region has role=alert for assistive tech", () => {
      const { container } = render(<FeaturedDoctors />);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
    });
  });

  describe("success state", () => {
    beforeEach(() => {
      mockUseQuery.mockReturnValue({
        data: fakeDoctors,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      });
    });

    it("renders the h2 heading with the exact text", () => {
      render(<FeaturedDoctors />);
      const heading = screen.getByRole("heading", {
        level: 2,
        name: /doctores destacados/i,
      });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).toBe("Doctores destacados");
    });

    it("renders N DoctorCards wrapped in Links to /doctores/{id}", () => {
      render(<FeaturedDoctors />);
      // The two doctor names render via DoctorCard.
      expect(screen.getByText(/dra\. pérez/i)).toBeInTheDocument();
      expect(screen.getByText(/dr\. lópez/i)).toBeInTheDocument();

      // Both cards wrapped in <Link> to /doctores/{id}.
      const link1 = screen.getByRole("link", {
        name: /dra\. pérez/i,
      });
      expect(link1.getAttribute("href")).toBe(
        "/doctores/11111111-1111-1111-1111-111111111111",
      );
      const link2 = screen.getByRole("link", {
        name: /dr\. lópez/i,
      });
      expect(link2.getAttribute("href")).toBe(
        "/doctores/22222222-2222-2222-2222-222222222222",
      );
    });

    it("renders the 'Ver todos los doctores' link to /doctores", () => {
      render(<FeaturedDoctors />);
      const link = screen.getByRole("link", { name: /ver todos los doctores/i });
      expect(link).toHaveAttribute("href", "/doctores");
    });

    it("the grid root carries the responsive column classes", () => {
      const { container } = render(<FeaturedDoctors />);
      const grid = container.querySelector(".grid");
      expect(grid).not.toBeNull();
      expect(grid!.className).toContain("grid-cols-1");
      expect(grid!.className).toContain("sm:grid-cols-2");
      expect(grid!.className).toContain("lg:grid-cols-3");
      expect(grid!.className).toContain("xl:grid-cols-4");
    });
  });
});
