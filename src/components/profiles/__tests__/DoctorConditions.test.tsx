import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DoctorConditions } from "@/components/profiles/DoctorConditions";
import type { DoctorConditionResponse } from "@/infrastructure/profiles/schemas";

const mockConditions: DoctorConditionResponse[] = [
  { id: "cond-1", nombre: "Diabetes tipo 2" },
  { id: "cond-2", nombre: "Hipertensión" },
  { id: "cond-3", nombre: "Asma" },
];

describe("DoctorConditions", () => {
  it("renders section title", () => {
    render(<DoctorConditions conditions={[]} />);

    expect(screen.getByText("Condiciones que trata")).toBeInTheDocument();
  });

  it("renders conditions as badges", () => {
    render(<DoctorConditions conditions={mockConditions} />);

    expect(screen.getByText("Diabetes tipo 2")).toBeInTheDocument();
    expect(screen.getByText("Hipertensión")).toBeInTheDocument();
    expect(screen.getByText("Asma")).toBeInTheDocument();
  });

  it("shows empty state when no conditions", () => {
    render(<DoctorConditions conditions={[]} />);

    expect(
      screen.getByText("No hay condiciones registradas."),
    ).toBeInTheDocument();
  });

});
