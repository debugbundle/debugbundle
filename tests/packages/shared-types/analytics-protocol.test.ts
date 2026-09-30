import { describe, expect, it } from "vitest";
import {
  AnalyticsCapabilitiesSchema,
  AnalyticsDeliveryReceiptSchema,
  AnalyticsDeliveryResultSchema,
  AnalyticsWriterCreateSchema
} from "../../../packages/shared-types/src/index.js";

const project = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const hash = `sha256:${"a".repeat(64)}`;
const capabilities = {
  protocol: "2026-09-analytics-capabilities-01",
  project_id: project,
  principal: "server_writer",
  server_time: "2026-09-28T12:00:00.000Z",
  expires_at: "2026-09-28T12:05:00.000Z",
  enabled: true,
  unavailable_reason: null,
  schema_version: "2026-09-analytics-02",
  scope: { kind: "project", project_id: project },
  scope_revision: 1,
  catalog_revision: 1,
  namespace_revision: null,
  identity_scope: null,
  known_identity_allowed: false,
  allowed_producers: ["server"],
  allowed_purposes: ["business_measurement"],
  consent_required: true,
  privacy_mode: "strict",
  sample_rate: 1,
  max_event_bytes: 16384,
  max_batch_events: 256,
  max_batch_bytes: 262144,
  max_properties: 1,
  detailed_retention_days: 7,
  max_event_age_seconds: 604800,
  correction_seconds: 172800,
  receipt_retention_days: 90,
  retry_after_max_ms: 300000
};
const receipt = {
  protocol: "2026-09-analytics-delivery-01",
  project_id: project,
  submitted: 2,
  accepted: 1,
  rejected: 1,
  errors: [{ index: 1, reason: "analytics_quota_exceeded" }],
  accepted_events: [
    {
      index: 0,
      event_id: eventId,
      operation_id: hash,
      content_hash: hash,
      accepted_at: "2026-09-28T12:00:00.000Z",
      expires_at: "2026-12-27T12:00:00.000Z",
      duplicate: false
    }
  ]
};

