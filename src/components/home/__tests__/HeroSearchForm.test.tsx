import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HeroSearchForm } from "@/components/home/HeroSearchForm";

// ─── Mocks ─────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Tests ─────────────────────────────────────────────────────────────

describe("HeroSearchForm", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("renders the specialty and city inputs and the Buscar button", () => {
    render(<HeroSearchForm />);

    const specialty = screen.getByPlaceholderText(
      /especialidad, enfermedad o nombre/i,
    );
    expect(specialty).toBeInTheDocument();
    expect(specialty).not.toBeDisabled();

    const city = screen.getByPlaceholderText(/ciudad/i);
    expect(city).toBeInTheDocument();
    expect(city).toBeDisabled();
    expect(city).toHaveAttribute("aria-label", "Próximamente");
    expect(city).toHaveAttribute("title", "Próximamente");
    expect(city).toHaveAttribute("tabindex", "-1");

    expect(
      screen.getByRole("button", { name: /buscar/i }),
    ).toBeInTheDocument();
  });

  it("URL-encodes the specialty and navigates to /doctores?especialidad=...", async () => {
    const user = userEvent.setup();
    render(<HeroSearchForm />);

    const specialty = screen.getByPlaceholderText(
      /especialidad, enfermedad o nombre/i,
    );
    await user.type(specialty, "Psicólogo");

    await user.click(screen.getByRole("button", { name: /buscar/i }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(
      "/doctores?especialidad=Psic%C3%B3logo",
    );
  });

  it("trims whitespace before encoding", async () => {
    const user = userEvent.setup();
    render(<HeroSearchForm />);

    const specialty = screen.getByPlaceholderText(
      /especialidad, enfermedad o nombre/i,
    );
    await user.type(specialty, "  Psicólogo  ");

    await user.click(screen.getByRole("button", { name: /buscar/i }));

    expect(mockPush).toHaveBeenCalledWith(
      "/doctores?especialidad=Psic%C3%B3logo",
    );
  });

  it("navigates to /doctores (no filter) when specialty is empty", async () => {
    const user = userEvent.setup();
    render(<HeroSearchForm />);

    await user.click(screen.getByRole("button", { name: /buscar/i }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/doctores");
  });

  it("ignores the city field entirely", async () => {
    const user = userEvent.setup();
    render(<HeroSearchForm />);

    // The city field is disabled, so a user can't type into it; we still
    // confirm that even if a value were present it would not appear in
    // the destination URL.
    const city = screen.getByPlaceholderText(/ciudad/i);
    expect(city).toBeDisabled();

    const specialty = screen.getByPlaceholderText(
      /especialidad, enfermedad o nombre/i,
    );
    await user.type(specialty, "Dermatólogo");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const firstCall = mockPush.mock.calls[0];
    const url = firstCall?.[0];
    expect(typeof url).toBe("string");
    expect(url).toBe("/doctores?especialidad=Dermat%C3%B3logo");
    expect(url).not.toContain("ciudad");
    expect(url).not.toContain("Madrid");
  });

  it("the Buscar button is type=submit", () => {
    render(<HeroSearchForm />);
    const button = screen.getByRole("button", { name: /buscar/i });
    expect(button).toHaveAttribute("type", "submit");
  });
});
