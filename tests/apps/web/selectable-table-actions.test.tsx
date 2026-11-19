// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import {
  SelectableTableActions,
  StickyMobileTableActions,
  useVisibleRowSelection
} from "../../../apps/web/src/components/system/selectable-table-actions.js";
import { IncidentTable } from "../../../apps/web/src/components/system/project-incident-table.js";
import { createIncident } from "./web-test-helpers.js";

const first = createIncident({ incident_id: "first", title: "First incident" });
const second = createIncident({ incident_id: "second", title: "Second incident" });
const rowClick = vi.fn();
function SelectionTable({
  rows = [first, second],
  mobile = false
}: {
  rows?: (typeof first)[];
  mobile?: boolean;
}): JSX.Element {
  const selection = useVisibleRowSelection(rows.map((row) => row.incident_id));
  const Actions = mobile ? StickyMobileTableActions : SelectableTableActions;
  return (
    <>
      <h2 id="selection-focus-target" tabIndex={-1}>
        Incident inventory
      </h2>
      <Actions
        focusTargetId="selection-focus-target"
        itemLabel="incident"
        totalCount={rows.length}
        allSelected={selection.allSelected}
        onToggleSelectAll={selection.toggleSelectAll}
        onClearSelection={selection.clearSelection}
        selectedCount={selection.selectedCount}
        primaryActionLabel="Resolve selected"
        secondaryActionLabel="Reopen selected"
        onPrimaryAction={selection.clearSelection}
        onSecondaryAction={vi.fn()}
      />
      <IncidentTable
        incidents={rows}
        sort={{ field: "last_seen_at", direction: "desc" }}
        onSortChange={vi.fn()}
        selectedIncidentIds={selection.selectedIdSet}
        onToggleIncidentSelection={selection.toggleId}
        onToggleSelectAll={selection.toggleSelectAll}
        onIncidentRowClick={rowClick}
      />
    </>
  );
}
it("reveals bulk actions on first selection and uses shared checkbox mixed/all/clear keyboard states", async () => {
  const user = userEvent.setup();
  rowClick.mockClear();
  render(
    <MemoryRouter>
      <SelectionTable />
    </MemoryRouter>
  );
  expect(screen.queryByRole("button", { name: "Resolve selected" })).toBeNull();
  expect(screen.queryByText(/apply a bulk action/)).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "Select all visible incidents" })).toBeNull();
  const row = screen.getByRole("checkbox", { name: "Select incident First incident" });
  expect(row).toHaveAttribute("data-slot", "checkbox");
  await user.click(row);
  expect(screen.getByRole("button", { name: "Resolve selected" })).toBeVisible();
  expect(rowClick).not.toHaveBeenCalled();
  const all = screen.getByRole("checkbox", { name: "Select all visible incidents" });
  expect(all).toHaveAttribute("aria-checked", "mixed");
  all.focus();
  await user.keyboard(" ");
  expect(all).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Select incident Second incident" })).toBeChecked();
  await user.click(all);
  expect(screen.queryByRole("checkbox", { name: "Select all visible incidents" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Resolve selected" })).toBeNull();
  expect(row).toHaveFocus();
});
it.each([false, true])(
  "returns focus to the inventory after its bulk toolbar disappears (mobile=%s)",
  async (mobile) => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SelectionTable mobile={mobile} />
      </MemoryRouter>
    );
    const row = screen.getByRole("checkbox", { name: "Select incident First incident" });
    await user.click(row);
    const action = screen.getByRole("button", { name: "Resolve selected" });
    action.focus();
    await user.keyboard(" ");
    expect(screen.queryByRole("button", { name: "Resolve selected" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Incident inventory" })).toHaveFocus();
    await user.click(row);
    await user.click(row);
    expect(row).toHaveFocus();
  }
);
it("removes bulk controls when selected rows leave the visible page", async () => {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter>
      <SelectionTable rows={[first]} />
    </MemoryRouter>
  );
  await user.click(screen.getByRole("checkbox", { name: "Select incident First incident" }));
  expect(screen.getByRole("button", { name: "Resolve selected" })).toBeVisible();
  view.rerender(
    <MemoryRouter>
      <SelectionTable rows={[second]} />
    </MemoryRouter>
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Resolve selected" })).toBeNull()
  );
});