describe("semantic authenticated capabilities and durable receipts", () => {
  it("treats alternate UUID/hash casing as the same accepted event identity", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const first = { ...receipt.accepted_events[0]!, event_id: id };
    const candidate = {
      ...receipt,
      accepted: 2,
      rejected: 0,
      errors: [],
      accepted_events: [
        first,
        {
          ...first,
          index: 1,
          event_id: id.toUpperCase(),
          content_hash: hash.toUpperCase(),
          operation_id: hash.toUpperCase(),
          duplicate: true
        }
      ]
    };
    expect(AnalyticsDeliveryReceiptSchema.safeParse(candidate).success).toBe(true);
    candidate.accepted_events[1]!.duplicate = false;
    expect(AnalyticsDeliveryReceiptSchema.safeParse(candidate).success).toBe(false);
    candidate.accepted_events[1]!.duplicate = true;
    candidate.accepted_events[1]!.content_hash = `sha256:${"b".repeat(64)}`;
    expect(AnalyticsDeliveryReceiptSchema.safeParse(candidate).success).toBe(false);
  });
  it("distinguishes local delivery failures from authenticated indexed server receipts", () => {
    expect(AnalyticsDeliveryResultSchema.parse({ status: "received", receipt })).toEqual({
      status: "received",
      receipt
    });
    for (const reason of [
      "disabled",
      "unsupported",
      "consent_required",
      "capability_unavailable",
      "capacity_exceeded",
      "unsafe_input",
      "authentication_required",
      "record_expired",
      "destination_mismatch",
      "integrity_failure",
      "policy_changed",
      "timeout",
      "transport_failure",
      "protocol_failure"
    ]) {
      expect(AnalyticsDeliveryResultSchema.parse({ status: "unavailable", reason })).toEqual({
        status: "unavailable",
        reason
      });
      expect(
        AnalyticsDeliveryResultSchema.safeParse({ status: "unavailable", reason, receipt }).success
      ).toBe(false);
    }
    expect(
      AnalyticsDeliveryResultSchema.safeParse({
        status: "received",
        receipt: { ...receipt, accepted: 99 }
      }).success
    ).toBe(false);
    expect(
      AnalyticsDeliveryResultSchema.safeParse({
        status: "unavailable",
        reason: "timeout",
        error: "raw upstream body"
      }).success
    ).toBe(false);
    expect(
      AnalyticsDeliveryResultSchema.safeParse({ status: "unavailable", reason: "invented" }).success
    ).toBe(false);
  });
  it("allows explicit server product purposes while retaining unsampled business authority", () => {
    expect(
      AnalyticsCapabilitiesSchema.safeParse({
        ...capabilities,
        allowed_purposes: ["product_analytics", "business_measurement"]
      }).success
    ).toBe(true);
  });
  it("preserves a project policy that disables custom properties", () => {
    expect(
      AnalyticsCapabilitiesSchema.safeParse({ ...capabilities, max_properties: 0 }).success
    ).toBe(true);
  });
  it("round trips authenticated server capability without credential material", () => {
    expect(AnalyticsCapabilitiesSchema.parse(capabilities)).toEqual(capabilities);
    expect(
      AnalyticsCapabilitiesSchema.safeParse({ ...capabilities, project_token: "hidden" }).success
    ).toBe(false);
  });
  it("separates offline intake age from the shorter report correction period", () => {
    expect(AnalyticsCapabilitiesSchema.parse(capabilities)).toMatchObject({
      max_event_age_seconds: 604800,
      correction_seconds: 172800
    });
    expect(
      AnalyticsCapabilitiesSchema.safeParse({ ...capabilities, max_event_age_seconds: 604801 })
        .success
    ).toBe(false);
    const withoutIntakeLimit: Partial<typeof capabilities> = { ...capabilities };
    delete withoutIntakeLimit.max_event_age_seconds;
    expect(AnalyticsCapabilitiesSchema.safeParse(withoutIntakeLimit).success).toBe(false);
  });
  it.each([
    { principal: "project_token" },
    { principal: "relay" },
    { allowed_producers: ["browser"] },
    { sample_rate: 0.5 },
    { max_event_bytes: 16385 },
    { max_batch_events: 257 },
    { scope: { kind: "project", project_id: eventId } },
    { catalog_revision: 0 },
    { expires_at: "2026-09-28T12:05:00.001Z" },
    { expires_at: "2026-09-28T11:59:59.000Z" },
    { enabled: false },
    { unavailable_reason: "not_enabled" }
  ])("rejects inconsistent enabled capabilities %j", (changes) => {
    expect(AnalyticsCapabilitiesSchema.safeParse({ ...capabilities, ...changes }).success).toBe(
      false
    );
  });
  it("supports fail-closed disabled capabilities without an active catalog", () => {
    expect(
      AnalyticsCapabilitiesSchema.safeParse({
        ...capabilities,
        enabled: false,
        unavailable_reason: "not_enabled",
        catalog_revision: null,
        namespace_revision: null,
        allowed_producers: [],
        allowed_purposes: []
      }).success
    ).toBe(true);
  });
  it("requires browser/mobile product-only authority and explicit consent policy", () => {
    const browser = {
      ...capabilities,
      principal: "project_token",
      allowed_producers: ["browser", "mobile"],
      allowed_purposes: ["product_analytics"],
      sample_rate: 0.5
    };
    expect(AnalyticsCapabilitiesSchema.safeParse(browser).success).toBe(true);
    expect(
      AnalyticsCapabilitiesSchema.safeParse({ ...browser, allowed_producers: ["server"] }).success
    ).toBe(false);
  });
  it("requires a complete indexed disposition and lossless exact event receipts", () => {
    expect(AnalyticsDeliveryReceiptSchema.parse(receipt)).toEqual(receipt);
    for (const changes of [
      { accepted: 2 },
      { submitted: 3 },
      { accepted_events: [] },
      { errors: [{ index: 0, reason: "invalid_catalog" }] },
      { errors: [{ index: 2, reason: "invalid_catalog" }] },
      { accepted_events: [{ ...receipt.accepted_events[0], content_hash: "raw" }] },
      {
        accepted_events: [{ ...receipt.accepted_events[0], expires_at: "2026-09-28T12:00:00.000Z" }]
      },
      { errors: [{ index: 1, reason: "raw customer payload" }] }
    ])
      expect(AnalyticsDeliveryReceiptSchema.safeParse({ ...receipt, ...changes }).success).toBe(
        false
      );
  });
  it("keeps direct anonymous identity project-local even when its catalog belongs to a space", () => {
    const browser = {
      ...capabilities,
      principal: "project_token",
      scope: { kind: "space", space_id: eventId },
      privacy_mode: "standard",
      namespace_revision: 1,
      identity_scope: { kind: "project", project_id: project },
      allowed_producers: ["browser"],
      allowed_purposes: ["product_analytics"]
    };
    expect(AnalyticsCapabilitiesSchema.safeParse(browser).success).toBe(true);
    expect(
      AnalyticsCapabilitiesSchema.safeParse({
        ...browser,
        identity_scope: { kind: "space", space_id: eventId }
      }).success
    ).toBe(false);
    expect(
      AnalyticsCapabilitiesSchema.safeParse({
        ...browser,
        identity_scope: { kind: "project", project_id: eventId }
      }).success
    ).toBe(false);
    expect(
      AnalyticsCapabilitiesSchema.safeParse({
        ...browser,
        privacy_mode: "custom",
        known_identity_allowed: true
      }).success
    ).toBe(false);
    expect(
      AnalyticsCapabilitiesSchema.safeParse({ ...browser, namespace_revision: null }).success
    ).toBe(false);
  });
  it("requires explicit custom identity authority on the same active namespace scope", () => {
    const relay = {
      ...capabilities,
      principal: "relay",
      scope: { kind: "space", space_id: eventId },
      privacy_mode: "custom",
      namespace_revision: 1,
      identity_scope: { kind: "space", space_id: eventId },
      known_identity_allowed: true,
      allowed_producers: ["browser", "mobile"],
      allowed_purposes: ["product_analytics"]
    };
    expect(AnalyticsCapabilitiesSchema.safeParse(relay).success).toBe(true);
    expect(
      AnalyticsCapabilitiesSchema.safeParse({
        ...relay,
        identity_scope: { kind: "space", space_id: project }
      }).success
    ).toBe(false);
    expect(
      AnalyticsCapabilitiesSchema.safeParse({ ...relay, privacy_mode: "standard" }).success
    ).toBe(false);
    expect(
      AnalyticsCapabilitiesSchema.safeParse({
        ...relay,
        identity_scope: null,
        namespace_revision: null
      }).success
    ).toBe(false);
  });
  it("accepts bounded unknown terminal reasons for forward compatibility", () => {
    expect(
      AnalyticsDeliveryReceiptSchema.safeParse({
        ...receipt,
        errors: [{ index: 1, reason: "new_terminal_reason" }]
      }).success
    ).toBe(true);
  });
  it("requires repeated accepted event identities to acknowledge identical duplicate content", () => {
    expect(
      AnalyticsDeliveryReceiptSchema.safeParse({
        ...receipt,
        accepted: 2,
        rejected: 0,
        errors: [],
        accepted_events: [receipt.accepted_events[0], { ...receipt.accepted_events[0], index: 1 }]
      }).success
    ).toBe(false);
    expect(
      AnalyticsDeliveryReceiptSchema.safeParse({
        ...receipt,
        accepted: 2,
        rejected: 0,
        errors: [],
        accepted_events: [
          receipt.accepted_events[0],
          { ...receipt.accepted_events[0], index: 1, duplicate: true }
        ]
      }).success
    ).toBe(true);
  });
  it("requires revision/idempotency and a finite lifetime for writer creation", () => {
    const create = {
      kind: "server",
      display_name: "Billing outbox",
      expected_revision: 0,
      idempotency_key: eventId,
      expires_in_days: 90
    };
    expect(AnalyticsWriterCreateSchema.parse(create)).toEqual(create);
    for (const changes of [
      { expires_in_days: 366 },
      { expires_in_days: 0 },
      { scope: "admin" },
      { expected_revision: -1 }
    ])
      expect(AnalyticsWriterCreateSchema.safeParse({ ...create, ...changes }).success).toBe(false);
  });
});
