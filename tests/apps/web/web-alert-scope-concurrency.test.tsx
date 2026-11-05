// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createAlert, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { globalScope, mockScopedAlerts } from "./helpers/alert-scopes.js";

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function pendingInventory(refresh: "succeeds" | "fails") {
  const existing = createAlert({
    alert_id: "existing",
    config: { to: "existing@example.test" },
    scope: globalScope()
  });
  const created = createAlert({ alert_id: "created", config: { to: "created@example.test" } });
  const initial = deferredResponse();
  const fallback = mockScopedAlerts([]).fetchMock;
  let reads = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(requestUrl(input), "http://localhost");
    if (url.pathname === "/v1/alerts") {
      if (init?.method === "POST") return jsonResponse(201, { alert: created });
      reads += 1;
      if (reads === 1) return initial.promise;
      return refresh === "succeeds"
        ? jsonResponse(200, { alerts: [existing, { ...created, scope: globalScope() }] })
        : jsonResponse(503, { error: "unavailable" });
    }
    if (url.pathname.startsWith("/v1/alerts/") && init?.method === "DELETE")
      return jsonResponse(200, { deleted: true });
    return fallback(input, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { initial, existing, created, fetchMock };
}

async function createWhileLoading() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Create alert rule" }));
  const dialog = screen.getByRole("dialog", { name: "Create alert rule" });
  const recipient = within(dialog).getByLabelText(/recipient email/i);
  await user.clear(recipient);
  await user.type(recipient, "created@example.test");
  await user.click(within(dialog).getByRole("button", { name: "Create alert rule" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  return user;
}

it("loads existing rules when a create completes before the initial list, without losing the new rule", async () => {
  const { initial, existing } = pendingInventory("succeeds");
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await createWhileLoading();
  expect(await screen.findByRole("row", { name: /existing@example.test/ })).toBeVisible();
  expect(screen.getByRole("row", { name: /created@example.test/ })).toBeVisible();
  await act(async () => initial.resolve(jsonResponse(200, { alerts: [existing] })));
  expect(screen.getByRole("row", { name: /created@example.test/ })).toBeVisible();
  expect(screen.getAllByRole("row")).toHaveLength(3);
});

it("uses the initial list after a failed scope refresh and preserves the accepted creation", async () => {
  const { initial, existing, fetchMock } = pendingInventory("fails");
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await createWhileLoading();
  await act(async () => initial.resolve(jsonResponse(200, { alerts: [existing] })));
  expect(await screen.findByRole("row", { name: /existing@example.test/ })).toBeVisible();
  expect(screen.getByRole("row", { name: /created@example.test/ })).toBeVisible();
  expect(screen.queryByText("Could not create alert rule.")).toBeNull();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it("does not restore a confirmed deletion from an older initial list", async () => {
  const { initial, existing, created } = pendingInventory("fails");
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  const user = await createWhileLoading();
  const row = await screen.findByRole("row", { name: /created@example.test/ });
  await user.click(within(row).getByRole("button", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Delete alert" }));
  await waitFor(() =>
    expect(screen.queryByRole("row", { name: /created@example.test/ })).toBeNull()
  );
  await act(async () => initial.resolve(jsonResponse(200, { alerts: [existing, created] })));
  expect(await screen.findByRole("row", { name: /existing@example.test/ })).toBeVisible();
  expect(screen.queryByRole("row", { name: /created@example.test/ })).toBeNull();
});

it("keeps an incomplete-list error visible alongside a confirmed creation when both reads fail", async () => {
  const { initial } = pendingInventory("fails");
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await act(async () => initial.resolve(jsonResponse(503, { error: "unavailable" })));
  await screen.findByText("Could not load alert rules.");
  await createWhileLoading();
  expect(screen.getByText("Could not load alert rules.")).toBeVisible();
  expect(screen.getByRole("row", { name: /created@example.test/ })).toBeVisible();
  expect(screen.queryByText("Could not create alert rule.")).toBeNull();
});

it("uses the current list limit when a save finishes after the dialog is closed and the limit changes", async () => {
  const save = deferredResponse();
  const largerList = deferredResponse();
  const existing = createAlert({ alert_id: "existing", scope: globalScope() });
  const created = createAlert({ alert_id: "created", config: { to: "created@example.test" } });
  const fallback = mockScopedAlerts([existing]).fetchMock;
  const limits: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(requestUrl(input), "http://localhost");
      if (url.pathname === "/v1/alerts") {
        if (init?.method === "POST") return save.promise;
        limits.push(url.searchParams.get("limit")!);
        if (limits.length === 2) return largerList.promise;
        return jsonResponse(200, { alerts: [existing] });
      }
      return fallback(input, init);
    })
  );
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await screen.findByRole("button", { name: "Edit" });
  await user.click(screen.getByRole("button", { name: "Create alert rule" }));
  const dialog = screen.getByRole("dialog");
  await user.clear(within(dialog).getByLabelText(/recipient email/i));
  await user.type(within(dialog).getByLabelText(/recipient email/i), "created@example.test");
  await user.click(within(dialog).getByRole("button", { name: "Create alert rule" }));
  await within(dialog).findByRole("button", { name: "Saving..." });
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await user.clear(screen.getByLabelText("Alert rule limit"));
  await user.type(screen.getByLabelText("Alert rule limit"), "50");
  await user.click(screen.getByRole("button", { name: "Apply alert rule limit" }));
  await waitFor(() => expect(limits).toEqual(["20", "50"]));
  await act(async () => save.resolve(jsonResponse(201, { alert: created })));
  await waitFor(() => expect(limits).toEqual(["20", "50", "50"]));
  await act(async () => largerList.resolve(jsonResponse(200, { alerts: [existing] })));
  expect(screen.getByRole("row", { name: /created@example.test/ })).toBeVisible();
});
