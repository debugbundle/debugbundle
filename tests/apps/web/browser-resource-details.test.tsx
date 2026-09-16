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
});
