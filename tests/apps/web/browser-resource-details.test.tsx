// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrowserResourceDetails } from "../../../apps/web/src/components/system/browser-resource-details.js";

describe("browser resource details", () => {
  it("explains the evidence and labels partial route coverage", () => {
    render(
      <BrowserResourceDetails
        resource={{
          version: 1,
          host: "www.googletagmanager.com",
          path: "/gtm.js",
          type: "script",
          first_party: false,
          role: "tag_manager",
          provider: "Google Tag Manager",
          title: "Google Tag Manager script failed to load",
          optional_candidate: true,
          diagnosis: "Possibly blocked by privacy tools; cause unconfirmed.",
          routes: {
            items: [{ route: "/dashboard", occurrences: 2 }],
            recorded_occurrences: 2,
            unattributed_occurrences: 8,
            omitted_routes: 1,
            coverage: "retained_samples"
          }
        }}
      />
    );
    expect(screen.getByText("www.googletagmanager.com/gtm.js")).toBeInTheDocument();
    expect(screen.getByText(/Possibly blocked by privacy tools/)).toBeInTheDocument();
    expect(screen.getByText(/8 occurrences have no recorded route/)).toBeInTheDocument();
    expect(screen.getByText(/1 additional route/)).toBeInTheDocument();
    expect(screen.getByText(/retained samples/i)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Affected route" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "/dashboard" })).toBeInTheDocument();
  });

  it("surfaces passive CSP, resource timing status, and explicit recovery badges when provided", () => {
    render(
      <BrowserResourceDetails
        resource={{
          version: 1,
          host: "cdn.example.com",
          path: "/assets/app.js",
          type: "script",
          first_party: false,
          role: "unknown",
          provider: null,
          title: "app.js script failed to load",
          optional_candidate: false,
          diagnosis: "Browser resource failed to load; cause unconfirmed.",
          routes: {
            items: [{ route: "/checkout", occurrences: 1 }],
            recorded_occurrences: 1,
            unattributed_occurrences: 0,
            omitted_routes: 0,
            coverage: "occurrence_metadata"
          }
        }}
        evidence={{
          version: 1,
          status: "observed",
          primary_event_id: "evt_1",
          captured_at: "2026-11-24T10:00:00.000Z",
          generated_at: "2026-11-24T10:00:01.000Z",
          retained_event_count: 2,
          retained_first_at: "2026-11-24T10:00:00.000Z",
          retained_last_at: "2026-11-24T10:00:01.000Z",
          exception: null,
          recovery: "recovered",
          passive: {
            timing_count: 1,
            unavailable_status_count: 0,
            enforced_csp_count: 1,
            report_only_csp_count: 1,
            observed_statuses: [403]
          },
          facts: [],
          possible_causes: [
            "An enforced CSP observation may explain a resource failure; temporal association does not prove causation."
          ],
          importance: "Primary occurrence evidence.",
          next_evidence: []
        }}
      />
    );

    expect(screen.getByText("Enforced CSP observed")).toBeInTheDocument();
    expect(screen.getByText("Report-only CSP (non-blocking)")).toBeInTheDocument();
    expect(screen.getByText("Timing HTTP 403")).toBeInTheDocument();
    expect(screen.getByText("Recovery: recovered")).toBeInTheDocument();
    expect(screen.getByText(/enforced CSP observation may explain/i)).toBeInTheDocument();
  });
});
