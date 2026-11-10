// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GitHubRulesPanel } from "../../../apps/web/src/components/system/github-rules-panel.js";

describe("GitHub empty rules", () => {
  it("offers one create action inside the empty state when creation is permitted", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <GitHubRulesPanel
        rules={[]}
        canCreate
        deletingRuleId={null}
        canEdit={() => false}
        canDelete={() => false}
        onCreate={onCreate}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const title = screen.getByText("No dispatch rules yet");
    const empty = title.closest('[data-slot="empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.querySelector('[data-slot="empty-icon"]')).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Create rule" })).toHaveLength(1);
    await user.click(within(empty as HTMLElement).getByRole("button", { name: "Create rule" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps an unavailable create action absent and explains where rules will appear", () => {
    const onCreate = vi.fn();
    render(
      <GitHubRulesPanel
        rules={[]}
        canCreate={false}
        deletingRuleId={null}
        canEdit={() => false}
        canDelete={() => false}
        onCreate={onCreate}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("No dispatch rules yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Dispatch rules appear here after a repository is connected and a rule is created."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create rule" })).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
