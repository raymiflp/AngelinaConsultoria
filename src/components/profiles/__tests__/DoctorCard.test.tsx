import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DoctorCard } from "@/components/profiles/DoctorCard";
import type { DoctorPublicResponse } from "@/infrastructure/profiles/schemas";

const mockDoctor: DoctorPublicResponse = {
  id: "doc-1",
  nombre: "Dr. García López",
  email: "dr.garcia@example.com",
  especialidad: "Cardiología",
  biografia: "Cardiólogo con 20 años de experiencia.",
  precioConsulta: 150,
  calificacionMedia: 4.5,
  aceptaOnline: false,
};

describe("DoctorCard", () => {
  it("renders doctor name and specialty", () => {
    render(<DoctorCard doctor={mockDoctor} />);

    expect(screen.getByText("Dr. García López")).toBeInTheDocument();
    expect(screen.getByText("Cardiología")).toBeInTheDocument();
  });

  it("renders email", () => {
    render(<DoctorCard doctor={mockDoctor} />);

    expect(screen.getByText("dr.garcia@example.com")).toBeInTheDocument();
  });

  it("renders biography when provided", () => {
    render(<DoctorCard doctor={mockDoctor} />);

    expect(
      screen.getByText("Cardiólogo con 20 años de experiencia."),
    ).toBeInTheDocument();
  });

  it("renders price with currency formatting", () => {
    render(<DoctorCard doctor={mockDoctor} />);

    expect(screen.getByText("150.00")).toBeInTheDocument();
    expect(screen.getByText("€")).toBeInTheDocument();
  });

  it("renders rating when provided", () => {
    render(<DoctorCard doctor={mockDoctor} />);

    expect(screen.getByText("4.5")).toBeInTheDocument();
  });

  it("renders initials in avatar fallback", () => {
    render(<DoctorCard doctor={mockDoctor} />);

    // "Dr. García López" → "DG"
    expect(screen.getByText("DG")).toBeInTheDocument();
  });

  it("renders the book appointment link", () => {
    render(<DoctorCard doctor={mockDoctor} />);

    const link = screen.getByRole("link", { name: /reservar cita/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/doctores/doc-1/agendar");
  });

  it("handles missing price gracefully", () => {
    const doctorWithoutPrice = { ...mockDoctor, precioConsulta: null };
    render(<DoctorCard doctor={doctorWithoutPrice} />);

    expect(
      screen.getByText("Precio no disponible"),
    ).toBeInTheDocument();
  });

  it("handles missing rating gracefully", () => {
    const doctorWithoutRating = { ...mockDoctor, calificacionMedia: null };
    render(<DoctorCard doctor={doctorWithoutRating} />);

    expect(screen.queryByText("4.5")).not.toBeInTheDocument();
  });

  it("handles missing biography gracefully", () => {
    const doctorWithoutBio = { ...mockDoctor, biografia: null };
    render(<DoctorCard doctor={doctorWithoutBio} />);

    // Biography section should not be rendered
    expect(
      screen.queryByText("Cardiólogo con 20 años de experiencia."),
    ).not.toBeInTheDocument();
  });
});
