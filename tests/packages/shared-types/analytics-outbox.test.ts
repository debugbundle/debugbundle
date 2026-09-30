import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  AnalyticsPreparedEventSchema,
  AnalyticsPreparationResultSchema,
  type SemanticAnalyticsEvent
} from "../../../packages/shared-types/src/index.js";

const event = JSON.parse(
  readFileSync("tests/fixtures/analytics-semantic-event.json", "utf8")
) as SemanticAnalyticsEvent;
const json = JSON.stringify(event);
const sha = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const record = {
  protocol: "2026-09-analytics-prepared-01",
  project_id: "11111111-1111-4111-8111-111111111111",
  destination_binding: sha("synthetic-endpoint-identity"),
  prepared_at: "2026-09-28T10:00:01.000Z",
  expires_at: "2026-10-05T10:00:01.000Z",
  event_id: event.event_id,
  operation_id: event.operation_id,
  event_json: json,
  prepared_content_hash: sha(json)
};

it("round trips a finalized server outbox record without rebuilding the SDK envelope", () => {
  expect(AnalyticsPreparedEventSchema.parse(record)).toEqual(record);
  expect(AnalyticsPreparationResultSchema.parse({ status: "prepared", record })).toEqual({
    status: "prepared",
    record
  });
  expect(JSON.parse(AnalyticsPreparedEventSchema.parse(record).event_json).sdk_version).toBe(
    event.sdk_version
  );
});

it("separates preparation failure and hook drop from a durable delivery receipt", () => {
  for (const reason of [
    "disabled",
    "unsupported",
    "consent_required",
    "capacity_exceeded",
    "unsafe_input",
    "hook_dropped",
    "timeout"
  ]) {
    expect(AnalyticsPreparationResultSchema.parse({ status: "unavailable", reason })).toEqual({
      status: "unavailable",
      reason
    });
  }
  for (const value of [
    { status: "prepared", record, receipt: {} },
    { status: "unavailable", reason: "timeout", record },
    { status: "unavailable", reason: "raw value" }
  ])
    expect(AnalyticsPreparationResultSchema.safeParse(value).success).toBe(false);
});

it("rejects wrappers whose event identity, purpose or bounded serialization does not correspond", () => {
  const withEvent = (replacement: unknown) => ({
    ...record,
    event_json: JSON.stringify(replacement)
  });
  for (const value of [
    { ...record, event_id: "22222222-2222-4222-8222-222222222222" },
    { ...record, operation_id: null },
    withEvent({ ...event, producer: { kind: "browser", stream_id: null, sequence: null } }),
    withEvent({ ...event, extra: "private" }),
    { ...record, event_json: "null" },
    { ...record, event_json: "{" },
    { ...record, event_json: ` ${json}` },
    { ...record, event_json: json.replace('"event_id":', `"event_id":"duplicate", "event_id":`) },
    { ...record, event_json: "x".repeat(16385) },
    { ...record, event_json: JSON.stringify({ ...event, sdk_name: "界".repeat(6000) }) },
    { ...record, prepared_content_hash: "raw" },
    { ...record, expires_at: record.prepared_at },
    { ...record, expires_at: "2026-10-05T10:00:01.001Z" },
    { ...record, destination_binding: "https://example.test?token=secret" },
    { ...record, credential: "must-never-persist" }
  ])
    expect(AnalyticsPreparedEventSchema.safeParse(value).success).toBe(false);
});

it("does not confuse structural validity with an integrity or authorization grant", () => {
  // Cryptographic validation belongs to the bounded consumer, not this browser-safe shape schema.
  expect(
    AnalyticsPreparedEventSchema.safeParse({ ...record, prepared_content_hash: sha("different") })
      .success
  ).toBe(true);
});
