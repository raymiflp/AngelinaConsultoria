import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/Sidebar";

/**
 * Verify a nav item is rendered with the given text.
 * For items that may appear multiple times, `count` specifies how many.
 */
function expectNavItem(text: string, count = 1) {
  if (count === 1) {
    expect(screen.getByText(text)).toBeInTheDocument();
  } else {
    expect(screen.getAllByText(text)).toHaveLength(count);
  }
}

/**
 * Verify a nav item is NOT rendered.
 */
function expectNoNavItem(text: string) {
  expect(screen.queryByText(text)).not.toBeInTheDocument();
}

describe("Sidebar (admin role)", () => {
  it("shows items for ADMIN, DOCTOR-roled items are hidden", () => {
    render(<Sidebar userRole="ADMIN" />);

    // Branding
    expect(screen.getByText("AC")).toBeInTheDocument();

    // Items visible to ADMIN
    expectNavItem("Dashboard");
    expectNavItem("Doctores");              // /dashboard/doctores (roleRequired: ADMIN) is visible
    expectNavItem("Citas");
    expectNavItem("Perfil");
    expectNavItem("Configuración");

    // Doctor-only items should be hidden
    expectNoNavItem("Pacientes");          // href: /dashboard/pacientes, roleRequired: DOCTOR
    expectNoNavItem("Disponibilidad");     // roleRequired: DOCTOR
    expectNoNavItem("Agenda");             // roleRequired: DOCTOR
  });

  it("renders navigation links with correct hrefs", () => {
    render(<Sidebar userRole="ADMIN" />);

    // Dashboard link (appears only once for ADMIN — no roleRequired)
    const dashboardLinks = screen.getAllByRole("link", { name: /dashboard/i });
    expect(dashboardLinks[0]).toHaveAttribute("href", "/dashboard");

    // Doctores links: only the admin one (/dashboard/doctores),
    // the public one (/doctores) is roleRequired: PACIENTE
    const doctoresLinks = screen.getAllByRole("link", { name: /doctores/i });
    expect(doctoresLinks[0]).toHaveAttribute("href", "/dashboard/doctores");
    expect(doctoresLinks).toHaveLength(1);

    // Citas link
    expect(screen.getByRole("link", { name: /citas/i })).toHaveAttribute(
      "href",
      "/citas",
    );
  });
});

describe("Sidebar (doctor role)", () => {
  it("shows doctor-only items and hides admin items", () => {
    render(<Sidebar userRole="DOCTOR" />);

    // Branding still visible
    expect(screen.getByText("AC")).toBeInTheDocument();

    // Dashboard is visible to all roles (no roleRequired)
    expectNavItem("Dashboard");

    // Doctores items are hidden: /dashboard/doctores is ADMIN-only,
    // /doctores is PACIENTE-only — neither matches DOCTOR
    expectNoNavItem("Doctores");

    // Doctor-specific items visible
    expectNavItem("Citas");
    expectNavItem("Pacientes");         // roleRequired: DOCTOR
    expectNavItem("Disponibilidad");    // roleRequired: DOCTOR
    expectNavItem("Agenda");            // roleRequired: DOCTOR
    expectNavItem("Perfil");
    expectNavItem("Configuración");
  });
});

describe("Sidebar (paciente role)", () => {
  it("shows only public items and hides role-specific ones", () => {
    render(<Sidebar userRole="PACIENTE" />);

    // Dashboard is visible to all authenticated users
    expectNavItem("Dashboard");

    // Only the public Doctores link
    expectNavItem("Doctores", 1);

    // Items visible to PACIENTE
    expectNavItem("Citas");
    expectNavItem("Perfil");
    expectNavItem("Configuración");

    // Doctor-only items hidden
    expectNoNavItem("Pacientes");       // roleRequired: DOCTOR
    expectNoNavItem("Disponibilidad");  // roleRequired: DOCTOR
    expectNoNavItem("Agenda");          // roleRequired: DOCTOR
  });

  it("renders navigation links excluding role-restricted items", () => {
    render(<Sidebar userRole="PACIENTE" />);

    // Dashboard link exists (visible to all authenticated users)
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );

    // Citas link exists
    expect(screen.getByRole("link", { name: /citas/i })).toHaveAttribute(
      "href",
      "/citas",
    );

    // Public Doctores link (/doctores) is visible to everyone
    expect(screen.getByRole("link", { name: /^Doctores$/i })).toHaveAttribute(
      "href",
      "/doctores",
    );

    // Admin-only Doctores link (/dashboard/doctores) should not exist
    const doctoresLinks = screen.getAllByRole("link", { name: /doctores/i });
    const adminDoctoresLink = doctoresLinks.find(
      (l) => l.getAttribute("href") === "/dashboard/doctores",
    );
    expect(adminDoctoresLink).toBeUndefined();
  });
});
