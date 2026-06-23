import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Footer } from "@/components/home/Footer";

const FOOTER_SOURCE = readFileSync(
  resolve(__dirname, "..", "Footer.tsx"),
  "utf8",
);

describe("Footer", () => {
  it("renders 4 column headings in documented order", () => {
    render(<Footer />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Servicio",
      "Para pacientes",
      "Para profesionales",
      "Contacto",
    ]);
  });

  it("all 11 footer links point to real paths (no stubs, no data-todo markers)", () => {
    const { container } = render(<Footer />);

    // Every <a href> in the footer is a real path: no href="#", no
    // data-todo="home-page-upgrade" markers (the marker is obsolete now
    // that all stub links were replaced with real pages).
    const allAnchors = container.querySelectorAll("a[href]");
    expect(allAnchors.length).toBe(11);

    const hrefs = Array.from(allAnchors).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.every((h) => h !== "#")).toBe(true);

    expect(
      container.querySelector('[data-todo="home-page-upgrade"]'),
    ).toBeNull();

    // Real links: /doctores (multiple), /login (multiple).
    const doctoresLinks = container.querySelectorAll(
      'a[href="/doctores"]',
    );
    expect(doctoresLinks.length).toBeGreaterThanOrEqual(2);

    const loginLinks = container.querySelectorAll('a[href="/login"]');
    expect(loginLinks.length).toBeGreaterThanOrEqual(2);

    // No naked href="#" without a data-todo marker (defensive — current
    // Footer has no href="#" at all, but if a hash link is ever
    // reintroduced it must be tagged so we don't ship a broken anchor).
    const nakedHashLinks = container.querySelectorAll(
      'a[href="#"]:not([data-todo])',
    );
    expect(nakedHashLinks.length).toBe(0);
  });

  it("root element has bg-muted and the responsive grid classes", () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(footer!.className).toContain("bg-muted");
    const grid = footer!.querySelector(".grid");
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain("grid-cols-1");
    expect(grid!.className).toContain("sm:grid-cols-2");
    expect(grid!.className).toContain("lg:grid-cols-4");
  });

  it("bottom bar contains the exact copyright string and a disclaimer line", () => {
    render(<Footer />);
    expect(
      screen.getByText("© 2026 AngelinaConsultoria. Todos los derechos reservados."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/información orientativa/i),
    ).toBeInTheDocument();
  });

  it("the top-of-file footer-stubs history comment is present in the source header", () => {
    // Inspect the first 25 lines of the source for the historical comment
    // that documents when the footer-stubs housekeeping change landed.
    const head = FOOTER_SOURCE.split("\n").slice(0, 25).join("\n");
    expect(head).toContain("footer-stubs housekeeping");
    expect(head).toContain("replaced them with real pages");
  });
});
