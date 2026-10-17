import { expect, it } from "vitest";
import { formatCaptureRuleMatcher } from "../../../apps/web/src/lib/capture-rule-copy.js";
import { preserveAlertNoiseSettings } from "../../../packages/shared-types/src/alert-notification-policy.js";

it("puts the affected resource first without omitting its type or service scope", () => {
  const summary = formatCaptureRuleMatcher({
    event_types: ["frontend_exception"],
    resource_url: { host: "cdn.example.com", path_equals: "/optional.js" },
    browser_target_tag_name: "script",
    services: ["web"],
    environments: ["production"]
  });
  expect(summary.startsWith("resource: cdn.example.com /optional.js")).toBe(true);
  expect(summary).toContain("target: script");
  expect(summary).toContain("services: web • environments: production");
});

it("displays every safety condition on a lifecycle-scoped capture rule", () => {
  const result = formatCaptureRuleMatcher({
    browser_page_visibility_state: "hidden",
    browser_page_ready_state: "interactive",
    browser_target_tag_name: "link",
    browser_target_attributes: { rel: "modulepreload", integrity_present: false }
  });
  expect(result).toContain("page visibility: hidden");
  expect(result).toContain("document state: interactive");
  expect(result).toContain("target: link");
  expect(result).toContain("rel=modulepreload");
  expect(result).toContain("integrity_present=false");
});

it("retains noise controls when editing a destination without carrying stale destination fields", () => {
  expect(
    preserveAlertNoiseSettings(
      "email",
      { to: "old@example.com", aggregation_window_seconds: 30 },
      { to: "new@example.com" }
    )
  ).toEqual({ to: "new@example.com", aggregation_window_seconds: 30 });
  expect(
    preserveAlertNoiseSettings(
      "slack",
      { webhook_url: "https://old.example.com", cooldown_scope: "project" },
      { slack_destination_id: "destination" }
    )
  ).toEqual({ slack_destination_id: "destination", cooldown_scope: "project" });
  expect(
    preserveAlertNoiseSettings(
      "email",
      { aggregation_window_seconds: 9000 },
      { to: "new@example.com" }
    )
  ).toEqual({ to: "new@example.com" });
});
