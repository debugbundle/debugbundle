// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PendingButton } from "../../../apps/web/src/components/system/pending-button.js";
import { usePendingAction } from "../../../apps/web/src/lib/use-pending-action.js";

it("distinguishes unavailable actions from running requests and restores the action after completion", () => {
  const click = vi.fn();
  const view = render(
    <PendingButton pending={false} disabled onClick={click}>
      Save
    </PendingButton>
  );
  const button = screen.getByRole("button", { name: "Save" });
  expect(button).not.toHaveAttribute("aria-busy");
  expect(button.querySelector("svg")).toBeNull();
  view.rerender(
    <PendingButton pending pendingLabel="Saving…" onClick={click}>
      Save
    </PendingButton>
  );
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button).toHaveAccessibleName("Saving…");
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
  view.rerender(
    <PendingButton pending={false} onClick={click}>
      Save
    </PendingButton>
  );
  expect(button).toBeEnabled();
  expect(button).not.toHaveAttribute("aria-busy");
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
});

it("serializes same-turn submits and releases the lock after failure for a real retry", async () => {
  const { result } = renderHook(() => usePendingAction());
  let reject!: (error: Error) => void;
  const operation = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      })
  );
  let outcome!: Promise<unknown>;
  act(() => {
    outcome = result.current.run(operation).catch((error: unknown) => error);
    void result.current.run(operation);
  });
  expect(operation).toHaveBeenCalledOnce();
  expect(result.current.pending).toBe(true);
  await act(async () => {
    reject(new Error("offline"));
    await outcome;
  });
  expect(result.current.pending).toBe(false);
  const retry = vi.fn(async () => undefined);
  await act(async () => result.current.run(retry));
  expect(retry).toHaveBeenCalledOnce();
  expect(result.current.pending).toBe(false);
});

it("does not start a queued action after its owning form unmounts", async () => {
  const view = renderHook(() => usePendingAction());
  const run = view.result.current.run;
  let finish!: () => void;
  let running!: Promise<void>;
  act(() => {
    running = run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
  });
  view.unmount();
  await act(async () => {
    finish();
    await running;
  });
  const lateAction = vi.fn(async () => undefined);
  await run(lateAction);
  expect(lateAction).not.toHaveBeenCalled();
});
