import { expect, it } from "vitest";
import { analyticsOriginCoverageNote } from "../../../packages/mcp-core/src/analytics-origin-coverage.js";
const first = "10000000-0000-4000-8000-000000000001",
  second = "10000000-0000-4000-8000-000000000002";
const scope = (origins: unknown) => ({
  origin_project_ids: origins,
  unique_count_semantics: "sum_of_origin_scoped_counts"
});
it("describes scope without disclosing origin identifiers", () => {
  const text = analyticsOriginCoverageNote("get_route_metrics", {
    window: { origin_scope: scope([first, second]) }
  });
  expect(text).toContain("2 original project namespaces");
  expect(text).not.toContain(first);
  expect(
    analyticsOriginCoverageNote("get_usage_summary", { summary: { origin_scope: scope([first]) } })
  ).toContain("1 original project namespace.");
});
it.each([
  null,
  [],
  {},
  { window: null },
  { window: {} },
  { window: { origin_scope: [] } },
  { window: { origin_scope: scope([]) } },
  { window: { origin_scope: scope("bad") } },
  { window: { origin_scope: scope([first, first]) } },
  { window: { origin_scope: scope(["dbundle_proj_synthetic"]) } },
  { window: { origin_scope: { ...scope([first]), unique_count_semantics: "unknown" } } },
  { window: { origin_scope: scope(Array.from({ length: 1001 }, (_, i) => String(i))) } }
])("ignores unavailable or untrusted coverage metadata", (value) => {
  expect(analyticsOriginCoverageNote("get_route_metrics", value)).toBeUndefined();
});
it("does not append analytics claims to a different tool", () => {
  expect(
    analyticsOriginCoverageNote("get_incident", { window: { origin_scope: scope([first]) } })
  ).toBeUndefined();
});
