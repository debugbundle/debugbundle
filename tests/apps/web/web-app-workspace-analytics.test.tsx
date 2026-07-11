// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OPPORTUNITY_ID = "22222222-2222-4222-8222-222222222222";
const GENERATION_ID = "33333333-3333-4333-8333-333333333333";

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionName: string
): Promise<void> {
  const trigger = screen.getByLabelText(label);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: optionName }));
}

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
}

function installWorkspaceAnalyticsFetch(input: {
  empty?: boolean;
  failOpportunitiesOnce?: boolean;
} = {}): { requestedUrls: () => string[] } {
  const requestedUrls: string[] = [];
  let opportunityRequests = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(request);
      requestedUrls.push(url);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject({
              project_id: PROJECT_ID,
              name: "Main App",
              organization_plan: "team"
            })
          ]
        });
      }

      if (url.includes("/v1/analytics/opportunities?")) {
        opportunityRequests += 1;
        if (input.failOpportunitiesOnce && opportunityRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          opportunities: input.empty
            ? []
            : [
                {
                  opportunity_id: OPPORTUNITY_ID,
                  project_id: PROJECT_ID,
                  project_name: "Main App",
                  project_color_tag: "blue",
                  service: "web",
                  environment: "production",
                  kind: "funnel_dropoff",
                  status: "open",
                  severity: "high",
                  confidence: 0.91,
                  title: "Checkout completion drops after shipping",
                  summary: "Sessions leave after the shipping step.",
                  evidence: {},
                  related_incident_ids: [],
                  related_deploy_ids: [],
                  first_detected_at: "2026-07-01T00:00:00.000Z",
                  last_detected_at: "2026-07-10T00:00:00.000Z",
                  resolved_at: null,
                  snoozed_until: null,
                  bundle_generation_id: GENERATION_ID,
                  bundle_status: "completed",
                  bundle_created_at: "2026-07-10T00:01:00.000Z",
                  bundle_updated_at: "2026-07-10T00:02:00.000Z",
                  bundle_failure_reason: null
                }
              ],
          next_cursor: url.includes("cursor=") || input.empty ? null : "next-opportunity"
        });
      }

      if (url.includes("/v1/analytics/bundles?")) {
        return jsonResponse(200, {
          bundles: input.empty
            ? []
            : [
                {
                  generation_id: GENERATION_ID,
                  project_id: PROJECT_ID,
                  project_name: "Main App",
                  project_color_tag: "blue",
                  opportunity_id: OPPORTUNITY_ID,
                  requested_by_user_id: null,
                  analysis_kind: "funnel_dropoff",
                  analysis_spec: {
                    from: "2026-07-01T00:00:00.000Z",
                    to: "2026-07-10T00:00:00.000Z",
                    filters: { service: "web", environment: "production" }
                  },
                  input_fingerprint:
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  status: "completed",
                  has_artifact: true,
                  failure_reason: null,
                  created_at: "2026-07-10T00:01:00.000Z",
                  claimed_at: "2026-07-10T00:01:10.000Z",
                  completed_at: "2026-07-10T00:02:00.000Z",
                  updated_at: "2026-07-10T00:02:00.000Z"
                }
              ],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    })
  );

  return { requestedUrls: () => requestedUrls };
}

describe("web app - workspace analytics", () => {
  it("places Analytics between Improvements and Projects and opens opportunities", async () => {
    const user = userEvent.setup();
    installWorkspaceAnalyticsFetch();

    render(<App initialEntries={["/projects"]} />);

    const improvementsLink = await screen.findByRole("link", { name: "Improvements" });
    const analyticsLink = screen.getByRole("link", { name: "Analytics" });
    const projectsLink = screen.getByRole("link", { name: "Projects" });
    expect(
      improvementsLink.compareDocumentPosition(analyticsLink) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      analyticsLink.compareDocumentPosition(projectsLink) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(analyticsLink).toHaveAttribute("href", "/analytics/workspace");

    await user.click(analyticsLink);
    expect(
      await screen.findByRole("heading", { name: "Analytics opportunities" })
    ).toBeInTheDocument();
    expect(screen.getByText("Checkout completion drops after shipping")).toBeInTheDocument();
  });

  it("applies complete opportunity filters and paginates through server cursors", async () => {
    const user = userEvent.setup();
    const state = installWorkspaceAnalyticsFetch();

    render(<App initialEntries={["/analytics/workspace"]} />);
    await screen.findByText("Checkout completion drops after shipping");

    await chooseSelectOption(user, "Project", "Main App");
    await user.type(screen.getByLabelText("Service"), "web");
    await user.type(screen.getByLabelText("Environment"), "production");
    await chooseSelectOption(user, "Severity", "High");
    await chooseSelectOption(user, "Bundle state", "Ready");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-07-31" } });
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(
        state.requestedUrls().some(
          (url) =>
            url.includes(`/v1/analytics/opportunities?project_id=${PROJECT_ID}`) &&
            url.includes("service=web") &&
            url.includes("environment=production") &&
            url.includes("severity=high") &&
            url.includes("bundle_status=completed") &&
            url.includes("from=2026-07-01T00%3A00%3A00.000Z") &&
            url.includes("to=2026-07-31T23%3A59%3A59.999Z")
        )
      ).toBe(true);
    });

    await user.click(await screen.findByRole("button", { name: "Go to next page" }));
    await waitFor(() => {
      expect(state.requestedUrls().some((url) => url.includes("cursor=next-opportunity"))).toBe(
        true
      );
    });
  });

  it("shows generated bundle state and complete bundle columns", async () => {
    const user = userEvent.setup();
    installWorkspaceAnalyticsFetch();

    render(<App initialEntries={["/analytics/workspace"]} />);
    const tabs = await screen.findByRole("tablist", { name: "Workspace analytics views" });
    await user.click(within(tabs).getByRole("tab", { name: "Bundles" }));

    const table = await screen.findByRole("table", { name: "AnalyticsBundles" });
    for (const heading of [
      "Analysis",
      "Project",
      "Service",
      "Environment",
      "State",
      "Related opportunity",
      "Created",
      "Completed"
    ]) {
      expect(within(table).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(within(table).getByText("Ready")).toBeInTheDocument();
    expect(within(table).getByText("Main App")).toBeInTheDocument();
  });

  it("retries failed opportunity reads and renders an explicit empty state", async () => {
    const user = userEvent.setup();
    installWorkspaceAnalyticsFetch({ failOpportunitiesOnce: true, empty: true });

    render(<App initialEntries={["/analytics/workspace"]} />);

    expect(await screen.findByText(/could not load analytics opportunities/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry analytics opportunities" }));
    expect(await screen.findByText(/no analytics opportunities match these filters/i)).toBeInTheDocument();
  });
});
