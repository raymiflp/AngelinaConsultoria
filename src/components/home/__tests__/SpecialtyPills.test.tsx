import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SpecialtyPills } from "@/components/home/SpecialtyPills";
import { POPULAR_SPECIALTIES } from "@/lib/constants/specialties";

// Helper: collect every anchor's `href` from the container.
function collectHrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("a")).map(
    (a) => a.getAttribute("href") ?? "",
  );
}

describe("SpecialtyPills", () => {
  it("renders exactly 12 specialty pills in the constant order", () => {
    render(<SpecialtyPills />);
    for (const specialty of POPULAR_SPECIALTIES) {
      expect(
        screen.getByText(specialty.label, { selector: "span" }),
      ).toBeInTheDocument();
    }
  });

  it("renders a 13th 'Ver más' link to /doctores", () => {
    render(<SpecialtyPills />);
    const verMas = screen.getByRole("link", { name: /ver más/i });
    expect(verMas).toBeInTheDocument();
    expect(verMas).toHaveAttribute("href", "/doctores");
  });

  it("renders 13 anchors total (12 pills + 1 Ver más) with the right hrefs", () => {
    const { container } = render(<SpecialtyPills />);
    const hrefs = collectHrefs(container);
    // 12 pills + Ver más = 13 anchors.
    expect(hrefs).toHaveLength(13);

    // Each pill's href matches the constant's slug.
    for (const specialty of POPULAR_SPECIALTIES) {
      expect(hrefs).toContain(
        `/doctores?especialidad=${specialty.slug}`,
      );
    }

    // First href corresponds to the first slug (Psicólogo).
    expect(hrefs[0]).toBe("/doctores?especialidad=psicologo");
    // Last href is the Ver más link.
    expect(hrefs[hrefs.length - 1]).toBe("/doctores");
  });

  it("root container has overflow-x-auto and does not have flex-wrap on mobile", () => {
    const { container } = render(<SpecialtyPills />);
    // The inner div is the one with the responsive overflow + no-wrap.
    const inner = container.querySelector("div.flex");
    expect(inner).not.toBeNull();
    expect(inner!.className).toContain("overflow-x-auto");
    // The mobile-only branch should not include flex-wrap; only md+ does.
    // We assert the className does NOT contain `flex-wrap` (the wrapping
    // rule is added by `md:flex-wrap`, which is a responsive variant, not
    // a base class).
    const classTokens = inner!.className.split(/\s+/);
    expect(classTokens).not.toContain("flex-wrap");
  });
});
