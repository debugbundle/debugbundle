// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "../../../apps/web/src/components/ui/switch.js";

describe("shared switch", () => {
  it("keeps its accessible name and toggles on and off using the keyboard", async () => {
    const user = userEvent.setup();
    function ConsentSwitch(): JSX.Element {
      const [checked, setChecked] = useState(false);
      return <Switch aria-label="Require consent" checked={checked} onCheckedChange={setChecked} />;
    }
    render(<ConsentSwitch />);
    const control = screen.getByRole("switch", { name: "Require consent" });
    expect(control).toHaveAttribute("aria-checked", "false");
    await user.tab();
    expect(control).toHaveFocus();
    await user.keyboard(" ");
    expect(control).toHaveAttribute("aria-checked", "true");
    await user.keyboard(" ");
    expect(control).toHaveAttribute("aria-checked", "false");
  });

  it("preserves disabled controls and ignores input", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<Switch aria-label="Capture" disabled checked={false} onCheckedChange={change} />);
    const control = screen.getByRole("switch", { name: "Capture" });
    await user.click(control);
    await user.tab();
    expect(control).toBeDisabled();
    expect(control).not.toHaveFocus();
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(change).not.toHaveBeenCalled();
  });
});
