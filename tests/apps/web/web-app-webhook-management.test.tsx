// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createProject,
  createSession,
  createWebhook,
  createWebhookDelivery,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import { chooseSelectOption, addCustomScopeValues } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("webhook management", () => {
  it("shows project webhooks with recent delivery status and triggers a synthetic test delivery", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          webhooks: [createWebhook()]
        });
      }

      if (
        url.endsWith("/v1/webhooks/wh_123/deliveries?project_id=proj_123&limit=5") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          deliveries: [createWebhookDelivery()]
        });
      }

      if (url.endsWith("/v1/webhooks/wh_123/test?project_id=proj_123") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ event_type: "verification.passed" }));

        return jsonResponse(202, {
          delivery: createWebhookDelivery({
            delivery_id: "del_456",
            status: "pending",
            last_response_code: null,
            last_attempted_at: null
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);

    // Wait for webhook content to load
    await screen.findByRole("button", { name: /send test webhook/i });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          requestUrl(input).includes("/v1/webhooks/wh_123/deliveries?project_id=proj_123&limit=5")
        )
      ).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: /send test webhook/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/webhooks/wh_123/test?project_id=proj_123") &&
            init?.method === "POST"
        )
      ).toBe(true);
    });
  });

  it("creates a project webhook and reveals the signing secret once", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          webhooks: []
        });
      }

      if (url.endsWith("/v1/webhooks") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(
          JSON.stringify({
            project_id: "proj_123",
            url: "https://hooks.example.test/created",
            events: ["bundle.created"],
            filters: {},
            is_enabled: true
          })
        );

        return jsonResponse(201, {
          webhook: createWebhook({
            webhook_id: "wh_456",
            url: "https://hooks.example.test/created",
            signing_secret: "dbundle_whsec_secret_123"
          })
        });
      }

      if (url.endsWith("/v1/webhooks/wh_456/deliveries?limit=5") && init?.method === undefined) {
        return jsonResponse(200, {
          deliveries: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);

    await user.click(await screen.findByRole("button", { name: /create webhook/i }));
    await user.type(
      await screen.findByLabelText(/endpoint url/i),
      "https://hooks.example.test/created"
    );
    await user.click(screen.getByRole("button", { name: /^create webhook$/i }));

    const revealRegion = await screen.findByRole("region", { name: /new webhook signing secret/i });
    expect(within(revealRegion).getByText(/dbundle_whsec_secret_123/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/hooks\.example\.test\/created/i)).toBeInTheDocument();
    });
  });

  it("creates a project webhook with expanded event options and delivery filters", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          webhooks: []
        });
      }

      if (url.endsWith("/v1/webhooks") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(
          JSON.stringify({
            project_id: "proj_123",
            url: "https://hooks.example.test/filtered",
            events: ["bundle.created", "bundle.reopened"],
            filters: {
              environment: ["production", "staging"],
              service: ["checkout-api", "worker"],
              severity_min: "high",
              bundle_type: ["failure"],
              verification: false
            },
            is_enabled: true
          })
        );

        return jsonResponse(201, {
          webhook: createWebhook({
            webhook_id: "wh_789",
            url: "https://hooks.example.test/filtered",
            events: ["bundle.created", "bundle.reopened"],
            filters: {
              environment: ["production", "staging"],
              service: ["checkout-api", "worker"],
              severity_min: "high",
              bundle_type: ["failure"],
              verification: false
            },
            signing_secret: "dbundle_whsec_secret_789"
          })
        });
      }

      if (url.endsWith("/v1/webhooks/wh_789/deliveries?limit=5") && init?.method === undefined) {
        return jsonResponse(200, {
          deliveries: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);

    await user.click(await screen.findByRole("button", { name: /create webhook/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(/bundle\.reopened/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/bundle\.resolved/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/verification\.passed/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/improvement_bundle\.created/i)).toBeInTheDocument();

    await user.type(
      await screen.findByLabelText(/endpoint url/i),
      "https://hooks.example.test/filtered"
    );
    await user.click(screen.getByLabelText(/bundle\.reopened/i));
    await addCustomScopeValues(user, "Environments", ["production", "staging"]);
    await addCustomScopeValues(user, "Services", ["checkout-api", "worker"]);
    await chooseSelectOption(user, /minimum severity/i, /^high$/i);
    await chooseSelectOption(user, /verification scope/i, /non-verification events only/i);
    await user.click(screen.getByLabelText(/failure bundles/i));
    await user.click(screen.getByRole("button", { name: /^create webhook$/i }));

    await waitFor(() => {
      expect(screen.getByText(/hooks\.example\.test\/filtered/i)).toBeInTheDocument();
    });
  });

  it("shows webhook empty states for endpoints and deliveries", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          webhooks: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);

    expect(await screen.findByText(/no webhook endpoints yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/create a webhook to send lifecycle, verification, or automation events/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/no delivery attempts yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/send a test webhook to create the first delivery record/i)
    ).toBeInTheDocument();
  });

  it("renders the billing page when the billing payload omits webhook delivery usage", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: {
            plan: "free",
            stripe_customer_id: null,
            active_projects: 1,
            capacity_units: {
              total: 1,
              included: 1,
              additional_purchased: 0,
              pending_reduction: null
            },
            usage_window: {
              starts_at: "2026-03-01T00:00:00.000Z",
              ends_at: "2026-04-01T00:00:00.000Z"
            },
            allowances: {
              monthly_bundle_requests: {
                used: 12,
                limit: 100
              },
              monthly_raw_ingested_events: {
                used: 120,
                limit: 750
              },
              retained_bundle_cap: {
                used: 6,
                limit: 50
              },
              monthly_remote_activations: {
                used: 0,
                limit: 0
              },
              monthly_alert_deliveries: {
                used: 4,
                limit: 25
              }
            }
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/^Webhook deliveries$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/lifecycle webhook deliveries created this month\./i)
    ).toBeInTheDocument();
  });
});
