import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  validatePreparedAnalyticsBatch,
  matchAnalyticsDeliveryReceipt
} from "../../../packages/event-normalizer/src/semantic-analytics-outbox.js";
import { type AnalyticsPreparedEvent } from "../../../packages/shared-types/src/index.js";

const sha = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const event = JSON.parse(readFileSync("tests/fixtures/analytics-semantic-event.json", "utf8"));
const record: AnalyticsPreparedEvent = {
  protocol: "2026-09-analytics-prepared-01",
  project_id: "11111111-1111-4111-8111-111111111111",
  destination_binding: sha("destination"),
  prepared_at: "2026-09-28T10:00:01.000Z",
  expires_at: "2026-10-05T10:00:01.000Z",
  event_id: event.event_id,
  operation_id: event.operation_id,
  event_json: JSON.stringify(event),
  prepared_content_hash: sha(JSON.stringify(event))
};
const context = {
  project_id: record.project_id,
  destination_binding: record.destination_binding,
  now: "2026-09-28T12:00:00.000Z"
};
const receipt = {
  protocol: "2026-09-analytics-delivery-01",
  project_id: record.project_id,
  submitted: 1,
  accepted: 1,
  rejected: 0,
  errors: [],
  accepted_events: [
    {
      index: 0,
      event_id: record.event_id,
      operation_id: record.operation_id,
      content_hash: sha("server post-policy content may differ"),
      accepted_at: context.now,
      expires_at: "2026-12-27T12:00:00.000Z",
      duplicate: false
    }
  ]
};

it("validates finalized integrity and binding without rewriting an older SDK envelope", () => {
  expect(validatePreparedAnalyticsBatch([record], context)).toEqual({
    valid: true,
    events: [event]
  });
  expect(record.event_json).toBe(JSON.stringify(event));
  expect(
    validatePreparedAnalyticsBatch([record], { ...context, destination_binding: sha("other") })
  ).toEqual({ valid: false, reason: "destination_mismatch" });
  expect(
    validatePreparedAnalyticsBatch([record], {
      ...context,
      project_id: "22222222-2222-4222-8222-222222222222"
    })
  ).toEqual({ valid: false, reason: "destination_mismatch" });
  expect(
    validatePreparedAnalyticsBatch([{ ...record, prepared_content_hash: sha("changed") }], context)
  ).toEqual({ valid: false, reason: "integrity_mismatch" });
});

it("keeps expiry fixed and refuses future preparation beyond the allowed clock skew", () => {
  expect(validatePreparedAnalyticsBatch([record], { ...context, now: record.expires_at })).toEqual({
    valid: false,
    reason: "expired"
  });
  expect(
    validatePreparedAnalyticsBatch([record], { ...context, now: "2026-09-28T09:55:00.000Z" })
  ).toEqual({ valid: false, reason: "future_preparation" });
  expect(
    validatePreparedAnalyticsBatch([record], { ...context, now: "2026-09-28T09:55:01.000Z" }).valid
  ).toBe(true);
});

it("rejects malformed records and oversized work before copying a transport batch", () => {
  for (const input of [null, [], [{}]])
    expect(validatePreparedAnalyticsBatch(input, context)).toEqual({
      valid: false,
      reason: "invalid_record"
    });
  expect(validatePreparedAnalyticsBatch([record], {})).toEqual({
    valid: false,
    reason: "invalid_record"
  });
  expect(
    validatePreparedAnalyticsBatch(
      Array.from({ length: 257 }, () => record),
      context
    )
  ).toEqual({ valid: false, reason: "capacity_exceeded" });
  const largerJson = JSON.stringify({
    ...event,
    service: { ...event.service, environment: "x".repeat(120) }
  });
  const largerRecord = {
    ...record,
    event_json: largerJson,
    prepared_content_hash: sha(largerJson)
  };
  expect(Buffer.byteLength(largerJson) * 256).toBeGreaterThan(256 * 1024);
  expect(
    validatePreparedAnalyticsBatch(
      Array.from({ length: 256 }, () => largerRecord),
      context
    )
  ).toEqual({ valid: false, reason: "capacity_exceeded" });
});

it("matches the exact submitted indices and identities without equating pre-policy and server hashes", () => {
  expect(matchAnalyticsDeliveryReceipt(receipt, [record], record.project_id)).toEqual({
    matched: true,
    receipt
  });
  for (const changed of [
    { ...receipt, project_id: "22222222-2222-4222-8222-222222222222" },
    {
      ...receipt,
      accepted_events: [
        { ...receipt.accepted_events[0], event_id: "22222222-2222-4222-8222-222222222222" }
      ]
    },
    { ...receipt, accepted_events: [{ ...receipt.accepted_events[0], operation_id: null }] },
    { ...receipt, accepted_events: [{ ...receipt.accepted_events[0], index: 1 }] }
  ])
    expect(matchAnalyticsDeliveryReceipt(changed, [record], record.project_id)).toEqual({
      matched: false,
      reason: "protocol_failure"
    });
  expect(matchAnalyticsDeliveryReceipt(receipt, [record, record], record.project_id)).toEqual({
    matched: false,
    reason: "protocol_failure"
  });
});

it("preserves original mixed-batch rejection indices and validates duplicate accepted events", () => {
  const mixed = {
    ...receipt,
    submitted: 3,
    accepted: 2,
    rejected: 1,
    errors: [{ index: 1, reason: "analytics_quota_exceeded" }],
    accepted_events: [
      receipt.accepted_events[0],
      { ...receipt.accepted_events[0], index: 2, duplicate: true }
    ]
  };
  expect(matchAnalyticsDeliveryReceipt(mixed, [record, record, record], record.project_id)).toEqual(
    { matched: true, receipt: mixed }
  );
  expect(
    matchAnalyticsDeliveryReceipt(
      {
        ...receipt,
        accepted: 0,
        rejected: 1,
        accepted_events: [],
        errors: [{ index: 0, reason: "future_terminal_code" }]
      },
      [record],
      record.project_id
    ).matched
  ).toBe(true);
  for (const records of [null, [], [{}], Array.from({ length: 257 }, () => record)])
    expect(matchAnalyticsDeliveryReceipt(receipt, records, record.project_id)).toEqual({
      matched: false,
      reason: "protocol_failure"
    });
});
