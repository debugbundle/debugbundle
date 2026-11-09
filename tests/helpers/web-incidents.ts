import { fireEvent, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, vi } from "vitest";
import { resetBrowserSessionClientState } from "../../apps/web/src/lib/api.js";

export async function findStatusFilterTrigger(id: string): Promise<HTMLElement> {
  await waitFor(() => {
    expect(document.getElementById(id)).not.toBeNull();
  });

  return document.getElementById(id) as HTMLElement;
}

export async function chooseStatusFilterOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerId: string,
  optionName: RegExp | string
): Promise<void> {
  const trigger = await findStatusFilterTrigger(triggerId);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: optionName }));
}

export function getPrimaryRefreshButton(): HTMLElement {
  const refreshButtons = screen.getAllByRole("button", { name: /^refresh$/i });
  return refreshButtons[refreshButtons.length - 1] as HTMLElement;
}

export function registerIncidentTestCleanup(): void {
  afterEach(() => {
    resetBrowserSessionClientState();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
}
