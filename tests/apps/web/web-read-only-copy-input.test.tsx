// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReadOnlyCopyInput } from "../../../apps/web/src/components/system/read-only-copy-input.js";
import * as notify from "../../../apps/web/src/lib/notify.js";

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const value = "https://example.com/status/public";
afterEach(() => {
  vi.restoreAllMocks();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});

it("copies the read-only value using the labelled inline icon without submitting a form", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const success = vi.spyOn(notify, "showSuccessToast").mockImplementation(() => undefined);
  const submit = vi.fn();
  render(
    <form onSubmit={submit}>
      <ReadOnlyCopyInput id="link" label="Share link" value={value} />
    </form>
  );
  const input = screen.getByRole("textbox", { name: "Share link" });
  const button = screen.getByRole("button", { name: "Copy" });
  expect(input).toHaveAttribute("readonly");
  expect(button.closest('[data-align="inline-end"]')).toBeInTheDocument();
  fireEvent.focus(input);
  expect((input as HTMLInputElement).selectionEnd).toBe(value.length);
  fireEvent.click(button);
  await waitFor(() => expect(success).toHaveBeenCalledWith("Copied to clipboard."));
  expect(writeText).toHaveBeenCalledWith(value);
  expect(submit).not.toHaveBeenCalled();
  button.focus();
  fireEvent.click(button.parentElement!);
  expect(input).toHaveFocus();
  button.focus();
  fireEvent.click(button);
  expect(button).toHaveFocus();
});

it("shows a pending value without copying an empty string, then enables copying when ready", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const props = {
    id: "link",
    label: "Share link",
    placeholder: "Creating your public link…"
  };
  const view = render(<ReadOnlyCopyInput {...props} value="" />);
  const input = screen.getByRole("textbox", { name: "Share link" });
  expect(input).toHaveAttribute("readonly");
  expect(input).toHaveAttribute("placeholder", props.placeholder);
  expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(writeText).not.toHaveBeenCalled();
  view.rerender(<ReadOnlyCopyInput {...props} value={value} />);
  expect(input).toHaveValue(value);
  expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(value));
});

it.each(["missing", "rejected", "throws"])(
  "selects the value for manual copying when the clipboard is %s",
  async (mode) => {
    const writeText = vi.fn(() => {
      if (mode === "throws") throw new Error("unavailable");
      return Promise.reject(new Error("denied"));
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: mode === "missing" ? undefined : { writeText }
    });
    const error = vi.spyOn(notify, "showErrorToast").mockImplementation(() => undefined);
    render(<ReadOnlyCopyInput id="link" label="Share link" value={value} copyLabel="Copy link" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("Could not copy. Select and copy the value in the input.")
    );
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Share link" });
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(value.length);
  }
);
