// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ReportRunStatus } from "../../../apps/web/src/components/system/report-run-status.js";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip.js";
import { reportRunFixture } from "../../helpers/smart-reports.js";
import { reportRunPresentation } from "../../../packages/smart-reports/src/report-presentation.js";
class MousePointerEvent extends MouseEvent {
  readonly pointerType = "mouse";
}
beforeEach(() => vi.stubGlobal("PointerEvent", MousePointerEvent));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(["failed", "skipped_quota", "paused_access"] as const)(
  "keeps %s explanations out of table flow and available through focus and activation",
  async (status) => {
    const user = userEvent.setup();
    const run = { ...reportRunFixture(), status };
    const state = reportRunPresentation(run);
    render(
      <TooltipProvider>
        <ReportRunStatus run={run} description="tooltip" />
      </TooltipProvider>
    );
    expect(screen.queryByText(state.description)).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: state.label });
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(state.description);
    expect(trigger).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(state.description);
  }
);
it("shows status details on hover", async () => {
  const run = { ...reportRunFixture(), status: "failed" as const };
  render(
    <TooltipProvider>
      <ReportRunStatus run={run} description="tooltip" />
    </TooltipProvider>
  );
  fireEvent.pointerMove(screen.getByRole("button", { name: "Failed" }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent("could not be completed");
});
