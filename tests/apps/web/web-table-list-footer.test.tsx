// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TableListFooter } from "../../../apps/web/src/components/system/table-list-footer.js";

afterEach(cleanup);

it("selects a supported row count immediately by keyboard without an apply action", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <TableListFooter id="rows" value={20} onChange={onChange} ariaLabel="Delivery rows per page">
      <span>Page 1</span>
    </TableListFooter>
  );
  const select = screen.getByRole("combobox", { name: "Delivery rows per page" });
  expect(select).toHaveTextContent("20");
  expect(screen.getByText("Rows per page")).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
  await user.tab();
  expect(select).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    "10",
    "20",
    "50",
    "100"
  ]);
  await user.keyboard("{End}{Enter}");
  expect(onChange).toHaveBeenCalledExactlyOnceWith(100);
});

it("keeps the row selector disabled during a pending read", () => {
  const onChange = vi.fn();
  render(
    <TableListFooter
      id="rows"
      value={20}
      onChange={onChange}
      ariaLabel="Delivery rows per page"
      disabled
    />
  );
  const select = screen.getByRole("combobox", { name: "Delivery rows per page" });
  expect(select).toBeDisabled();
  expect(screen.queryByRole("option")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
