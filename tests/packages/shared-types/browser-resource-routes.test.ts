import { describe, expect, it } from "vitest";
import {
  normalizeResourceRoute,
  summarizeResourceRoutes
} from "../../../packages/shared-types/src/browser-resource-routes.js";

describe("retained browser resource routes", () => {
  it.each([
    ["/dashboard?token=private#secret", "/dashboard"],
    ["/e/aBcdEF12gh34IJ56", "/e/{param}"],
    ["/users/person%40example.com", "/users/{param}"],
    ["/users/123", "/users/{param}"],
    ["/e/550e8400-e29b-41d4-a716-446655440000", "/e/{param}"],
    ["/users/:id", "/users/{param}"],
    ["/auth/google/callback", "/auth/google/callback"],
    ["/bad/%ZZ", "/bad/{param}"],
    ["//other.example/private", null],
    ["https://example.com", null]
  ])("sanitizes %s", (route, expected) => {
    expect(normalizeResourceRoute(route)).toBe(expected);
  });
  it("bounds route summaries without presenting samples as complete coverage", () => {
    const routes = Array.from(
      { length: 22 },
      (_, index) => `/page-${String.fromCharCode(97 + index)}`
    );
    const summary = summarizeResourceRoutes([...routes, "/page-a"], 100);
    expect(summary.items).toHaveLength(20);
    expect(summary.items[0]).toEqual({ route: "/page-a", occurrences: 2 });
    expect(summary).toMatchObject({
      recorded_occurrences: 23,
      unattributed_occurrences: 77,
      omitted_routes: 2,
      coverage: "retained_samples"
    });
    expect(summarizeResourceRoutes([...routes, "/page-a"].reverse(), 100)).toEqual(summary);
  });
});
