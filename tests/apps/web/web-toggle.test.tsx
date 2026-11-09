// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Toggle } from "../../../apps/web/src/components/ui/toggle.js";

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
  toggle.focus();
  await user.keyboard(" ");
  expect(toggle).toHaveAttribute("aria-pressed", "true");
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
