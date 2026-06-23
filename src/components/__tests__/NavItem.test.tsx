import { render, screen } from "@testing-library/react";
import { NavItem } from "@/components/NavItem";
import type { NavItem as NavItemConfig } from "@/components/navigation";

const testItem: NavItemConfig = {
  label: "Dashboard",
  href: "/dashboard",
  icon: vi.fn(() => <svg />) as unknown as NavItemConfig["icon"],
  pattern: "/dashboard",
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("NavItem", () => {
  it("renders the nav label", () => {
    render(<NavItem item={testItem} />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders a link with the correct href", () => {
    render(<NavItem item={testItem} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dashboard");
  });
});
