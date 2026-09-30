import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AnalyticsEventEnvelopeSchema,
  EventEnvelopeSchema,
  SemanticAnalyticsEventSchema,
  AnalyticsDecimalSchema,
  AnalyticsMoneySchema,
  type SemanticAnalyticsEvent
} from "../../../packages/shared-types/src/index.js";

type MutableFixture<T> = T extends string
  ? string
  : T extends object
    ? { [K in keyof T]: MutableFixture<T[K]> }
    : T;

function event(): MutableFixture<SemanticAnalyticsEvent> {
  return JSON.parse(
    readFileSync(new URL("../../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
  ) as MutableFixture<SemanticAnalyticsEvent>;
}

function browserEvent(): MutableFixture<SemanticAnalyticsEvent> {
  const value = event();
  value.producer.kind = "browser";
  value.service.runtime = "browser";
  value.operation_id = null;
  value.correlation.session_id = "00000000-0000-4000-8000-000000000902";
  value.payload.purpose = "product_analytics";
  value.payload.privacy.consent_granted = true;
  return value;
}

describe("semantic analytics event contract", () => {
  it("round-trips a sessionless server business fact without extending either legacy union", () => {
    const value = event();
    const parsed = SemanticAnalyticsEventSchema.parse(value);
    expect(SemanticAnalyticsEventSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(value);
    expect(parsed.correlation.session_id).toBeNull();
    expect(AnalyticsEventEnvelopeSchema.safeParse(value).success).toBe(false);
    expect(EventEnvelopeSchema.safeParse(value).success).toBe(false);
  });

  it.each(Object.keys(event()))("requires the envelope field %s", (key) => {
    const value = event();
    Reflect.deleteProperty(value, key);
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });

  it.each(Object.keys(event().payload))("requires the payload field %s", (key) => {
    const value = event();
    Reflect.deleteProperty(value.payload, key);
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    "project_id",
    "project_token",
    "organization_id",
    "authority",
    "received_at",
    "event_class"
  ])("rejects client-supplied trust/credential field %s", (key) => {
    expect(SemanticAnalyticsEventSchema.safeParse({ ...event(), [key]: "untrusted" }).success).toBe(
      false
    );
  });

  it("requires explicit consent and a session for client observations", () => {
    const value = browserEvent();
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(true);
    value.payload.privacy.consent_granted = false;
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.payload.privacy.consent_granted = true;
    value.correlation.session_id = null;
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });

  it("reserves durable operation identity for server business facts", () => {
    const client = browserEvent();
    client.operation_id = `sha256:${"a".repeat(64)}`;
    expect(SemanticAnalyticsEventSchema.safeParse(client).success).toBe(false);
    const serverProduct = event();
    serverProduct.payload.purpose = "product_analytics";
    serverProduct.payload.privacy.consent_granted = true;
    expect(SemanticAnalyticsEventSchema.safeParse(serverProduct).success).toBe(false);
    serverProduct.operation_id = null;
    expect(SemanticAnalyticsEventSchema.safeParse(serverProduct).success).toBe(true);
  });

  it("cannot manufacture sessions or client page traffic from server events", () => {
    const value = event();
    value.correlation.session_id = "00000000-0000-4000-8000-000000000902";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.correlation.session_id = null;
    value.payload.kind = "page_view";
    value.payload.route = { normalized_path: "/pricing" };
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });

  it("requires matching route, screen and session context without accepting raw title data", () => {
    const value = browserEvent();
    value.payload.kind = "page_view";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.payload.route = { normalized_path: "/account/{id}" };
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(true);
    Object.assign(value.payload.route, { title: "Customer information" });
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    Reflect.deleteProperty(value.payload.route, "title");
    value.payload.previous_route = { normalized_path: "/pricing" };
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.payload.kind = "route_change";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(true);
    value.payload.previous_route.normalized_path = "/pricing?secret=value";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });

  it("accepts a native screen with a session and rejects it for a browser or server", () => {
    const value = browserEvent();
    value.payload.kind = "screen_view";
    value.payload.screen = "checkout.review";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.producer.kind = "mobile";
    value.service.runtime = "android";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(true);
    value.payload.session = { duration_ms: 30, active_duration_ms: 20, views: 1 };
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.payload.kind = "session_summary";
    value.payload.screen = null;
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(true);
    value.payload.session.active_duration_ms = 31;
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });

  it("requires explicit identity mode and namespace without relaxing strict mode", () => {
    const value = browserEvent();
    value.correlation.user_id_hash = `sha256:${"b".repeat(64)}`;
    value.correlation.namespace_revision = 1;
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.payload.privacy.mode = "standard";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.payload.privacy.mode = "custom";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(true);
    value.correlation.namespace_revision = null;
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });

  it("bounds property shape and rejects reserved/sensitive keys, raw text and nested data", () => {
    for (const properties of [
      { email: "a@example.test" },
      { constructor: "value" },
      JSON.parse('{"__proto__":"value"}') as unknown,
      { " feature": "checkout" },
      { feature: "arbitrary customer prose" },
      { feature: { nested: true } },
      Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`key_${i}`, true]))
    ]) {
      const value = event();
      expect(
        SemanticAnalyticsEventSchema.safeParse({
          ...value,
          payload: { ...value.payload, properties }
        }).success
      ).toBe(false);
    }
  });

  it("admits acquisition context only for consented client observations", () => {
    const value = browserEvent();
    const acquisition = {
      landing_route: { normalized_path: "/pricing" },
      referrer_domain: "example.test",
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "launch"
    };
    expect(
      SemanticAnalyticsEventSchema.safeParse({
        ...value,
        payload: { ...value.payload, acquisition }
      }).success
    ).toBe(true);
    const server = event();
    expect(
      SemanticAnalyticsEventSchema.safeParse({
        ...server,
        payload: { ...server.payload, acquisition }
      }).success
    ).toBe(false);
    for (const change of [
      { referrer_domain: "https://example.test/path?secret=value" },
      { utm_campaign: "private customer prose" },
      { landing_route: { normalized_path: "//other.test" } },
      { raw_url: "https://example.test/" }
    ]) {
      expect(
        SemanticAnalyticsEventSchema.safeParse({
          ...value,
          payload: { ...value.payload, acquisition: { ...acquisition, ...change } }
        }).success
      ).toBe(false);
    }
  });

  it("rejects unsupported metadata and unpaired producer sequencing", () => {
    const value = event();
    value.producer.sequence = 1;
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.producer.stream_id = "00000000-0000-4000-8000-000000000903";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(true);
    value.producer.sequence = Number.MAX_SAFE_INTEGER + 1;
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    value.producer.sequence = 1;
    value.service.runtime = "browser";
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });

  it("reserves monetary business events for server producers with stable operation IDs", () => {
    const value = event();
    value.payload.money = { amount_minor: "9223372036854775807", currency: "EUR", exponent: 2 };
    value.payload.financial = {
      kind: "payment",
      payment_id: `sha256:${"c".repeat(64)}`,
      subscription_id: null
    };
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(true);
    value.operation_id = null;
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
    const client = browserEvent();
    client.payload.money = value.payload.money;
    expect(SemanticAnalyticsEventSchema.safeParse(client).success).toBe(false);
  });

  it.each([null, [], "event", 42, true])("rejects malformed envelope %s", (value) => {
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });

  it("bounds total encoded event bytes, not only individual string lengths", () => {
    const value = browserEvent();
    value.payload.kind = "route_change";
    value.payload.route = { normalized_path: `/${"€".repeat(2047)}` };
    value.payload.previous_route = value.payload.route;
    value.payload.properties = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`category_${i}_${"x".repeat(48)}`, "a".repeat(128)])
    );
    expect(Buffer.byteLength(JSON.stringify(value))).toBeGreaterThan(16 * 1024);
    expect(SemanticAnalyticsEventSchema.safeParse(value).success).toBe(false);
  });
});

