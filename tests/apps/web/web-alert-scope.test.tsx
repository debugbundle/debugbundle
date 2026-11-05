// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createAlert, requestUrl } from "./web-test-helpers.js";
import { chooseSelectOption, openSelect } from "./helpers/management-ui.js";
import {
  APP_DEFINITION,
  APP_PRODUCTION,
  APP_STAGING,
  SITE_DEFINITION,
  SITE_ORIGIN,
  appScope,
  globalScope,
  mockScopedAlerts
} from "./helpers/alert-scopes.js";

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

it("shows retained coverage separately from genuinely project-wide rules", async () => {
  const { fetchMock } = mockScopedAlerts([
    createAlert({ alert_id: "app", config: { to: "app@example.test" }, scope: appScope() }),
    createAlert({
      alert_id: "site",
      config: { to: "site@example.test" },
      scope: {
        origin_project_ids: [SITE_ORIGIN],
        covers_current_project: false,
        services: [{ service_definition_id: SITE_DEFINITION, name: "Site" }],
        service_count: 1,
        service_filter: null
      }
    }),
    createAlert({ alert_id: "global", config: { to: "global@example.test" }, scope: globalScope() })
  ]);
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await screen.findByRole("columnheader", { name: "Scope" });
  expect(
    within(screen.getByRole("row", { name: /app@example.test/ })).getByText("App")
  ).toBeVisible();
  expect(
    within(screen.getByRole("row", { name: /site@example.test/ })).getByText("Site")
  ).toBeVisible();
  expect(
    within(screen.getByRole("row", { name: /global@example.test/ })).getByText("All services")
  ).toBeVisible();
  expect(
    fetchMock.mock.calls.some(
      ([input]) =>
        new URL(requestUrl(input), "http://localhost").searchParams.get("include_scope") === "true"
    )
  ).toBe(true);
});

