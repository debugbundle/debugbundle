import { describe, expect, it } from "vitest";

import { formatIncidentMatchedFields } from "../../../apps/web/src/lib/incident-copy.js";

describe("incident copy helpers", () => {
  it("returns a generic fallback when no grouping fields are available", () => {
    expect(formatIncidentMatchedFields([])).toBe("Grouping fields unavailable.");
  });

  it("returns the anomaly fallback when only the request anomaly marker is present", () => {
    expect(formatIncidentMatchedFields(["request_anomaly"])).toBe("Request anomaly threshold crossed.");
  });

  it("formats two known grouping fields with friendly labels", () => {
    expect(formatIncidentMatchedFields(["error_type", "request_path"])).toBe(
      "Grouped by error type and request path."
    );
  });

  it("formats a single grouping field without conjunctions", () => {
    expect(formatIncidentMatchedFields(["route_template"])).toBe("Grouped by route template.");
  });

  it("formats anomaly grouping fields with an Oxford comma and unknown field fallback", () => {
    expect(formatIncidentMatchedFields(["request_anomaly", "route_template", "http_method", "custom_field"])).toBe(
      "Request anomaly threshold crossed. Grouped by route template, HTTP method, and custom field."
    );
  });
});