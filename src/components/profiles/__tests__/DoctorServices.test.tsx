import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DoctorServices } from "@/components/profiles/DoctorServices";
import type { DoctorServiceResponse } from "@/infrastructure/profiles/schemas";

const mockServices: DoctorServiceResponse[] = [
  {
    id: "svc-1",
    nombre: "Consulta online",
    descripcion: "Consulta médica por videollamada",
    precio: 40,
    duracionMinutos: 30,
    activo: true,
    orden: 0,
  },
  {
    id: "svc-2",
    nombre: "Visita Medicina Familiar",
    descripcion: null,
    precio: 50,
    duracionMinutos: null,
    activo: true,
    orden: 1,
  },
];

describe("DoctorServices", () => {
  it("renders section title", () => {
    render(<DoctorServices services={[]} />);

    expect(screen.getByText("Servicios")).toBeInTheDocument();
  });

  it("renders service with description and duration", () => {
    render(<DoctorServices services={mockServices} />);

    expect(screen.getByText("Consulta online")).toBeInTheDocument();
    expect(
      screen.getByText("Consulta médica por videollamada"),
    ).toBeInTheDocument();
    expect(screen.getByText("40.00 €")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
  });

  it("renders service without description or duration", () => {
    render(<DoctorServices services={mockServices} />);

    expect(screen.getByText("Visita Medicina Familiar")).toBeInTheDocument();
    expect(screen.getByText("50.00 €")).toBeInTheDocument();
  });

  it("shows duration when present", () => {
    render(<DoctorServices services={mockServices} />);

    expect(screen.getByText("30 min")).toBeInTheDocument();
  });

  it("shows disabled Reservar button for each service", () => {
    render(<DoctorServices services={mockServices} />);

    const buttons = screen.getAllByRole("button", { name: /reservar/i });
    expect(buttons).toHaveLength(2);
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("shows empty state when no services", () => {
    render(<DoctorServices services={[]} />);

    expect(
      screen.getByText("No hay servicios configurados."),
    ).toBeInTheDocument();
  });

});
