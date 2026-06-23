import { render, screen } from "@testing-library/react";
import { UserMenu } from "@/components/UserMenu";

describe("UserMenu", () => {
  it("renders login link when user is not provided (unauthenticated)", () => {
    render(<UserMenu />);

    const loginLink = screen.getByRole("link", { name: /iniciar sesión/i });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute("href", "/login");
  });

  it("does not render login link when user is provided", () => {
    render(
      <UserMenu
        user={{ name: "Dr. Pérez", image: null, role: "Médico" }}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /iniciar sesión/i }),
    ).not.toBeInTheDocument();
  });
});