describe("semantic client dimensions and financial operations", () => {
  const hash = `sha256:${"c".repeat(64)}`;
  const money = { amount_minor: "12000", currency: "EUR", exponent: 2 };

  it("retains bounded client audience dimensions without accepting client geography", () => {
    const value = browserEvent();
    const client = {
      auth_state: "anonymous",
      device_type: "desktop",
      browser_family: "Chrome",
      browser_major: 138,
      os_family: "macOS",
      os_major: 15,
      language: "en",
      locale: "en-US",
      viewport_bucket: "large"
    };
    const withClient = { ...value, payload: { ...value.payload, client } };
    expect(SemanticAnalyticsEventSchema.safeParse(withClient).success).toBe(true);
    for (const change of [
      { country_code: "US" },
      { browser_family: "raw customer prose" },
      { language: "en/private" },
      { browser_major: 1.5 }
    ]) {
      expect(
        SemanticAnalyticsEventSchema.safeParse({
          ...withClient,
          payload: { ...withClient.payload, client: { ...client, ...change } }
        }).success
      ).toBe(false);
    }
    const server = event();
    expect(
      SemanticAnalyticsEventSchema.safeParse({ ...server, payload: { ...server.payload, client } })
        .success
    ).toBe(false);
  });

  it("distinguishes payment/refund references from event and business-operation IDs", () => {
    const value = event();
    for (const financial of [
      { kind: "payment", payment_id: hash, subscription_id: null },
      { kind: "refund", refund_id: hash, payment_id: `sha256:${"d".repeat(64)}` }
    ]) {
      const submitted = { ...value, payload: { ...value.payload, money, financial } };
      expect(SemanticAnalyticsEventSchema.safeParse(submitted).success).toBe(true);
      expect(
        SemanticAnalyticsEventSchema.safeParse({
          ...submitted,
          payload: { ...submitted.payload, money: null }
        }).success
      ).toBe(false);
      expect(
        SemanticAnalyticsEventSchema.safeParse({
          ...submitted,
          payload: { ...submitted.payload, financial: { ...financial, payment_id: "raw-order-id" } }
        }).success
      ).toBe(false);
    }
  });

  it("requires effective ordering and billing interval for subscription state", () => {
    const value = event();
    const financial = {
      kind: "subscription_state",
      subscription_id: hash,
      status: "active",
      effective_at: "2026-09-28T10:00:00.000Z",
      revision: 2,
      billing_interval: "year",
      interval_count: 1
    };
    const submitted = { ...value, payload: { ...value.payload, money, financial } };
    expect(SemanticAnalyticsEventSchema.safeParse(submitted).success).toBe(true);
    for (const change of [
      { revision: 0 },
      { interval_count: 0 },
      { interval_count: 13 },
      { billing_interval: "fortnight" },
      { effective_at: "unknown" },
      { status: "unknown" }
    ]) {
      expect(
        SemanticAnalyticsEventSchema.safeParse({
          ...submitted,
          payload: { ...submitted.payload, financial: { ...financial, ...change } }
        }).success
      ).toBe(false);
    }
  });
});

