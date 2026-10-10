// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import {
  MultiSelect,
  type MultiSelectOption
} from "../../../apps/web/src/components/system/multi-select.js";

const options: MultiSelectOption[] = [
  { value: "api", label: "API service" },
  { value: "web", label: "Website" },
  { value: "other", label: "Other service", disabled: true }
];
function Selection({
  initial = [],
  choices = options,
  disabled = false,
  changed = () => {},
  loadMore
}: {
  initial?: string[];
  choices?: MultiSelectOption[];
  disabled?: boolean;
  changed?: (value: string[]) => void;
  loadMore?: { label: string; onLoadMore: () => void };
}): JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <MultiSelect
      id="services"
      label="Services"
      value={value}
      options={choices}
      disabled={disabled}
      loadMore={loadMore}
      onValueChange={(next) => {
        setValue(next);
        changed(next);
      }}
    />
  );
}
async function open(): Promise<HTMLInputElement> {
  fireEvent.keyDown(screen.getByRole("button", { name: /^Services:/ }), { key: "Enter" });
  return screen.findByRole("searchbox", { name: "Search Services" });
}

it("searches without losing hidden or unloaded selections and keeps the menu open when toggled", async () => {
  const changed = vi.fn();
  render(<Selection initial={["unloaded", "api"]} changed={changed} />);
  expect(screen.getByRole("button")).toHaveTextContent("2 selected");
  const search = await open();
  fireEvent.change(search, { target: { value: "  WEBSITE " } });
  expect(screen.queryByRole("menuitemcheckbox", { name: "API service" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Website" }));
  expect(changed).toHaveBeenLastCalledWith(["unloaded", "api", "web"]);
  expect(screen.getByRole("menuitemcheckbox", { name: "Website" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  fireEvent.change(search, { target: { value: "API" } });
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "API service" }));
  expect(changed).toHaveBeenLastCalledWith(["unloaded", "web"]);
  fireEvent.keyDown(search, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(await open()).toHaveValue("");
});

it("supports keyboard navigation, toggling, dismissal and focus return", async () => {
  const user = userEvent.setup();
  render(<Selection />);
  const trigger = screen.getByRole("button");
  trigger.focus();
  await user.keyboard("{Enter}");
  const search = await screen.findByRole("searchbox");
  await waitFor(() => expect(search).toHaveFocus());
  await user.type(search, "service");
  expect(search).toHaveValue("service");
  await user.keyboard("{ArrowDown}");
  const api = screen.getByRole("menuitemcheckbox", { name: "API service" });
  await waitFor(() => expect(api).toHaveFocus());
  await user.keyboard(" ");
  expect(api).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("menu")).toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(api).toHaveAttribute("aria-checked", "false");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  const reopenedSearch = await screen.findByRole("searchbox");
  await waitFor(() => expect(reopenedSearch).toHaveFocus());
  await user.keyboard("{ArrowUp}");
  await waitFor(() =>
    expect(screen.getByRole("menuitemcheckbox", { name: "Website" })).toHaveFocus()
  );
});

it("preserves selections and search while loading another page, including empty searches", async () => {
  const onLoadMore = vi.fn();
  const view = render(
    <Selection initial={["web"]} loadMore={{ label: "Load more services", onLoadMore }} />
  );
  const search = await open();
  fireEvent.change(search, { target: { value: "worker" } });
  expect(screen.getByText("No matches")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "Load more services" }));
  expect(onLoadMore).toHaveBeenCalledOnce();
  expect(search).toHaveFocus();
  view.rerender(
    <Selection initial={["web"]} disabled loadMore={{ label: "Loading…", onLoadMore }} />
  );
  expect(search).toHaveFocus();
  expect(screen.getByRole("menu")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("menuitem", { name: "Loading…" })).toHaveAttribute(
    "aria-disabled",
    "true"
  );
  view.rerender(
    <Selection
      initial={["web"]}
      choices={[...options, { value: "worker", label: "Worker service" }]}
    />
  );
  expect(search).toHaveValue("worker");
  expect(screen.getByRole("menuitemcheckbox", { name: "Worker service" })).toHaveAttribute(
    "aria-checked",
    "false"
  );
  expect(screen.getByRole("button")).toHaveTextContent("Website");
  expect(search).toHaveFocus();
});

it("disables unavailable options and the trigger, and handles an empty option list", async () => {
  const changed = vi.fn();
  const view = render(<Selection changed={changed} />);
  await open();
  const unavailable = screen.getByRole("menuitemcheckbox", { name: "Other service" });
  expect(unavailable).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(unavailable);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  view.rerender(<Selection disabled />);
  expect(screen.getByRole("button")).toBeDisabled();
  view.rerender(<Selection choices={[]} />);
  await open();
  expect(screen.getByText("No matches")).toBeInTheDocument();
  expect(screen.queryByRole("menuitemcheckbox")).toBeNull();
});
