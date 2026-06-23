import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";
import { ConsultationStatus } from "@/domain/enums";

describe("StatusBadge", () => {
  it('renders "Pendiente" for PENDIENTE status', () => {
    render(<StatusBadge status={ConsultationStatus.PENDIENTE} />);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  it('renders "Confirmada" for CONFIRMADA status', () => {
    render(<StatusBadge status={ConsultationStatus.CONFIRMADA} />);
    expect(screen.getByText("Confirmada")).toBeInTheDocument();
  });

  it('renders "En curso" for EN_CURSO status', () => {
    render(<StatusBadge status={ConsultationStatus.EN_CURSO} />);
    expect(screen.getByText("En curso")).toBeInTheDocument();
  });

  it('renders "Completada" for COMPLETADA status', () => {
    render(<StatusBadge status={ConsultationStatus.COMPLETADA} />);
    expect(screen.getByText("Completada")).toBeInTheDocument();
  });

  it('renders "Cancelada" for CANCELADA status', () => {
    render(<StatusBadge status={ConsultationStatus.CANCELADA} />);
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
  });

  it('renders "No asistió" for NO_ASISTIO status', () => {
    render(<StatusBadge status={ConsultationStatus.NO_ASISTIO} />);
    expect(screen.getByText("No asistió")).toBeInTheDocument();
  });

  it("renders a badge element", () => {
    render(<StatusBadge status={ConsultationStatus.PENDIENTE} />);
    const badge = screen.getByText("Pendiente");
    expect(badge.tagName).toBe("SPAN");
  });
});
