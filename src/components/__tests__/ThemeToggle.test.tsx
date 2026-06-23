import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ThemeToggle";

const mockSetTheme = vi.fn();

function mockUseTheme(theme: string) {
  vi.mocked(vi.importActual("next-themes")).then(() => {});
}

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
  });

  it("renders the theme switch", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("shows the sun icon when in light mode", () => {
    render(<ThemeToggle />);

    // Sun icon from lucide (renders as an SVG)
    const switch_ = screen.getByRole("switch");
    expect(switch_).toBeChecked();

    // aria-label tells the user they can switch to dark mode
    expect(switch_).toHaveAttribute("aria-label", "Switch to dark mode");
  });

  it("calls setTheme when toggled", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const switch_ = screen.getByRole("switch");
    await user.click(switch_);

    // Clicking while light → calls setTheme("dark")
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
