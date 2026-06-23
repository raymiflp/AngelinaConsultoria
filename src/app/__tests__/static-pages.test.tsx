import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// All 7 new pages are server components. We test them by importing the
// page module and rendering the default export through a thin wrapper.
// Because they're async server components in Next.js 15, we treat the
// imports carefully.

// Mock the Next.js Link component to a plain anchor to avoid the router
// context requirement in jsdom.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Mock next/navigation's useSearchParams for the Proximamente page.
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>(
    "next/navigation",
  );
  return {
    ...actual,
    useSearchParams: () => new URLSearchParams(),
  };
});

describe("static legal/info pages render without error", () => {
  it("renders /privacidad", async () => {
    const Page = (await import("@/app/privacidad/page")).default;
    render(await Page());
    expect(
      screen.getByRole("heading", { name: /política de privacidad/i }),
    ).toBeInTheDocument();
  });

  it("renders /terminos", async () => {
    const Page = (await import("@/app/terminos/page")).default;
    render(await Page());
    expect(
      screen.getByRole("heading", { name: /términos y condiciones/i }),
    ).toBeInTheDocument();
  });

  it("renders /contacto with the 3 contact channels", async () => {
    const Page = (await import("@/app/contacto/page")).default;
    render(await Page());
    expect(screen.getByRole("heading", { name: /contacto/i })).toBeInTheDocument();
    expect(screen.getByText(/hola@angelinaconsultoria/i)).toBeInTheDocument();
    expect(screen.getByText(/900 000 000/i)).toBeInTheDocument();
  });

  it("renders /preguntas-frecuentes with FAQ items", async () => {
    const Page = (await import("@/app/preguntas-frecuentes/page")).default;
    render(await Page());
    expect(
      screen.getByRole("heading", { name: /preguntas frecuentes/i }),
    ).toBeInTheDocument();
    // At least 5 <details> elements from the FAQ list.
    expect(document.querySelectorAll("details").length).toBeGreaterThanOrEqual(5);
  });

  it("renders /centro-de-ayuda with the resource grid", async () => {
    const Page = (await import("@/app/centro-de-ayuda/page")).default;
    render(await Page());
    expect(
      screen.getByRole("heading", { name: /centro de ayuda/i }),
    ).toBeInTheDocument();
    // 5 resource cards
    expect(screen.getByText(/preguntas frecuentes/i)).toBeInTheDocument();
    expect(screen.getByText(/privacidad y seguridad/i)).toBeInTheDocument();
  });

  it("renders /quienes-somos with the values grid", async () => {
    const Page = (await import("@/app/quienes-somos/page")).default;
    render(await Page());
    expect(
      screen.getByRole("heading", { name: /quiénes somos/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/cuidado centrado en la persona/i)).toBeInTheDocument();
  });

  it("renders /proximamente with default copy", async () => {
    const Page = (await import("@/app/proximamente/page")).default;
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { name: /próximamente/i }),
    ).toBeInTheDocument();
  });

  it("renders /proximamente with feature name in the message", async () => {
    const Page = (await import("@/app/proximamente/page")).default;
    render(
      await Page({ searchParams: Promise.resolve({ feature: "Mensajería" }) }),
    );
    expect(
      screen.getByText(/La funcionalidad "Mensajería" está en desarrollo\./i),
    ).toBeInTheDocument();
  });
});

describe("footer (Footer.tsx) link targets", () => {
  it("all 11 footer links point to real paths (no #)", async () => {
    const { Footer } = await import("@/components/home/Footer");
    const { container } = render(<Footer />);
    const anchors = container.querySelectorAll("a[href]");
    const hrefs = Array.from(anchors).map((a) => a.getAttribute("href"));
    // No href="#" remains.
    expect(hrefs.every((h) => h !== "#")).toBe(true);
    // The 6 formerly-stub links all have real targets.
    for (const expected of [
      "/privacidad",
      "/terminos",
      "/quienes-somos",
      "/contacto",
      "/preguntas-frecuentes",
      "/centro-de-ayuda",
    ]) {
      expect(hrefs).toContain(expected);
    }
  });

  it("no data-todo attribute remains (the marker is obsolete)", async () => {
    const { Footer } = await import("@/components/home/Footer");
    const { container } = render(<Footer />);
    expect(
      container.querySelector('[data-todo="home-page-upgrade"]'),
    ).toBeNull();
  });
});
