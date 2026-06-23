import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TrustCounter } from "@/components/home/TrustCounter";

describe("TrustCounter", () => {
  it("returns null and is not in the DOM when totalVerifiedDoctors === 0", () => {
    const { container } = render(
      <TrustCounter totalVerifiedDoctors={0} totalSpecialties={0} />,
    );
    // The component returns null — no markup rendered at all.
    expect(container).toBeEmptyDOMElement();
    // queryByText must NOT find "0 doctores verificados" anywhere.
    expect(screen.queryByText(/0 doctores/i)).toBeNull();
  });

  it("renders the count text when N > 0", () => {
    render(<TrustCounter totalVerifiedDoctors={5} totalSpecialties={0} />);
    expect(screen.getByText(/5 doctores verificados/i)).toBeInTheDocument();
  });

  it("renders both counts separated by a middot when M > 0", () => {
    render(<TrustCounter totalVerifiedDoctors={5} totalSpecialties={3} />);
    expect(screen.getByText(/5 doctores verificados/i)).toBeInTheDocument();
    expect(screen.getByText(/3 especialidades/i)).toBeInTheDocument();
  });

  it("hides the specialty segment when M === 0 (even if N > 0)", () => {
    render(<TrustCounter totalVerifiedDoctors={5} totalSpecialties={0} />);
    expect(screen.queryByText(/especialidades/i)).toBeNull();
  });

  it("uses singular noun for N === 1", () => {
    render(<TrustCounter totalVerifiedDoctors={1} totalSpecialties={0} />);
    expect(screen.getByText(/1 doctor verificado\b/i)).toBeInTheDocument();
  });

  it("renders an aria-live region for accessibility", () => {
    const { container } = render(
      <TrustCounter totalVerifiedDoctors={5} totalSpecialties={0} />,
    );
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });
});
