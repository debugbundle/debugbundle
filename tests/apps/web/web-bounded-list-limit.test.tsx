// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BoundedListLimit } from "../../../apps/web/src/components/system/bounded-list-limit.js";
afterEach(cleanup);
it("applies supported limits and rejects invalid values without dispatch", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<BoundedListLimit id="limit" label="Rule limit" value={20} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Rule limit"), { target: { value: "100" } });
  await user.click(screen.getByRole("button", { name: "Apply rule limit" }));
  expect(onChange).toHaveBeenCalledWith(100);
  for (const value of ["0", "101", "1.5", ""]) {
    fireEvent.change(screen.getByLabelText("Rule limit"), { target: { value } });
    expect(screen.getByRole("button", { name: "Apply rule limit" })).toBeDisabled();
  }
  expect(onChange).toHaveBeenCalledTimes(1);
});
