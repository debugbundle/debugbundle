// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { forwardRef, type SVGProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { TableActionButton } from "../../../apps/web/src/components/system/table-action-button.js";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip.js";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../../../apps/web/src/components/ui/alert-dialog.js";

const TestIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(function TestIcon(props, ref) {
  return <svg {...props} ref={ref} />;
});

describe("icon table actions", () => {
  it("uses the shared icon button with an accessible name and a keyboard tooltip", async () => {
    const user = userEvent.setup();
    const click = vi.fn();
    render(
      <TooltipProvider>
        <TableActionButton label="Edit" icon={TestIcon} onClick={click} />
      </TooltipProvider>
    );
    const button = screen.getByRole("button", { name: "Edit" });
    // Radix's asChild tooltip trigger owns data-slot; size and variant come from Button.
    expect(button).toHaveAttribute("data-variant", "ghost");
    expect(button).toHaveAttribute("data-size", "icon-sm");
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Edit");
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalledOnce();
  });

  it("preserves confirmation dialogs when used as their trigger", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <TableActionButton label="Delete" icon={TestIcon} />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Delete rule</AlertDialogTitle>
            <AlertDialogDescription>Confirm deletion.</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Delete rule");
  });

  it("preserves disabled states and specific accessible labels", async () => {
    const user = userEvent.setup();
    const click = vi.fn();
    render(
      <TooltipProvider>
        <TableActionButton
          label="Deleting…"
          aria-label="Delete rule Production alerts"
          icon={TestIcon}
          disabled
          onClick={click}
        />
      </TooltipProvider>
    );
    await user.click(screen.getByRole("button", { name: "Delete rule Production alerts" }));
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete rule Production alerts" })).toBeDisabled();
  });
});
