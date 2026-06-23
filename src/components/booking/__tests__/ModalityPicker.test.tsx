import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConsultaModalidad } from "@/domain/enums";

import { ModalityPicker } from "../ModalityPicker";

/**
 * Test plan for `ModalityPicker` (modality-toggle, PR-B):
 *
 *   1. Both options are clickable when onlineDisabled === false
 *   2. Online is disabled with the Spanish tooltip when onlineDisabled === true
 *   3. Clicking Presencial calls onChange("PRESENCIAL")
 *   4. Clicking Online when disabled does NOT call onChange
 *   5. aria-checked reflects the current `value` for both options
 */

const PRESENCIAL_LABEL = /presencial/i;
const ONLINE_LABEL = /videollamada/i;
const ONLINE_DISABLED_TITLE = "Este doctor no ofrece consultas online";

describe("ModalityPicker", () => {
  it("renders both options clickable when onlineDisabled === false", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ModalityPicker
        value={undefined}
        onChange={onChange}
        onlineDisabled={false}
      />,
    );

    const presencial = screen.getByRole("radio", { name: PRESENCIAL_LABEL });
    const online = screen.getByRole("radio", { name: ONLINE_LABEL });

    expect(presencial).toBeEnabled();
    expect(online).toBeEnabled();

    await user.click(presencial);
    expect(onChange).toHaveBeenCalledWith(ConsultaModalidad.PRESENCIAL);

    await user.click(online);
    expect(onChange).toHaveBeenCalledWith(ConsultaModalidad.ONLINE);
  });

  it("disables the Online option with the Spanish tooltip when onlineDisabled === true", () => {
    const onChange = vi.fn();

    render(
      <ModalityPicker
        value={undefined}
        onChange={onChange}
        onlineDisabled={true}
      />,
    );

    const presencial = screen.getByRole("radio", { name: PRESENCIAL_LABEL });
    const online = screen.getByRole("radio", { name: ONLINE_LABEL });

    expect(presencial).toBeEnabled();
    expect(online).toBeDisabled();
    expect(online).toHaveAttribute("title", ONLINE_DISABLED_TITLE);
  });

  it("clicking Presencial calls onChange('PRESENCIAL')", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ModalityPicker
        value={undefined}
        onChange={onChange}
        onlineDisabled={false}
      />,
    );

    await user.click(screen.getByRole("radio", { name: PRESENCIAL_LABEL }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(ConsultaModalidad.PRESENCIAL);
  });

  it("clicking Online when disabled does NOT call onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ModalityPicker
        value={undefined}
        onChange={onChange}
        onlineDisabled={true}
      />,
    );

    // The button is disabled, so a click is a no-op (userEvent respects
    // the `disabled` attribute and does not fire onClick).
    await user.click(screen.getByRole("radio", { name: ONLINE_LABEL }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("aria-checked reflects the current value for both options", () => {
    const { rerender } = render(
      <ModalityPicker
        value={ConsultaModalidad.PRESENCIAL}
        onChange={vi.fn()}
        onlineDisabled={false}
      />,
    );

    let presencial = screen.getByRole("radio", { name: PRESENCIAL_LABEL });
    let online = screen.getByRole("radio", { name: ONLINE_LABEL });
    expect(presencial).toHaveAttribute("aria-checked", "true");
    expect(online).toHaveAttribute("aria-checked", "false");

    rerender(
      <ModalityPicker
        value={ConsultaModalidad.ONLINE}
        onChange={vi.fn()}
        onlineDisabled={false}
      />,
    );

    presencial = screen.getByRole("radio", { name: PRESENCIAL_LABEL });
    online = screen.getByRole("radio", { name: ONLINE_LABEL });
    expect(presencial).toHaveAttribute("aria-checked", "false");
    expect(online).toHaveAttribute("aria-checked", "true");
  });
});
