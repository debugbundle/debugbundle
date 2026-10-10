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
function setup(page = statusPageFixture()) {
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
    if (path.endsWith("/preview")) return jsonResponse(200, page);
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

it("auto-saves only publication state and keeps other edits until explicitly saved", async () => {
  const user = userEvent.setup();
  const fetchMock = setup();
  const originalFetch = fetchMock.getMockImplementation()!;
  let persisted = structuredClone(statusSettings);
  const writes: (typeof statusSettings)[] = [];
  fetchMock.mockImplementation(async (url, init) => {
    if (requestUrl(url).includes("/options")) return originalFetch(url, init);
    if (init?.method === "PUT") {
      persisted = JSON.parse(init.body as string);
      writes.push(persisted);
    }
    return jsonResponse(200, {
      settings: persisted,
      public_id: statusPublicId,
      public_url: publicUrl,
      access_mode: "manage"
    });
  });
  await user.click(screen.getByRole("button", { name: "Public status page" }));
  const title = await screen.findByLabelText("Page status title");
  // Invalid unsaved fields must not block disabling the existing publication.
  await user.clear(title);
  await user.click(screen.getByRole("button", { name: /^Website checks:/ }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Public service" }));
  await user.keyboard("{Escape}");
  expect(writes).toHaveLength(0);
  const toggle = screen.getByRole("switch", { name: "Enable public page" });
  await user.click(toggle);
  await waitFor(() => expect(writes).toEqual([{ ...statusSettings, enabled: false }]));
  expect(title).toHaveValue("");
  expect(screen.getByRole("button", { name: /^Website checks:/ })).toHaveTextContent(
    "Select checks"
  );
  expect(screen.queryByRole("link", { name: "Open status page" })).toBeNull();
  await user.click(toggle);
  await waitFor(() =>
    expect(writes).toEqual([{ ...statusSettings, enabled: false }, statusSettings])
  );
  expect(title).toHaveValue("");
  expect(screen.getByRole("button", { name: /^Website checks:/ })).toHaveTextContent(
    "Select checks"
  );
  expect(screen.getByRole("textbox", { name: "Public status link" })).toHaveValue(publicUrl);
  await user.type(title, "Updated status");
  await user.click(screen.getByRole("button", { name: /^Website checks:/ }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Public service" }));
  await user.keyboard("{Escape}");
  expect(writes).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Save status settings" }));
  await waitFor(() => expect(writes[2]).toEqual({ ...statusSettings, title: "Updated status" }));
});

it("requires saving newly selected checks before enabling an existing empty configuration", async () => {
  const user = userEvent.setup();
  const fetchMock = setup();
  const originalFetch = fetchMock.getMockImplementation()!;
  let persisted = {
    ...statusSettings,
    enabled: false,
    projects: [{ project_id: statusProjectId, check_ids: [] as string[] }]
  };
  const writes: (typeof statusSettings)[] = [];
  fetchMock.mockImplementation(async (url, init) => {
    if (requestUrl(url).includes("/options")) return originalFetch(url, init);
    if (init?.method === "PUT") {
      persisted = JSON.parse(init.body as string);
      writes.push(persisted);
    }
    return jsonResponse(200, {
      settings: persisted,
      public_id: statusPublicId,
      public_url: publicUrl,
      access_mode: "manage"
    });
  });
  await user.click(screen.getByRole("button", { name: "Public status page" }));
  await user.click(await screen.findByRole("button", { name: /^Website checks:/ }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Public service" }));
  await user.keyboard("{Escape}");
  const toggle = screen.getByRole("switch", { name: "Enable public page" });
  await user.click(toggle);
  expect(
    screen.getByText("Save at least one selected health check before enabling the public page.")
  ).toBeInTheDocument();
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(writes).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Save status settings" }));
  await waitFor(() => expect(writes).toEqual([{ ...statusSettings, enabled: false }]));
  await user.click(toggle);
  await waitFor(() => expect(writes[1]).toEqual(statusSettings));
  expect(screen.getByRole("link", { name: "Open status page" })).toHaveAttribute("href", publicUrl);
});

it.each([false, true])(
  "restores the saved switch after an auto-save failure (initially enabled: %s)",
  async (enabled) => {
    const user = userEvent.setup();
    const fetchMock = setup();
    const originalFetch = fetchMock.getMockImplementation()!;
    let finish: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation(async (url, init) => {
      if (requestUrl(url).includes("/options")) return originalFetch(url, init);
      if (init?.method === "PUT")
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return jsonResponse(200, {
        settings: { ...statusSettings, enabled },
        public_id: statusPublicId,
        public_url: publicUrl,
        access_mode: "manage"
      });
    });
    await user.click(screen.getByRole("button", { name: "Public status page" }));
    const title = await screen.findByLabelText("Page status title");
    fireEvent.change(title, { target: { value: "Unsaved title" } });
    const toggle = screen.getByRole("switch", { name: "Enable public page" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", String(!enabled));
    expect(toggle).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save status settings" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Preview status page" })).toBeDisabled();
    expect(finish).toBeTypeOf("function");
    await act(async () => {
      finish?.(jsonResponse(503, {}));
    });
    await screen.findByText("Could not update public page visibility. Try again.");
    expect(toggle).toHaveAttribute("aria-checked", String(enabled));
    expect(toggle).toBeEnabled();
    expect(title).toHaveValue("Unsaved title");
    expect(screen.queryByRole("textbox", { name: "Public status link" }) !== null).toBe(enabled);
    await user.click(toggle);
    await act(async () => {
      finish?.(
        jsonResponse(200, {
          settings: { ...statusSettings, enabled: !enabled },
          public_id: statusPublicId,
          public_url: publicUrl,
          access_mode: "manage"
        })
      );
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute("aria-checked", String(!enabled));
    expect(screen.queryByText("Could not update public page visibility. Try again.")).toBeNull();
    expect(title).toHaveValue("Unsaved title");
  }
);

it.each([false, true])(
  "shows the link while enabling (existing URL: %s) and creates or reuses it without a separate save",
  async (existingUrl) => {
    const user = userEvent.setup();
    const fetchMock = setup();
    const originalFetch = fetchMock.getMockImplementation()!;
    let finish: ((response: Response) => void) | undefined;
    let written: typeof statusSettings | undefined;
    fetchMock.mockImplementation(async (url, init) => {
      if (requestUrl(url).includes("/options")) return originalFetch(url, init);
      if (init?.method === "PUT") {
        written = JSON.parse(init.body as string);
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      return jsonResponse(200, {
        settings: { ...statusSettings, enabled: false },
        public_id: existingUrl ? statusPublicId : null,
        public_url: existingUrl ? publicUrl : null,
        access_mode: "manage"
      });
    });
    await user.click(screen.getByRole("button", { name: "Public status page" }));
    const toggle = await screen.findByRole("switch", { name: "Enable public page" });
    fireEvent.change(screen.getByLabelText("Page status title"), {
      target: { value: "New title" }
    });
    expect(screen.queryByRole("textbox", { name: "Public status link" })).toBeNull();
    await user.click(toggle);
    const link = screen.getByRole("textbox", { name: "Public status link" });
    expect(link).toHaveAttribute("readonly");
    expect(link).toHaveValue(existingUrl ? publicUrl : "");
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription("Saving visibility…");
    expect(written).toEqual({
      ...statusSettings,
      title: existingUrl ? statusSettings.title : "New title"
    });
    const copy = screen.getByRole("button", { name: "Copy link" });
    if (existingUrl) expect(copy).toBeEnabled();
    else {
      expect(link).toHaveAttribute("placeholder", "Creating your public link…");
      expect(copy).toBeDisabled();
      expect(screen.getByRole("button", { name: "Preview status page" })).toBeDisabled();
    }
    expect(screen.queryByRole("link", { name: "Open status page" })).toBeNull();
    expect(finish).toBeTypeOf("function");
    await act(async () => {
      finish?.(jsonResponse(503, {}));
    });
    await screen.findByText("Could not update public page visibility. Try again.");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("textbox", { name: "Public status link" })).toBeNull();
    expect(screen.getByLabelText("Page status title")).toHaveValue("New title");
    expect(screen.queryByRole("link", { name: "Open status page" })).toBeNull();
    await user.click(toggle);
    await act(async () => {
      finish?.(
        jsonResponse(200, {
          settings: written,
          public_id: statusPublicId,
          public_url: publicUrl,
          access_mode: "manage"
        })
      );
    });
    expect(await screen.findByRole("link", { name: "Open status page" })).toHaveAttribute(
      "href",
      publicUrl
    );
    expect(screen.getByRole("textbox", { name: "Public status link" })).toHaveValue(publicUrl);
    expect(screen.getByRole("textbox", { name: "Public status link" })).not.toHaveAttribute(
      "aria-describedby"
    );
    expect(screen.getByRole("button", { name: "Copy link" })).toBeEnabled();
    await user.click(toggle);
    expect(screen.getByRole("textbox", { name: "Public status link" })).toHaveValue(publicUrl);
    expect(written?.enabled).toBe(false);
    await act(async () => {
      finish?.(
        jsonResponse(200, {
          settings: written,
          public_id: statusPublicId,
          public_url: publicUrl,
          access_mode: "manage"
        })
      );
    });
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Public status link" })).toBeNull()
    );
  }
);

it.each([1, 2, 0])(
  "opens a preview with %s checks without opening a tooltip, preserving keyboard navigation and focus return",
  async (checkCount) => {
    const user = userEvent.setup();
    const page = statusPageFixture();
    page.projects[0]!.checks = page.projects[0]!.checks.slice(0, checkCount);
    if (checkCount === 0) page.projects = [];
    setup(page);
    await user.click(screen.getByRole("button", { name: "Public status page" }));
    await user.click(await screen.findByRole("button", { name: /^Preview .* page$/ }));
    const preview = await screen.findByRole("dialog", { name: page.title });
    await waitFor(() =>
      expect(within(preview).getByRole("heading", { name: page.title })).toHaveFocus()
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.tab();
    if (checkCount === 1) {
      const day = within(preview).getAllByRole("button")[0]!;
      expect(day).toHaveFocus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent(day.getAttribute("aria-label")!);
      await user.tab();
      const nextDay = within(preview).getAllByRole("button")[1]!;
      expect(nextDay).toHaveFocus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        nextDay.getAttribute("aria-label")!
      );
    } else {
      expect(
        within(preview).getByRole("button", {
          name: checkCount === 0 ? "Close" : "Expand Frontend checks"
        })
      ).toHaveFocus();
    }
    await user.click(within(preview).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Preview .* page$/ })).toHaveFocus()
    );
    expect(screen.getByRole("dialog", { name: "Public status page" })).toBeInTheDocument();
  }
);

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
  await user.click(screen.getByRole("button", { name: "Preview status page" }));
  const preview = await screen.findByRole("dialog", { name: "Product status" });
  await user.click(within(preview).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Product status" })).toBeNull());
  expect(screen.getByRole("dialog", { name: "Public status page" })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Preview status page" })).toHaveFocus()
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
  fireEvent.click(await screen.findByRole("button", { name: "Preview status page" }));
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

it.each([
  ["save", 200],
  ["save", 500],
  ["toggle", 200],
  ["toggle", 500]
] as const)(
  "ignores a %s response (%s) after closing without affecting the reopened modal",
  async (action, status) => {
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
    fireEvent.click(
      action === "save" ? saveButton : screen.getByRole("switch", { name: "Enable public page" })
    );
    expect(screen.getByRole("switch", { name: "Enable public page" })).toBeDisabled();
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
    expect(
      screen.queryByText(/Could not (save status settings|update public page visibility)/)
    ).toBeNull();
    expect(screen.getByLabelText("Page status title")).toHaveValue(statusSettings.title);
  }
);