it("restricts editing choices to the accepted origin and preserves that boundary on save", async () => {
  const { writes } = mockScopedAlerts([createAlert({ scope: appScope() })]);
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  const dialog = screen.getByRole("dialog", { name: "Edit alert rule" });
  const trigger = within(dialog).getByLabelText("Service scope");
  await waitFor(() => expect(trigger).toBeEnabled());
  expect(document.getElementById(trigger.getAttribute("aria-describedby")!)).toHaveTextContent(
    "Rule scope: App"
  );
  await openSelect("Service scope");
  expect(screen.queryByRole("option", { name: "Site (production)" })).toBeNull();
  expect(screen.getByRole("option", { name: "All services in this scope" })).toBeVisible();
  await user.click(screen.getByRole("option", { name: "App (staging)" }));
  await user.click(within(dialog).getByRole("button", { name: /save changes/i }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({ service_id: APP_STAGING });
  expect(writes[0]).not.toHaveProperty("project_scope");
  expect(await screen.findByText("App (staging)")).toBeVisible();
});

it("shows a selected environment while keeping its broader allowed scope explicit", async () => {
  const { writes } = mockScopedAlerts([
    createAlert({
      service_id: APP_PRODUCTION,
      scope: {
        ...globalScope(),
        service_filter: {
          service_id: APP_PRODUCTION,
          service_definition_id: APP_DEFINITION,
          name: "App",
          environment: "production"
        }
      }
    })
  ]);
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  expect(await screen.findByText("App (production)")).toBeVisible();
  await user.click(screen.getByRole("button", { name: /^edit$/i }));
  const dialog = screen.getByRole("dialog", { name: "Edit alert rule" });
  const trigger = within(dialog).getByLabelText("Service scope");
  await waitFor(() => expect(trigger).toBeEnabled());
  expect(document.getElementById(trigger.getAttribute("aria-describedby")!)).toHaveTextContent(
    "Rule scope: All services"
  );
  await chooseSelectOption(user, "Service scope", "All services");
  await user.click(within(dialog).getByRole("button", { name: /save changes/i }));
  await waitFor(() => expect(writes[0]).toMatchObject({ service_id: null }));
  expect(writes[0]).not.toHaveProperty("project_scope");
});

it("preserves unknown legacy filters and confirmed saves when scope refresh fails", async () => {
  const { writes, fetchMock } = mockScopedAlerts(
    [createAlert({ service_id: APP_PRODUCTION, config: { to: "owner@example.test" } })],
    { legacy: true, failRefresh: true }
  );
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  expect(await screen.findByText("Scope unavailable")).toBeVisible();
  await user.click(screen.getByRole("button", { name: /^edit$/i }));
  const dialog = screen.getByRole("dialog", { name: "Edit alert rule" });
  expect(within(dialog).getByLabelText("Service scope")).toBeDisabled();
  await user.clear(within(dialog).getByLabelText(/recipient email/i));
  await user.type(within(dialog).getByLabelText(/recipient email/i), "changed@example.test");
  await user.click(within(dialog).getByRole("button", { name: /save changes/i }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).not.toHaveProperty("service_id");
  expect(writes[0]).not.toHaveProperty("project_scope");
  expect(await screen.findByText("Email - changed@example.test")).toBeVisible();
  expect(screen.queryByText("Could not update alert rule.")).toBeNull();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
});

it("preserves a known filter if service inventory fails while other fields are edited", async () => {
  const { writes } = mockScopedAlerts(
    [
      createAlert({
        service_id: APP_PRODUCTION,
        scope: {
          ...appScope(),
          service_filter: {
            service_id: APP_PRODUCTION,
            service_definition_id: APP_DEFINITION,
            name: "App",
            environment: "production"
          }
        }
      })
    ],
    { failServices: true }
  );
  const user = userEvent.setup();
  render(<App initialEntries={["/projects/proj_123/alerts"]} />);
  await user.click(await screen.findByRole("button", { name: /^edit$/i }));
  const dialog = screen.getByRole("dialog", { name: "Edit alert rule" });
  await within(dialog).findByText("Could not load services. The current scope is preserved.");
  expect(within(dialog).getByLabelText("Service scope")).toBeDisabled();
  expect(within(dialog).getByLabelText("Service scope")).toHaveTextContent("App (production)");
  await user.click(within(dialog).getByRole("switch", { name: "Enabled" }));
  await user.click(within(dialog).getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(writes[0]).toMatchObject({ service_id: APP_PRODUCTION, is_enabled: false })
  );
  expect(writes[0]).not.toHaveProperty("project_scope");
});

it.each(["failed", "stale"] as const)(
  "drops previous scope after a confirmed save when the refresh is %s",
  async (refresh) => {
    const { writes, fetchMock } = mockScopedAlerts([createAlert({ scope: globalScope() })], {
      failRefresh: refresh === "failed",
      staleRefresh: refresh === "stale"
    });
    const user = userEvent.setup();
    render(<App initialEntries={["/projects/proj_123/alerts"]} />);
    await user.click(await screen.findByRole("button", { name: /^edit$/i }));
    const dialog = screen.getByRole("dialog", { name: "Edit alert rule" });
    const trigger = within(dialog).getByLabelText("Service scope");
    await waitFor(() => expect(trigger).toBeEnabled());
    await chooseSelectOption(user, "Service scope", "App (staging)");
    await user.clear(within(dialog).getByLabelText(/recipient email/i));
    await user.type(within(dialog).getByLabelText(/recipient email/i), "saved@example.test");
    await user.click(within(dialog).getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(writes[0]).toMatchObject({ service_id: APP_STAGING });
    const row = screen.getByRole("row", { name: /saved@example.test/ });
    expect(within(row).getByText("Scope unavailable")).toBeVisible();
    expect(within(row).queryByText("All services")).toBeNull();
    expect(screen.queryByText("Could not update alert rule.")).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  }
);
