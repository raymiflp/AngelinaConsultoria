import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { DoctorHero } from "@/components/profiles/DoctorHero";

// Mock next-auth — useSession ref that survives hoisting.
// Typed loosely so role-based mocks satisfy the return without `as any`:
// the production code casts `session.user` to `{ role?: string }` anyway.
const mockUseSession = vi.hoisted(() =>
  vi.fn<() => { data: { user?: { role?: string } } | null }>(() => ({ data: null })),
);
vi.mock("next-auth/react", () => ({
  useSession: mockUseSession,
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const baseProps = {
  id: "doc-1",
  nombre: "Dr. Ángeles Estévez",
  especialidad: "Médica de familia",
  fotoUrl: null as string | null,
  ubicacionConsulta: "Bargas, Toledo",
  numeroColegiado: "453008025",
  añosExperiencia: null as number | null,
  idiomas: [] as string[],
  calificacionMedia: null as number | null,
  totalReviews: 0,
  telefonoConsulta: null as string | null,
};

// Radix AvatarImage only renders <img> when image.complete && naturalWidth > 0.
// jsdom defaults prevent this, so we mock the properties.
beforeAll(() => {
  Object.defineProperties(HTMLImageElement.prototype, {
    complete: { configurable: true, get: () => true },
    naturalWidth: { configurable: true, get: () => 100 },
  });
});

afterAll(() => {
  // Restore to avoid leaking across test files
  Object.defineProperties(HTMLImageElement.prototype, {
    complete: { configurable: true, get: () => false },
    naturalWidth: { configurable: true, get: () => 0 },
  });
});

describe("DoctorHero", () => {
  beforeEach(() => {
    // Reset to unauthenticated before each test
    mockUseSession.mockReturnValue({ data: null });
  });

  it("renders doctor name and specialty", () => {
    render(<DoctorHero {...baseProps} />);

    expect(screen.getByText("Dr. Ángeles Estévez")).toBeInTheDocument();
    expect(screen.getByText("Médica de familia")).toBeInTheDocument();
  });

  it("renders initials in avatar fallback when no photo", () => {
    // "Ángeles Estévez" → split by space → ["Ángeles", "Estévez"] → ["Á", "E"] → "ÁE"
    render(<DoctorHero {...baseProps} nombre="Ana García" />);

    expect(screen.getByText("AG")).toBeInTheDocument();
  });

  it("renders photo when fotoUrl is provided", async () => {
    const { container } = render(
      <DoctorHero
        {...baseProps}
        fotoUrl="https://example.com/photo.jpg"
      />,
    );

    // Radix AvatarImage only renders <img> after the hydration cycle and
    // image "load" detection (mocked via HTMLImageElement.prototype).
    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
    });

    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    expect(img).toHaveAttribute("alt", "Dr. Ángeles Estévez");
  });

  it("renders location when provided", () => {
    render(<DoctorHero {...baseProps} />);

    expect(screen.getByText("Bargas, Toledo")).toBeInTheDocument();
  });

  it("renders license number", () => {
    render(<DoctorHero {...baseProps} />);

    expect(
      screen.getByText("Nº Colegiado: 453008025"),
    ).toBeInTheDocument();
  });

  it("renders years of experience", () => {
    render(<DoctorHero {...baseProps} añosExperiencia={12} />);

    expect(screen.getByText("12 años de experiencia")).toBeInTheDocument();
  });

  it("hides years of experience when null", () => {
    render(<DoctorHero {...baseProps} añosExperiencia={null} />);

    expect(
      screen.queryByText("años de experiencia"),
    ).not.toBeInTheDocument();
  });

  it("renders language badges", () => {
    render(
      <DoctorHero
        {...baseProps}
        idiomas={["Español", "Inglés", "Francés"]}
      />,
    );

    expect(screen.getByText("Español")).toBeInTheDocument();
    expect(screen.getByText("Inglés")).toBeInTheDocument();
    expect(screen.getByText("Francés")).toBeInTheDocument();
  });

  it("renders rating with review count", () => {
    render(
      <DoctorHero
        {...baseProps}
        calificacionMedia={4.5}
        totalReviews={23}
      />,
    );

    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("(23 reseñas)")).toBeInTheDocument();
  });

  it("renders phone link when provided", () => {
    render(
      <DoctorHero
        {...baseProps}
        telefonoConsulta="+34911234567"
      />,
    );

    const phoneLink = screen.getByText("+34911234567");
    expect(phoneLink).toBeInTheDocument();
    expect(phoneLink.closest("a")).toHaveAttribute(
      "href",
      "tel:+34911234567",
    );
  });

  it("shows Llamar button when phone is provided", () => {
    render(
      <DoctorHero
        {...baseProps}
        telefonoConsulta="+34911234567"
      />,
    );

    expect(
      screen.getByRole("link", { name: /llamar/i }),
    ).toBeInTheDocument();
  });

  it("shows Mensaje link pointing to /proximamente (messaging is not yet implemented)", () => {
    render(<DoctorHero {...baseProps} />);

    const msgLink = screen.getByRole("link", { name: /enviar mensaje/i });
    expect(msgLink).toBeInTheDocument();
    expect(msgLink).toHaveAttribute("href", "/proximamente?feature=Mensajer%C3%ADa");
  });

  it("hides location when not provided", () => {
    render(<DoctorHero {...baseProps} ubicacionConsulta={null} />);

    expect(screen.queryByText("Bargas, Toledo")).not.toBeInTheDocument();
  });

  it("hides rating when not provided", () => {
    render(<DoctorHero {...baseProps} calificacionMedia={null} />);

    expect(screen.queryByText("(0 reseñas)")).not.toBeInTheDocument();
  });

  it("hides phone when not provided", () => {
    render(<DoctorHero {...baseProps} telefonoConsulta={null} />);

    expect(screen.queryByRole("link", { name: /llamar/i }))
      .not.toBeInTheDocument();
  });

  // ─── Auth-aware CTA visibility ────────────────────────────────────

  it("shows Reservar cita for unauthenticated users", () => {
    render(<DoctorHero {...baseProps} />);

    expect(
      screen.getByRole("link", { name: /reservar cita/i }),
    ).toBeInTheDocument();
  });

  it("reserva link points to correct agendar url", () => {
    render(<DoctorHero {...baseProps} id="doc-123" />);

    const link = screen.getByRole("link", { name: /reservar cita/i });
    expect(link).toHaveAttribute("href", "/doctores/doc-123/agendar");
  });

  it("hides Reservar cita for DOCTOR role", () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: "DOCTOR" } },
    });

    render(<DoctorHero {...baseProps} />);

    expect(
      screen.queryByRole("link", { name: /reservar cita/i }),
    ).not.toBeInTheDocument();
  });

  it("hides Reservar cita for ADMIN role", () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: "ADMIN" } },
    });

    render(<DoctorHero {...baseProps} />);

    expect(
      screen.queryByRole("link", { name: /reservar cita/i }),
    ).not.toBeInTheDocument();
  });

  // ─── Modality toggle — "Disponible online" badge (modality-toggle, PR-A) ─

  it("muestra el badge 'Disponible online' cuando aceptaOnline === true", () => {
    render(<DoctorHero {...baseProps} aceptaOnline={true} />);

    expect(screen.getByText("Disponible online")).toBeInTheDocument();
  });

  it("no muestra el badge cuando aceptaOnline === false", () => {
    render(<DoctorHero {...baseProps} aceptaOnline={false} />);

    expect(screen.queryByText("Disponible online")).not.toBeInTheDocument();
  });

  it("no muestra el badge cuando aceptaOnline es undefined (defensivo)", () => {
    render(<DoctorHero {...baseProps} />);

    expect(screen.queryByText("Disponible online")).not.toBeInTheDocument();
  });

  it("el telefono Llamar permanece visible cuando aceptaOnline === true", () => {
    render(
      <DoctorHero
        {...baseProps}
        aceptaOnline={true}
        telefonoConsulta="+34911234567"
      />,
    );

    // Both the badge AND the Llamar button are present.
    expect(screen.getByText("Disponible online")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /llamar/i }),
    ).toBeInTheDocument();
  });
});