describe("lossless analytics measures", () => {
  it.each(["0", "1", "-1", "0.000001", "999999999999999.999999", "-0.1"])(
    "retains canonical decimal %s exactly",
    (value) => {
      expect(AnalyticsDecimalSchema.parse(value)).toBe(value);
    }
  );
  it.each([
    0.1,
    "01",
    "-0",
    "1.0",
    "1e5",
    "NaN",
    "Infinity",
    "0.0000001",
    "1000000000000000",
    "1."
  ])("rejects noncanonical or out-of-range decimal %s", (value) => {
    expect(AnalyticsDecimalSchema.safeParse(value).success).toBe(false);
  });
  it.each(["9223372036854775808", "-1", "01", "1.5", 100, "1e2"])(
    "rejects unsafe money %s",
    (amount_minor) => {
      expect(
        AnalyticsMoneySchema.safeParse({ amount_minor, currency: "EUR", exponent: 2 }).success
      ).toBe(false);
    }
  );
  it.each(["amount_minor", "currency", "exponent"])("requires money field %s", (key) => {
    const money = { amount_minor: "0", currency: "JPY", exponent: 0 };
    Reflect.deleteProperty(money, key);
    expect(AnalyticsMoneySchema.safeParse(money).success).toBe(false);
  });
  it("round-trips zero money and rejects invalid units and extra fields", () => {
    const money = { amount_minor: "0", currency: "JPY", exponent: 0 };
    expect(AnalyticsMoneySchema.parse(JSON.parse(JSON.stringify(money)))).toEqual(money);
    for (const change of [{ currency: "usd" }, { exponent: 5 }, { exponent: 1.5 }, { value: 3 }]) {
      expect(AnalyticsMoneySchema.safeParse({ ...money, ...change }).success).toBe(false);
    }
  });
});
