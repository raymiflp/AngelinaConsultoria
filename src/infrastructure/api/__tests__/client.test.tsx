import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { api } from "../client";
import { TRPCProvider } from "../provider";

describe("api client", () => {
  it("createClient method is defined", () => {
    expect(api.createClient).toBeDefined();
  });

  it("Provider component is defined", () => {
    expect(api.Provider).toBeDefined();
  });

  it("useUtils hook is defined", () => {
    expect(api.useUtils).toBeDefined();
  });
});

describe("TRPCProvider", () => {
  it("renders children without crashing", () => {
    render(
      <TRPCProvider>
        <div data-testid="child">Hello</div>
      </TRPCProvider>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
    expect(screen.getByText("Hello")).toBeDefined();
  });
});
