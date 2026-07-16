// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CollapsibleCard } from "../../../apps/web/src/components/ui/collapsible-card.js";

describe("web UI - collapsible card", () => {
  it("keeps its heading and description visible while toggling its content", async () => {
    const user = userEvent.setup();

    render(
      <CollapsibleCard title="Capture policy" description="Control which signals the SDK forwards.">
        <button type="button">Save policy</button>
      </CollapsibleCard>
    );

    expect(screen.getByRole("heading", { name: "Capture policy", level: 3 })).toBeInTheDocument();
    const description = screen.getByText("Control which signals the SDK forwards.");
    expect(description).toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "Capture policy" });
    expect(description.closest("button")).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Save policy" })).toBeNull();

    await user.click(description);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Save policy" })).toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Save policy" })).toBeNull();
  });

  it("supports an initially expanded section", () => {
    render(
      <CollapsibleCard title="Weekly reports" defaultOpen>
        <p>Report settings</p>
      </CollapsibleCard>
    );

    expect(screen.getByRole("button", { name: "Weekly reports" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Report settings")).toBeInTheDocument();
  });
});
