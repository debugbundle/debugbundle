import { describe, expect, it } from "vitest";
import { createReportSourceText } from "../../../packages/smart-reports/src/source-text.js";
const source = {
  selected_project_id: "11111111-1111-4111-8111-111111111111",
  origin_project_id: "22222222-2222-4222-8222-222222222222",
  source_type: "incident" as const,
  source_id: "33333333-3333-4333-8333-333333333333",
  source_version_at: "2026-11-01T00:00:00.000Z",
  source_content_at: "2026-10-01T00:00:00.000Z",
  first_seen_at: "2026-08-01T00:00:00.000Z",
  last_seen_at: "2026-11-01T00:00:00.000Z",
  status: "open" as const,
  severity: "critical" as const,
  title: "Checkout failure",
  context: "Storage timeout during validation.",
  privacy_mode: "full" as const,
  source_collection_consent: true,
  retention_days: 90,
  now: "2026-11-07T00:00:00.000Z"
};
describe("retained report source text", () => {
  it("requires explicit full-source consent and does not collect restricted narratives", () => {
    expect(createReportSourceText({ ...source, source_collection_consent: false })).toBeNull();
    expect(createReportSourceText({ ...source, privacy_mode: "restricted" })).toBeNull();
  });
  it("expires from the original content time and honours a shorter source retention", () => {
    expect(createReportSourceText(source)).toMatchObject({
      text_expires_at: "2026-12-30T00:00:00.000Z"
    });
    expect(createReportSourceText({ ...source, retention_days: 14 })).toBeNull();
    const recent = { ...source, source_content_at: "2026-11-01T00:00:00.000Z", retention_days: 14 };
    expect(createReportSourceText(recent)).toMatchObject({
      text_expires_at: "2026-11-15T00:00:00.000Z"
    });
    expect(createReportSourceText({ ...recent, now: "2026-11-15T00:00:00.000Z" })).toBeNull();
  });
  it("redacts before caching and bounds reusable text without splitting a Unicode character", () => {
    const result = createReportSourceText({
      ...source,
      title: "Failed authorization: Bearer synthetic-secret-value",
      context:
        "password=synthetic-password Contact owner@example.test at https://untrusted.example.test/?token=synthetic-value"
    });
    expect(JSON.stringify(result)).not.toMatch(
      /synthetic-secret-value|synthetic-password|owner@example|untrusted.example/
    );
    const unicode = createReportSourceText({
      ...source,
      title: "🧪".repeat(100),
      context: "🧪".repeat(1000)
    });
    expect(unicode?.title.length).toBeLessThanOrEqual(160);
    expect(unicode?.context?.length).toBeLessThanOrEqual(1600);
    expect(unicode?.title.endsWith("🧪")).toBe(true);
    expect(unicode?.context?.endsWith("🧪")).toBe(true);
  });
  it("rejects invalid scope identifiers and cannot preserve a future or expired source", () => {
    expect(() =>
      createReportSourceText({ ...source, origin_project_id: "other-project" })
    ).toThrow();
    expect(
      createReportSourceText({ ...source, source_content_at: "2027-01-01T00:00:00.000Z" })
    ).toBeNull();
    expect(
      createReportSourceText({ ...source, source_content_at: "2026-01-01T00:00:00.000Z" })
    ).toBeNull();
  });
});
