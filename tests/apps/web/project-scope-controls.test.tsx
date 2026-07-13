// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  ProjectScopeMultiSelect,
  ProjectScopeSelect,
  joinScopeValues
} from "../../../apps/web/src/components/system/project-scope-controls.tsx";

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
}

describe("project scope controls", () => {
  it("selects a known single scope value without exposing a raw input", async () => {
    const user = userEvent.setup();
    render(<SingleScopeHarness />);

    const trigger = screen.getByRole("combobox", { name: "Service" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
    await user.click(await screen.findByRole("option", { name: "checkout-api" }));

    expect(screen.getByText("Selected: checkout-api")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Custom service" })).not.toBeInTheDocument();
  });

  it("serializes multi-value selections through the dropdown checklist and preserves custom values", async () => {
    const user = userEvent.setup();
    render(<MultiScopeHarness />);

    await user.click(screen.getByRole("button", { name: "Services: All services" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "api" }));
    await user.type(screen.getByRole("textbox", { name: "Add custom services" }), "worker");
    await user.click(screen.getByRole("button", { name: "Add custom services" }));

    expect(screen.getByText("Selected: api, worker")).toBeInTheDocument();
  });
});

function SingleScopeHarness(): JSX.Element {
  const [value, setValue] = useState("");
  return (
    <>
      <ProjectScopeSelect
        id="service"
        label="Service"
        value={value}
        options={["api", "checkout-api"]}
        allLabel="All services"
        onValueChange={setValue}
      />
      <p>Selected: {value || "all"}</p>
    </>
  );
}

function MultiScopeHarness(): JSX.Element {
  const [value, setValue] = useState<string[]>([]);
  return (
    <>
      <ProjectScopeMultiSelect
        id="services"
        label="Services"
        value={value}
        options={["api", "web"]}
        onValueChange={setValue}
      />
      <p>Selected: {joinScopeValues(value)}</p>
    </>
  );
}
