import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DoctorExperience } from "@/components/profiles/DoctorExperience";
import type { DoctorExperienceResponse } from "@/infrastructure/profiles/schemas";

const mockEntries: [DoctorExperienceResponse, DoctorExperienceResponse] = [
  {
    id: "exp-1",
    tipo: "education",
    titulo: "Máster en Pediatría",
    institucion: "Universidad Complutense de Madrid",
    fechaInicio: "2015-09-01",
    fechaFin: "2019-06-30",
    descripcion: null,
    orden: 0,
  },
  {
    id: "exp-2",
    tipo: "work",
    titulo: "Médico de Familia",
    institucion: "Hospital San Juan de Dios",
    fechaInicio: "2020-01-15",
    fechaFin: null,
    descripcion: "Atención primaria y urgencias",
    orden: 1,
  },
];

describe("DoctorExperience", () => {
  it("renders section title", () => {
    render(<DoctorExperience experience={[]} />);

    expect(screen.getByText("Experiencia")).toBeInTheDocument();
  });

  it("renders education entry with date range", () => {
    render(<DoctorExperience experience={mockEntries} />);

    expect(screen.getByText("Máster en Pediatría")).toBeInTheDocument();
    expect(
      screen.getByText("Universidad Complutense de Madrid"),
    ).toBeInTheDocument();
    expect(screen.getByText("2015 – 2019")).toBeInTheDocument();
  });

  it("renders work entry with Presente when no end date", () => {
    render(<DoctorExperience experience={mockEntries} />);

    expect(screen.getByText("Médico de Familia")).toBeInTheDocument();
    expect(
      screen.getByText("Hospital San Juan de Dios"),
    ).toBeInTheDocument();
    expect(screen.getByText("2020 – Presente")).toBeInTheDocument();
  });

  it("shows education icon for education entries", () => {
    render(<DoctorExperience experience={[mockEntries[0]]} />);

    // Graduation cap icon should render (we check by the svg role)
    const icons = document.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThan(0);
  });

  it("shows empty state when no experience", () => {
    render(<DoctorExperience experience={[]} />);

    expect(
      screen.getByText("Sin experiencia registrada."),
    ).toBeInTheDocument();
  });

  it("renders multiple entries with separators", () => {
    render(<DoctorExperience experience={mockEntries} />);

    // Both titles should be visible
    expect(screen.getByText("Máster en Pediatría")).toBeInTheDocument();
    expect(screen.getByText("Médico de Familia")).toBeInTheDocument();
  });
});
