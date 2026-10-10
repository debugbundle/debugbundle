// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PublicStatusSettingsDialog } from "../../../apps/web/src/components/system/public-status-settings.js";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip.js";
import * as notify from "../../../apps/web/src/lib/notify.js";
import { createProject, jsonResponse, requestUrl } from "./web-test-helpers.js";
import {
  statusCheckId,
  statusPageFixture,
  statusProjectId,
  statusPublicId,
  statusSettings
} from "../../helpers/public-status.ts";

const publicUrl = `https://status.example.com/${statusPublicId}`;
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});
function setup() {
  const fetchMock = vi.fn<typeof fetch>(async (url) => {
    const path = requestUrl(url);
    if (path.includes("/options"))
      return jsonResponse(200, {
        projects: [
          {
            project_id: statusProjectId,
            name: "Website",
            checks: [{ check_id: statusCheckId, name: "Public service" }],
            next_check_cursor: null
          }
        ],
        next_cursor: null
      });
    if (path.endsWith("/preview")) return jsonResponse(200, statusPageFixture());
    return jsonResponse(200, {
      settings: statusSettings,
      public_id: statusPublicId,
      public_url: publicUrl,
      access_mode: "manage"
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <TooltipProvider>
      <PublicStatusSettingsDialog
        project={createProject({ project_id: statusProjectId, name: "Website" })}
        checks={null}
      />
    </TooltipProvider>
  );
  return fetchMock;
}

it("loads on opening, uses a read-only link with an inline copy icon, and restores focus on close", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const fetchMock = setup();
  expect(fetchMock).not.toHaveBeenCalled();
  const trigger = screen.getByRole("button", { name: "Public status page" });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Public status page" });
  const link = await within(dialog).findByRole("textbox", { name: "Public status link" });
  expect(link).toHaveValue(publicUrl);
  expect(link).toHaveAttribute("readonly");
  await user.type(link, "edit");
  expect(link).toHaveValue(publicUrl);
  const copy = within(dialog).getByRole("button", { name: "Copy link" });
  expect(copy.closest('[data-slot="input-group"]')).toContainElement(link);
  expect(copy.querySelector("svg")).toBeInTheDocument();
  await user.click(copy);
  expect(writeText).toHaveBeenCalledWith(publicUrl);
  expect(within(dialog).getByRole("link", { name: "Open status page" })).toHaveAttribute(
    "href",
    publicUrl
  );
  fireEvent.change(within(dialog).getByLabelText("Page status title"), {
    target: { value: "Unsaved edit" }
  });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(trigger).toHaveFocus());
  const count = fetchMock.mock.calls.length;
  await user.click(trigger);
  expect(await screen.findByLabelText("Page status title")).toHaveValue(statusSettings.title);
  expect(fetchMock.mock.calls.length).toBeGreaterThan(count);
});

it("keeps the settings modal open when dismissing a selector and a nested preview", async () => {
  const user = userEvent.setup();
  setup();
  await user.click(screen.getByRole("button", { name: "Public status page" }));
  await screen.findByLabelText("Page status title");
  await user.click(screen.getByRole("button", { name: /^Website checks:/ }));
  const search = await screen.findByRole("searchbox");
  await waitFor(() => expect(search).toHaveFocus());
  await user.type(search, "Public");
  await user.keyboard("{ArrowDown}");
  await waitFor(() =>
    expect(screen.getByRole("menuitemcheckbox", { name: "Public service" })).toHaveFocus()
  );
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Public status page" })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Website checks:/ })).toHaveFocus()
  );
  await user.click(screen.getByRole("button", { name: "Preview saved page" }));
  const preview = await screen.findByRole("dialog", { name: "Product status" });
  await user.click(within(preview).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Product status" })).toBeNull());
  expect(screen.getByRole("dialog", { name: "Public status page" })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Preview saved page" })).toHaveFocus()
  );
});

it("ignores a preview that completes after the settings modal was closed", async () => {
  let finish: ((response: Response) => void) | undefined;
  const fetchMock = setup();
  fetchMock.mockImplementation(async (url: RequestInfo | URL) =>
    requestUrl(url).endsWith("/preview")
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : jsonResponse(
          200,
          requestUrl(url).includes("/options")
            ? { projects: [], next_cursor: null }
            : {
                settings: statusSettings,
                public_id: statusPublicId,
                public_url: publicUrl,
                access_mode: "manage"
              }
        )
  );
  fireEvent.click(screen.getByRole("button", { name: "Public status page" }));
  fireEvent.click(await screen.findByRole("button", { name: "Preview saved page" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(finish).toBeTypeOf("function");
  await act(async () => {
    finish?.(jsonResponse(200, statusPageFixture()));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Public status page" })).toHaveFocus()
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("ignores initial settings that arrive after closing and reloads on the next opening", async () => {
  let finish: ((response: Response) => void) | undefined;
  const fetchMock = setup();
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole("button", { name: "Public status page" }));
  expect(screen.queryByLabelText("Page status title")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(finish).toBeTypeOf("function");
  await act(async () => {
    finish?.(
      jsonResponse(200, {
        settings: statusSettings,
        public_id: statusPublicId,
        public_url: publicUrl,
        access_mode: "manage"
      })
    );
    await Promise.resolve();
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Public status page" }));
  expect(await screen.findByLabelText("Page status title")).toHaveValue(statusSettings.title);
});

it.each([200, 500])(
  "ignores a save response (%s) after closing without affecting the reopened modal",
  async (status) => {
    let finish: ((response: Response) => void) | undefined;
    const fetchMock = setup();
    const success = vi.spyOn(notify, "showSuccessToast").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Public status page" }));
    await screen.findByLabelText("Page status title");
    const saveButton = screen.getByRole("button", { name: "Save status settings" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      init?.method === "PUT"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : originalFetch(url, init)
    );
    fireEvent.click(saveButton);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Public status page" }));
    await screen.findByLabelText("Page status title");
    expect(finish).toBeTypeOf("function");
    await act(async () => {
      finish?.(
        jsonResponse(status, {
          settings: statusSettings,
          public_id: statusPublicId,
          public_url: publicUrl,
          access_mode: "manage"
        })
      );
      await Promise.resolve();
    });
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Public status page" })).toBeInTheDocument();
    expect(screen.queryByText(/Could not save status settings/)).toBeNull();
    expect(screen.getByLabelText("Page status title")).toHaveValue(statusSettings.title);
  }
);
