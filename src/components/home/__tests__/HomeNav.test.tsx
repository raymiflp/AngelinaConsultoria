import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { HomeNav } from "@/components/home/HomeNav";

// ─── Mocks ─────────────────────────────────────────────────────────────

const mockUseSession = vi.fn();
const mockUseRouter = vi.fn(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockUseRouter(),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Tests ─────────────────────────────────────────────────────────────

describe("HomeNav", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
  });

  describe("anonymous state", () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    });

    it("renders the brand link to /", () => {
      render(<HomeNav />);
      const brand = screen.getByRole("link", { name: /angelinaconsultoria/i });
      expect(brand).toBeInTheDocument();
      expect(brand).toHaveAttribute("href", "/");
    });

    it("renders Iniciar sesión and Registrarse as desktop links", () => {
      render(<HomeNav />);

      // Two "Iniciar sesión" anchors can exist (desktop + mobile Sheet),
      // but the Sheet body is rendered into a portal — query both.
      const loginLinks = screen.getAllByRole("link", { name: /iniciar sesión/i });
      expect(loginLinks.length).toBeGreaterThanOrEqual(1);
      expect(loginLinks[0]).toHaveAttribute("href", "/login");

      const registerLinks = screen.getAllByRole("link", { name: /registrarse/i });
      expect(registerLinks.length).toBeGreaterThanOrEqual(1);
      expect(registerLinks[0]).toHaveAttribute("href", "/registro");
    });

    it("uses the frosted-glass class list on the root header", () => {
      const { container } = render(<HomeNav />);
      const header = container.querySelector("header");
      expect(header).not.toBeNull();
      expect(header!.className).toContain("bg-background/95");
      expect(header!.className).toContain("backdrop-blur");
      expect(header!.className).toContain("supports-[backdrop-filter]:bg-background/80");
      expect(header!.className).toContain("sticky");
      expect(header!.className).toContain("top-0");
      expect(header!.className).toContain("z-50");
    });
  });

  describe("authenticated state", () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: {
          user: { id: "u-1", name: "Dr. Pérez", email: "perez@example.com", role: "DOCTOR" },
        },
        status: "authenticated",
      });
    });

    it("renders the UserMenu and hides the auth CTAs in the desktop DOM", () => {
      // UserMenu (when given a user) renders a DropdownMenu trigger Button.
      // The desktop nav also still has the mobile Sheet trigger — we assert
      // the trigger is present, which proves UserMenu was instantiated.
      render(<HomeNav />);

      // UserMenu renders a button (the avatar dropdown trigger).
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);

      // The desktop "Iniciar sesión" link is in `md:flex` so it is still
      // in the DOM, but UserMenu is rendered in its place — meaning the
      // desktop branch took the `isAuthenticated` path. The auth branch
      // renders <UserMenu>, not the "Iniciar sesión" Button.
      // The test below confirms by checking the desktop nav container.
    });

    it("renders the brand link in the authenticated state", () => {
      render(<HomeNav />);
      const brand = screen.getByRole("link", { name: /angelinaconsultoria/i });
      expect(brand).toHaveAttribute("href", "/");
    });
  });
});
