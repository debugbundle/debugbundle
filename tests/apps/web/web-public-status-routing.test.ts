import { expect, it } from "vitest";
import {
  isPublicStatusLocation,
  resolvePublicStatusRoute
} from "../../../apps/web/src/lib/public-status-routing.js";
import {
  parsePublicStatusBaseUrl,
  PublicStatusSettingsSchema
} from "../../../packages/shared-types/src/public-status.js";
import { statusCheckId, statusProjectId, statusSettings } from "../../helpers/public-status.ts";
it("keeps normal app routing and restricts only a configured root status origin", () => {
  expect(resolvePublicStatusRoute(undefined, "https://app.example.com")).toEqual({
    path: "/status/:publicId",
    dedicated: false
  });
  expect(
    resolvePublicStatusRoute("https://status.example.com", "https://app.example.com").dedicated
  ).toBe(false);
  expect(
    resolvePublicStatusRoute("https://status.example.com", "https://status.example.com")
  ).toEqual({ path: "/:publicId", dedicated: true });
  expect(
    resolvePublicStatusRoute("https://app.example.com/service-status/", "https://app.example.com")
  ).toEqual({ path: "/service-status/:publicId", dedicated: false });
  expect(
    isPublicStatusLocation(undefined, {
      origin: "https://app.example.com",
      pathname: "/status/abc"
    })
  ).toBe(true);
  expect(
    isPublicStatusLocation(undefined, { origin: "https://app.example.com", pathname: "/dashboard" })
  ).toBe(false);
  expect(
    isPublicStatusLocation("https://status.example.com", {
      origin: "https://status.example.com",
      pathname: "/login"
    })
  ).toBe(true);
});
it("rejects credential-bearing, ambiguous and non-http publication bases", () => {
  for (const base of [
    "javascript:alert(1)",
    "https://user:pass@example.com",
    "https://example.com?secret=x",
    "https://example.com/#foo",
    "https://example.com/*"
  ])
    expect(() => parsePublicStatusBaseUrl(base)).toThrow();
  expect(parsePublicStatusBaseUrl("http://localhost:5291/status").pathname).toBe("/status");
});
it("rejects duplicate selections and publication limits at the shared boundary", () => {
  const duplicate = {
    ...statusSettings,
    projects: [
      ...statusSettings.projects,
      { project_id: "00000000-0000-4000-8000-000000000002", check_ids: [statusCheckId] }
    ]
  };
  expect(PublicStatusSettingsSchema.safeParse(duplicate).success).toBe(false);
  expect(
    PublicStatusSettingsSchema.safeParse({
      ...statusSettings,
      title: " ",
      projects: [{ project_id: statusProjectId, check_ids: [] }]
    }).success
  ).toBe(false);
  expect(
    PublicStatusSettingsSchema.safeParse({ ...statusSettings, private_data: "secret" }).success
  ).toBe(false);
  expect(
    PublicStatusSettingsSchema.safeParse({
      ...statusSettings,
      projects: Array.from({ length: 51 }, () => statusSettings.projects[0])
    }).success
  ).toBe(false);
});
