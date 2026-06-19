import { describe, expect, it } from "vitest";

import { getActiveIncidentCount } from "../../../apps/web/src/lib/project-metrics.js";
import type { ProjectRecord } from "../../../apps/web/src/lib/api.js";

describe("project metric helpers", () => {
  it("counts active incidents as open plus regressed", () => {
    expect(getActiveIncidentCount(buildMetrics({ open_incidents: 7, regressed_incidents: 3 }))).toBe(10);
  });
});

function buildMetrics(overrides: Partial<ProjectRecord["metrics"]>): ProjectRecord["metrics"] {
  return {
    open_incidents: 0,
    regressed_incidents: 0,
    attention_incidents_today: 0,
    opened_incidents_today: 0,
    opened_incidents_month: 0,
    monthly_bundle_requests: 0,
    monthly_raw_ingested_events: 0,
    retained_bundles: 0,
    monthly_alert_deliveries: 0,
    ...overrides
  };
}
