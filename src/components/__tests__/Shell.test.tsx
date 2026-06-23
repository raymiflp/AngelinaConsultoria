import { render, screen } from "@testing-library/react";
import { Shell } from "@/components/Shell";

// Mock next-themes useTheme used by ThemeToggle inside Header
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: vi.fn(),
  }),
}));

// Mock next-auth/react useSession used by Shell
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

describe("Shell", () => {
  it("renders children in the main content region", () => {
    render(
      <Shell>
        <p>Child content</p>
      </Shell>,
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("renders the sidebar branding", () => {
    render(
      <Shell>
        <p>test</p>
      </Shell>,
    );

    // Sidebar renders the "MC" branding logo
    expect(screen.getByText("MC")).toBeInTheDocument();
  });

  it("renders the header with theme toggle and user menu", () => {
    render(
      <Shell>
        <p>test</p>
      </Shell>,
    );

    // Theme toggle switch
    expect(screen.getByRole("switch")).toBeInTheDocument();

    // User menu login button (unauthenticated)
    expect(
      screen.getByRole("link", { name: /iniciar sesión/i }),
    ).toBeInTheDocument();
  });
});
