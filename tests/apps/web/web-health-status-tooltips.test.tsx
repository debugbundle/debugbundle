// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StatusHistoryStrip } from "../../../apps/web/src/components/system/health-status-view.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "../../../apps/web/src/components/ui/tooltip.js";
import { formatStatusDayLabel } from "../../../packages/shared-types/src/availability-health.js";
import { statusPageFixture } from "../../helpers/public-status.ts";

class MousePointerEvent extends MouseEvent {
  readonly pointerType = "mouse";
}
beforeEach(() => vi.stubGlobal("PointerEvent", MousePointerEvent));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const days = statusPageFixture().projects[0]!.days.slice(0, 3);

it.each(["project", "check"] as const)(
  "moves to every adjacent %s day in both directions on the first pointer movement",
  async (scope) => {
    const labels = days.map((day) => formatStatusDayLabel(day, scope));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      const index = labels.indexOf(this.getAttribute("aria-label") ?? "");
      return index < 0 ? new DOMRect(50, 30, 220, 50) : new DOMRect(100 + index * 14, 100, 12, 20);
    });
    render(
      <TooltipProvider>
        <StatusHistoryStrip days={days} label="History" scope={scope} compact={scope === "check"} />
      </TooltipProvider>
    );
    const blocks = labels.map((name) => screen.getByRole("button", { name }));
    fireEvent.pointerMove(blocks[0]!, { clientX: 106, clientY: 110 });
    expect(await screen.findByRole("tooltip")).toHaveTextContent(labels[0]!);
    for (const [from, to] of [
      [0, 1],
      [1, 2],
      [2, 1],
      [1, 0]
    ]) {
      fireEvent.pointerLeave(blocks[from!]!, {
        clientX: 100 + from! * 14 + (to! > from! ? 12 : 0),
        clientY: 110
      });
      fireEvent.pointerMove(blocks[to!]!, { clientX: 106 + to! * 14, clientY: 110 });
      await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent(labels[to!]!));
      expect(blocks[to!]!).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    }
    fireEvent.pointerLeave(blocks[0]!, { clientX: 95, clientY: 110 });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  }
);

it("retains keyboard focus, tooltip descriptions and Escape dismissal for status days", async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <StatusHistoryStrip days={days} label="History" />
    </TooltipProvider>
  );
  const blocks = screen.getAllByRole("button");
  await user.tab();
  expect(blocks[0]).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent(formatStatusDayLabel(days[0]!));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  expect(blocks[0]).toHaveFocus();
  await user.tab();
  expect(blocks[1]).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent(formatStatusDayLabel(days[1]!));
});

it("keeps ordinary tooltip content hoverable", async () => {
  render(
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>Details</TooltipTrigger>
        <TooltipContent>Ordinary details</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
  const trigger = screen.getByRole("button", { name: "Details" });
  fireEvent.pointerMove(trigger);
  await screen.findByRole("tooltip");
  fireEvent.pointerLeave(trigger);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Ordinary details");
});
