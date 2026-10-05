// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AnalyticsFlowForm } from "../../../apps/web/src/components/system/analytics-flow-form.js";
import { flowInput } from "../../fixtures/analytics-flow-report.js";

it("edits and reorders steps while retaining explicit keys and origins", async () => {
  const save = vi.fn();
  const cancel = vi.fn();
  render(
    <AnalyticsFlowForm
      initial={flowInput}
      busy={false}
      error={null}
      onSave={save}
      onCancel={cancel}
    />
  );
  const user = userEvent.setup();
  expect(screen.getByLabelText("Flow key")).toBeDisabled();
  await user.clear(screen.getByLabelText("Expiry (minutes)"));
  await user.type(screen.getByLabelText("Expiry (minutes)"), "90");
  screen.getByRole("combobox", { name: "Purpose" }).focus();
  await user.keyboard("{ArrowDown}");
  await screen.findByRole("option", { name: "Activation" });
  await user.keyboard("{End}{Enter}");
  await user.click(screen.getByRole("button", { name: "Move step 2 up" }));
  expect(screen.getByLabelText("Step 1 key")).toHaveValue("blog");
  await user.click(screen.getByRole("button", { name: "Add step" }));
  await user.type(screen.getByLabelText("Step 3 key"), "discarded");
  await user.click(screen.getByRole("button", { name: "Remove step 3" }));
  expect(screen.queryByLabelText("Step 3 key")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save flow" }));
  expect(save).toHaveBeenCalledWith({
    ...flowInput,
    kind: "activation",
    timeout_minutes: 90,
    steps: [...flowInput.steps].reverse()
  });
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
});

it("rejects duplicate keys without losing the draft and lets the user correct them", async () => {
  const save = vi.fn();
  render(
    <AnalyticsFlowForm
      initial={flowInput}
      busy={false}
      error={null}
      onSave={save}
      onCancel={vi.fn()}
    />
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Step 2 key"));
  await user.type(screen.getByLabelText("Step 2 key"), "home");
  await user.click(screen.getByRole("button", { name: "Save flow" }));
  expect(screen.getByText("Step keys must be unique.")).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Flow name")).toHaveValue(flowInput.display_name);
  await user.clear(screen.getByLabelText("Step 2 key"));
  await user.type(screen.getByLabelText("Step 2 key"), "blog");
  await user.click(screen.getByRole("button", { name: "Save flow" }));
  expect(save).toHaveBeenCalledWith(flowInput);
});

it("bounds step count and disables edits during saving", async () => {
  const { rerender } = render(
    <AnalyticsFlowForm
      initial={flowInput}
      busy={false}
      error={null}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "Remove step 1" })).toBeDisabled();
  for (let index = 2; index < 8; index++)
    await user.click(screen.getByRole("button", { name: "Add step" }));
  expect(screen.getByRole("button", { name: "Add step" })).toBeDisabled();
  rerender(
    <AnalyticsFlowForm
      initial={flowInput}
      busy={true}
      error={null}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  expect(screen.getByLabelText("Flow name")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
});
