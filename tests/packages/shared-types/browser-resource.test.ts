import { describe, expect, it } from "vitest";
import {
  browserResourceDiagnosis,
  browserResourceLocation,
  describeBrowserResource
} from "../../../packages/shared-types/src/browser-resource.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

describe("browser resource evidence", () => {
  it.each([
    ["https://www.googletagmanager.com/gtm.js", "Google Tag Manager", "tag_manager"],
    ["https://connect.facebook.net/en_US/fbevents.js", "Meta Pixel", "advertising"],
    ["https://www.clarity.ms/tag/abc123", "Microsoft Clarity", "analytics"],
    ["https://accounts.google.com/gsi/client", "Google sign-in", "authentication"]
  ])("names %s without claiming a cause", (url, provider, role) => {
    const resource = describeBrowserResource(browserResourceEvent({ url }).payload.browser_event);
    expect(resource).toMatchObject({ provider, role, title: `${provider} script failed to load` });
    expect(browserResourceDiagnosis(resource)).toContain("does not identify the cause");
  });
  it("strips URL secrets while retaining distinct immutable filenames", () => {
    const resource = describeBrowserResource(
      browserResourceEvent({
        url: "https://user:password@app.example.com/assets/main-abcd.js?token=secret#private"
      }).payload.browser_event
    );
    expect(resource).toMatchObject({
      host: "app.example.com",
      path: "/assets/main-abcd.js",
      first_party: true,
      role: "application_asset"
    });
    expect(resource?.title).toBe("JavaScript asset failed to load: main-abcd.js (app.example.com)");
    expect(JSON.stringify(resource)).not.toMatch(/password|secret|private/);
  });
  it("resolves relative and protocol-relative targets only with the right origin", () => {
    expect(browserResourceLocation("/assets/a.js", "https://app.example.com/a")).toEqual({
      host: "app.example.com",
      path: "/assets/a.js",
      first_party: true
    });
    expect(
      browserResourceLocation("//cdn.example.com/a.js", "https://app.example.com/a")?.first_party
    ).toBe(false);
    expect(browserResourceLocation("//cdn.example.com/a.js", null)).toBeNull();
    expect(browserResourceLocation("https://app.example.com/a.js", null)?.first_party).toBeNull();
  });
  it.each([
    null,
    {},
    "text",
    { kind: "window_error" },
    { kind: "resource_error", target: { source_url: "data:private" } }
  ])("handles missing or unsupported evidence", (value) => {
    expect(describeBrowserResource(value)).toBeNull();
  });
});
