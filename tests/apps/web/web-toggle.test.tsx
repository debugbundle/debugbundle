// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Toggle } from "../../../apps/web/src/components/ui/toggle.js";
import { ToggleGroup, ToggleGroupItem } from "../../../apps/web/src/components/ui/toggle-group.js";

it("exposes pressed state to keyboard users and prevents changes while disabled", async () => {
  const change = vi.fn(),
    user = userEvent.setup();
  const { rerender } = render(
    <Toggle aria-label="Select read permission" onPressedChange={change}>
      Read
    </Toggle>
  );
  const toggle = screen.getByRole("button", { name: "Select read permission" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  // Hidden removes the unselected indicator from layout; opacity would reserve a blank slot.
  expect(toggle.querySelector('[data-slot="toggle-indicator"]')).toHaveClass("hidden");
  expect(toggle.querySelector('[data-slot="toggle-indicator"]')).not.toHaveClass("opacity-0");
  toggle.focus();
  await user.keyboard(" ");
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(toggle.querySelector('[data-slot="toggle-indicator"]')).toHaveAttribute(
    "aria-hidden",
    "true"
  );
  expect(change).toHaveBeenCalledExactlyOnceWith(true);
  rerender(
    <Toggle aria-label="Select read permission" disabled onPressedChange={change}>
      Read
    </Toggle>
  );
  await user.click(toggle);
  expect(change).toHaveBeenCalledTimes(1);
  expect(toggle).toBeDisabled();
});

it("provides a selection check in single-choice groups without changing labels or keyboard selection", async () => {
  const user = userEvent.setup();
  render(
    <ToggleGroup type="single" defaultValue="workspace" aria-label="Scope">
      <ToggleGroupItem value="workspace">Current workspace</ToggleGroupItem>
      <ToggleGroupItem value="projects">Selected projects</ToggleGroupItem>
    </ToggleGroup>
  );
  const workspace = screen.getByRole("radio", { name: "Current workspace" });
  const projects = screen.getByRole("radio", { name: "Selected projects" });
  expect(workspace).toBeChecked();
  expect(workspace).toHaveAttribute("data-state", "on");
  expect(workspace.querySelector('[data-slot="toggle-indicator"]')).toHaveAttribute(
    "aria-hidden",
    "true"
  );
  workspace.focus();
  await user.keyboard("{ArrowRight} ");
  expect(projects).toBeChecked();
  expect(workspace).not.toBeChecked();
});

it("keeps multiple selected checks independent and prevents disabled choices", async () => {
  const user = userEvent.setup();
  render(
    <ToggleGroup type="multiple" defaultValue={["read", "write"]} aria-label="Permissions">
      <ToggleGroupItem value="read">Read</ToggleGroupItem>
      <ToggleGroupItem value="write">Write</ToggleGroupItem>
      <ToggleGroupItem value="admin" disabled>
        Project settings
      </ToggleGroupItem>
    </ToggleGroup>
  );
  const read = screen.getByRole("button", { name: "Read" });
  const write = screen.getByRole("button", { name: "Write" });
  expect(read.querySelector('[data-slot="toggle-indicator"]')).not.toBeNull();
  expect(write.querySelector('[data-slot="toggle-indicator"]')).not.toBeNull();
  await user.click(write);
  expect(write).toHaveAttribute("aria-pressed", "false");
  expect(read).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Project settings" })).toBeDisabled();
});
