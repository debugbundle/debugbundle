// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createBillingSummary,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import { createHealthCheck, createHealthRollup } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("billing management", () => {
  it("renders dashboard activity cards from project metrics instead of billing-cycle totals", async () => {
    function cardWithValueExists(label: string, value: RegExp): boolean {
      return screen.queryAllByText(value).some((element) => {
        const card = element.closest("[data-slot='card']");
        return card?.textContent?.includes(label) ?? false;
      });
    }

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject({
              project_id: "proj_123",
              name: "Main App",
              metrics: {
                open_incidents: 7,
                regressed_incidents: 1,
                attention_incidents_today: 2,
                opened_incidents_today: 2,
                opened_incidents_month: 9,
                monthly_bundle_requests: 14,
                monthly_raw_ingested_events: 44,
                retained_bundles: 11,
                monthly_alert_deliveries: 2
              }
            }),
            createProject({
              project_id: "proj_456",
              name: "Worker",
              slug: "worker",
              metrics: {
                open_incidents: 5,
                regressed_incidents: 2,
                attention_incidents_today: 1,
                opened_incidents_today: 1,
                opened_incidents_month: 6,
                monthly_bundle_requests: 8,
                monthly_raw_ingested_events: 6,
                retained_bundles: 3,
                monthly_alert_deliveries: 1
              }
            })
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/availability-checks?limit=100")) {
        return jsonResponse(200, {
          checks: [createHealthCheck({ project_id: "proj_123", status: "passing" })],
          limits: {
            max_checks_per_project: 3,
            max_monitored_projects_per_organization: 10,
            max_active_checks_per_organization: 30,
            min_interval_seconds: 60,
            recommended_failure_threshold: 3
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_456/availability-checks?limit=100")) {
        return jsonResponse(200, {
          checks: [
            createHealthCheck({ check_id: "chk_456", project_id: "proj_456", status: "failing" })
          ],
          limits: {
            max_checks_per_project: 3,
            max_monitored_projects_per_organization: 10,
            max_active_checks_per_organization: 30,
            min_interval_seconds: 60,
            recommended_failure_threshold: 3
          }
        });
      }

      if (
        url.endsWith("/v1/projects/proj_123/availability-checks/chk_123/daily-rollups?limit=30")
      ) {
        return jsonResponse(200, {
          rollups: [createHealthRollup({ check_id: "chk_123", project_id: "proj_123" })]
        });
      }

      if (
        url.endsWith("/v1/projects/proj_456/availability-checks/chk_456/daily-rollups?limit=30")
      ) {
        return jsonResponse(200, {
          rollups: [
            createHealthRollup({
              check_id: "chk_456",
              project_id: "proj_456",
              state: "degraded",
              successful_checks: 1249,
              failed_checks: 1,
              degraded_checks: 1,
              downtime_seconds: 60
            })
          ]
        });
      }

      if (url.includes("/v1/incidents?") && url.includes("first_seen_after=")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            allowances: {
              monthly_bundle_requests: {
                used: 999,
                limit: 1000
              },
              monthly_raw_ingested_events: {
                used: 999,
                limit: 1000
              },
              retained_bundle_cap: {
                used: 999,
                limit: 1000
              },
              monthly_remote_activations: {
                used: 0,
                limit: 0
              },
              monthly_alert_deliveries: {
                used: 999,
                limit: 1000
              },
              monthly_webhook_deliveries: {
                used: 999,
                limit: 1000
              }
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    await waitFor(() => {
      expect(cardWithValueExists("Active incidents", /^15$/)).toBe(true);
      expect(cardWithValueExists("Incidents today", /^3$/)).toBe(true);
      expect(cardWithValueExists("Health status today", /^99\.96%$/)).toBe(true);
      expect(cardWithValueExists("Regressed incidents", /^3$/)).toBe(true);
    });

    expect(
      screen.getByText(/open or regressed incidents across all projects/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/opened or regressed today across all projects/i)).toBeInTheDocument();
    expect(screen.getByText(/1 check failing across all projects/i)).toBeInTheDocument();
    expect(
      screen.getByText(/current regressed incidents across all projects/i)
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/billing"))).toBe(
      false
    );
  });

  it("shows the owner gate on the billing surface without blocking unverified owners", async () => {
    const ownerFetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ email_verified_at: null })
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            active_projects: 1,
            capacity_units: {
              total: 3,
              included: 3,
              additional_purchased: 0,
              pending_reduction: null
            },
            allowances: {
              monthly_bundle_requests: {
                used: 180,
                limit: 750
              },
              monthly_raw_ingested_events: {
                used: 800,
                limit: 10500
              },
              retained_bundle_cap: {
                used: 40,
                limit: 450
              },
              monthly_remote_activations: {
                used: 3,
                limit: 75
              },
              monthly_alert_deliveries: {
                used: 10,
                limit: 225
              },
              monthly_webhook_deliveries: {
                used: 20,
                limit: 750
              }
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", ownerFetchMock);

    const ownerView = render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("button", { name: /manage subscription/i })).toBeEnabled();
    expect(
      screen.queryByText(/verify your email before enabling billing changes/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^solo$/i).className.includes("border-border")).toBe(true);
    expect(screen.getByText(/^solo$/i).className.includes("text-primary")).toBe(false);
    ownerView.unmount();

    const memberFetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", memberFetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(
      await screen.findByText(/owner permissions are required to manage billing/i)
    ).toBeInTheDocument();
  });

  it("shows an error toast when opening the billing portal fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            capacity_units: {
              total: 3,
              included: 3,
              additional_purchased: 0,
              pending_reduction: null
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/portal") && init?.method === "POST") {
        return jsonResponse(500, { error: "portal_unavailable" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    await screen.findByRole("heading", { name: /billing/i, level: 1 });
    await user.click(await screen.findByRole("button", { name: /manage subscription/i }));

    expect(
      await screen.findByText(/subscription management is unavailable right now/i)
    ).toBeInTheDocument();
  });
});
