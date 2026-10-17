import { describe, expect, it } from "vitest";
import {
  browserResourceDiagnosis,
  browserResourceLocation,
  describeBrowserResource
} from "../../../packages/shared-types/src/browser-resource.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";
import { buildBrowserResourceSuggestions } from "../../../packages/shared-types/src/browser-resource-suggestions.js";
import { CaptureRuleSuggestionSchema } from "../../../packages/shared-types/src/capture-rule-suggestions.js";

describe("browser resource evidence", () => {
  it.each([
    ["https://www.googletagmanager.com/gtm.js", "Google Tag Manager", "tag_manager"],
    ["https://connect.facebook.net/en_US/fbevents.js", "Meta Pixel", "advertising"],
    ["https://www.clarity.ms/tag/abc123", "Microsoft Clarity", "analytics"],
    [
      "https://www.googletagmanager.com/gtag/js?id=G-test",
      "Google tag (Analytics / Ads)",
      "analytics"
    ],
    ["https://www.google-analytics.com/analytics.js", "Google Analytics", "analytics"],
    ["https://ssl.google-analytics.com/ga.js", "Google Analytics", "analytics"],
    ["https://static.hotjar.com/c/hotjar-12345.js?sv=6", "Hotjar", "analytics"],
    [
      "https://static.cloudflareinsights.com/beacon.min.js",
      "Cloudflare Web Analytics",
      "analytics"
    ],
    ["https://mc.yandex.ru/metrika/tag.js", "Yandex Metrica", "analytics"],
    ["https://mc.yandex.com/metrika/tag.js", "Yandex Metrica", "analytics"],
    ["https://stats.wp.com/e-202642.js", "WordPress.com / Jetpack Stats", "analytics"],
    ["https://bat.bing.com/bat.js", "Microsoft Advertising UET", "advertising"],
    ["https://snap.licdn.com/li.lms-analytics/insight.min.js", "LinkedIn Insight", "advertising"],
    ["https://analytics.tiktok.com/i18n/pixel/events.js", "TikTok Pixel", "advertising"],
    ["https://s.pinimg.com/ct/core.js", "Pinterest Tag", "advertising"],
    ["https://static.ads-twitter.com/uwt.js", "X Pixel", "advertising"],
    ["https://cdn.segment.com/analytics.js/v1/public-key/analytics.min.js", "Segment", "analytics"],
    ["https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js", "Mixpanel", "analytics"],
    ["https://cdn.mxpnl.com/libs/mixpanel-js/dist/mixpanel.module.js", "Mixpanel", "analytics"],
    ["https://cdn.amplitude.com/libs/analytics-browser-2.42.0-min.js.gz", "Amplitude", "analytics"],
    ["https://cdn.amplitude.com/script/public-key.js", "Amplitude", "analytics"],
    ["https://us-assets.i.posthog.com/static/array.js", "PostHog", "analytics"],
    ["https://eu-assets.i.posthog.com/static/array.js", "PostHog", "analytics"],
    ["https://plausible.io/js/pa-public-id.js", "Plausible", "analytics"],
    ["https://plausible.io/js/script.outbound-links.js", "Plausible", "analytics"],
    ["https://accounts.google.com/gsi/client", "Google sign-in", "authentication"]
  ])("names %s without claiming a cause", (url, provider, role) => {
    const resource = describeBrowserResource(browserResourceEvent({ url }).payload.browser_event);
    expect(resource).toMatchObject({ provider, role, title: `${provider} script failed to load` });
    expect(browserResourceDiagnosis(resource)).toContain("does not identify the cause");
    const controls = buildBrowserResourceSuggestions({
      browserEvent: browserResourceEvent({ url }).payload.browser_event,
      service: "web",
      environment: "production",
      incident: {
        incident_id: "incident",
        project_id: "project",
        fingerprint: "hash",
        fingerprint_version: "v3",
        title: "Resource failed",
        occurrence_count: 1,
        matched_fields: []
      }
    });
    for (const control of controls) {
      expect(CaptureRuleSuggestionSchema.safeParse(control).success).toBe(true);
      expect(control.requires_confirmation).toBe(true);
    }
  });
  it.each([
    "https://www.googletagmanager.com.evil.example/gtm.js",
    "https://evil.example/gtag/js",
    "https://www.googletagmanager.com/other.js",
    "https://accounts.google.com/gsi/client/other.js",
    "https://static.cloudflareinsights.com/application.js",
    "https://s.pinimg.com/images/photo.js",
    "https://cdn.segment.com/other.js",
    "https://cdn.amplitude.com/script/key.engagement.js",
    "https://stats.wp.com/other.js",
    "https://app.example.com/js/script.js"
  ])("does not guess a provider from an unrelated host or path: %s", (url) => {
    expect(
      describeBrowserResource(browserResourceEvent({ url }).payload.browser_event)?.provider
    ).toBeNull();
  });
  it("does not identify a tracking script from a different element type", () => {
    const resource = describeBrowserResource(
      browserResourceEvent({ tag: "img" }).payload.browser_event
    );
    expect(resource?.provider).toBeNull();
    expect(resource?.optional_candidate).toBe(false);
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
