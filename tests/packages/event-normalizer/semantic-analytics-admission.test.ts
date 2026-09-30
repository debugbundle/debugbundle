import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  admitSemanticAnalyticsEvent,
  type SemanticAnalyticsAdmissionContext
} from "../../../packages/event-normalizer/src/semantic-analytics-admission.js";
import type { SemanticAnalyticsEvent } from "../../../packages/shared-types/src/index.js";

function event(): SemanticAnalyticsEvent {
  return JSON.parse(
    readFileSync(new URL("../../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
  ) as SemanticAnalyticsEvent;
}
function context(): SemanticAnalyticsAdmissionContext {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    scope: { kind: "project", project_id: "11111111-1111-4111-8111-111111111111" },
    scopeRevision: 1,
    catalogRevision: 1,
    principal: "server_writer",
    receivedAt: "2026-09-28T10:01:00.000Z",
    enabled: true,
    businessMeasurementAllowed: true,
    minimumPrivacy: "strict",
    maxProperties: 1,
    earliestOccurredAt: "2026-09-26T10:01:00.000Z",
    identity: null,
    supportedCurrencies: { USD: 2, JPY: 0, KWD: 3 },
    catalog: [
      {
        name: "account.created",
        revision: 1,
        description: "Account committed",
        producers: ["server"],
        purpose: "business_measurement",
        success_boundary: "committed",
        properties: { signup_method: { type: "enum", values: ["email", "oauth"], required: true } },
        measurements: { duration: { unit: "ms", required: false } },
        expected_producers: []
      }
    ]
  };
}
function browser(): SemanticAnalyticsEvent {
  const value = event();
  value.producer.kind = "browser";
  value.service.runtime = "browser";
  value.operation_id = null;
  value.payload.purpose = "product_analytics";
  value.payload.privacy.consent_granted = true;
  value.correlation.session_id = "22222222-2222-4222-8222-222222222222";
  return value;
}

describe("semantic analytics ingress admission", () => {
  it("requires a matching server namespace and current privacy for protected identity", () => {
    const value = event();
    value.payload.privacy.mode = "custom";
    value.correlation.namespace_revision = 2;
    value.correlation.user_id_hash = `sha256:${"a".repeat(64)}`;
    const policy = context();
    policy.minimumPrivacy = "custom";
    policy.identity = {
      scope: policy.scope,
      namespace_revision: 2,
      anonymous_id_hash: null,
      user_id_hash: value.correlation.user_id_hash,
      account_id_hash: null,
      verification: "server_namespace"
    };
    expect(admitSemanticAnalyticsEvent(value, policy)).toMatchObject({
      accepted: true,
      identity_verification: "server_namespace"
    });
    expect(admitSemanticAnalyticsEvent(value, { ...policy, principal: "project_token" })).toEqual({
      accepted: false,
      reason: "source_not_authorized"
    });
    expect(admitSemanticAnalyticsEvent(value, { ...policy, identity: null })).toEqual({
      accepted: false,
      reason: "identity_not_authorized"
    });
    expect(admitSemanticAnalyticsEvent(value, { ...policy, minimumPrivacy: "strict" })).toEqual({
      accepted: false,
      reason: "privacy_rejected"
    });
  });
  it("admits consented server product usage without granting business-measurement permission", () => {
    const value = event();
    value.payload.purpose = "product_analytics";
    value.payload.privacy.consent_granted = true;
    value.operation_id = null;
    const policy = context();
    policy.businessMeasurementAllowed = false;
    policy.catalog[0]!.purpose = "product_analytics";
    expect(admitSemanticAnalyticsEvent(value, policy)).toMatchObject({
      accepted: true,
      authority: "server_authoritative"
    });
    value.payload.privacy.consent_granted = false;
    expect(admitSemanticAnalyticsEvent(value, policy)).toEqual({
      accepted: false,
      reason: "invalid_event"
    });
  });
  it("withholds a credential-like declared measurement unit while preserving numeric precision", () => {
    const value = event();
    const policy = context();
    policy.catalog[0]!.measurements["duration"]!.unit = "dbundle_mem_fixture";
    value.payload.measurements["duration"] = {
      unit: "dbundle_mem_fixture",
      value: "999999999999999.999999"
    };
    expect(admitSemanticAnalyticsEvent(value, policy)).toEqual({
      accepted: false,
      reason: "privacy_rejected"
    });
  });
  it("binds origin and authority to authenticated context, with protected deterministic content", () => {
    const result = admitSemanticAnalyticsEvent(event(), context());
    expect(result).toMatchObject({
      accepted: true,
      origin_project_id: context().projectId,
      authority: "server_authoritative"
    });
    if (!result.accepted) throw new Error("fixture rejected");
    expect(result.content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.event).toEqual(event());
    const reordered = {
      ...event(),
      service: { environment: "test", framework: null, runtime: "node", name: "accounts-api" }
    };
    expect(admitSemanticAnalyticsEvent(reordered, context())).toEqual(result);
  });
  it.each(["project_token", "relay"] as const)(
    "rejects copied server events from %s",
    (principal) => {
      expect(admitSemanticAnalyticsEvent(event(), { ...context(), principal })).toEqual({
        accepted: false,
        reason: "source_not_authorized"
      });
    }
  );
  it("does not promote browser observations through a server credential", () => {
    expect(admitSemanticAnalyticsEvent(browser(), context())).toEqual({
      accepted: false,
      reason: "source_not_authorized"
    });
  });
  it("does not admit business measurement without explicit purpose policy", () => {
    expect(
      admitSemanticAnalyticsEvent(event(), { ...context(), businessMeasurementAllowed: false })
    ).toEqual({ accepted: false, reason: "purpose_not_authorized" });
  });
  it("fails closed before inspecting disabled input", () => {
    const input = new Proxy(
      {},
      {
        get: () => {
          throw new Error("must not inspect");
        }
      }
    );
    expect(admitSemanticAnalyticsEvent(input, { ...context(), enabled: false })).toEqual({
      accepted: false,
      reason: "analytics_disabled"
    });
  });
  it("rejects unknown revisions, invalid enum values and missing required properties", () => {
    for (const edit of [
      (value: SemanticAnalyticsEvent) => {
        value.payload.event_revision = 2;
      },
      (value: SemanticAnalyticsEvent) => {
        value.payload.properties["signup_method"] = "private_identity";
      },
      (value: SemanticAnalyticsEvent) => {
        value.payload.properties = {};
      },
      (value: SemanticAnalyticsEvent) => {
        value.payload.measurements["duration"] = { unit: "seconds", value: "1" };
      }
    ]) {
      const value = event();
      edit(value);
      expect(admitSemanticAnalyticsEvent(value, context())).toEqual({
        accepted: false,
        reason: "invalid_catalog"
      });
    }
  });
  it("withholds unknown properties and measures before retaining the admitted event", () => {
    const value = event();
    value.payload.properties["dynamic"] = "unregistered";
    value.payload.measurements["unknown"] = { unit: "ms", value: "1" };
    const result = admitSemanticAnalyticsEvent(value, context());
    expect(result).toMatchObject({ accepted: true, withheld_fields: 2 });
    expect(JSON.stringify(result)).not.toContain("unregistered");
    expect(JSON.stringify(result)).not.toContain('"unknown"');
  });
  it("protects service fields and rejects unsafe opaque correlation before persistence", () => {
    const value = event();
    value.service.name = "dbundle_mem_admission_fixture_secret";
    const result = admitSemanticAnalyticsEvent(value, context());
    expect(result.accepted).toBe(true);
    expect(JSON.stringify(result)).not.toContain(value.service.name);
    value.correlation.trace_id = "dbundle_mem_admission_fixture_secret";
    expect(admitSemanticAnalyticsEvent(value, context())).toEqual({
      accepted: false,
      reason: "privacy_rejected"
    });
  });
  it("enforces current privacy and authenticated namespace associations", () => {
    const value = browser();
    value.payload.privacy.mode = "custom";
    value.correlation.user_id_hash = `sha256:${"b".repeat(64)}`;
    value.correlation.namespace_revision = 1;
    const policy = context();
    policy.principal = "project_token";
    policy.catalog[0]!.producers = ["browser"];
    policy.catalog[0]!.purpose = "product_analytics";
    expect(admitSemanticAnalyticsEvent(value, policy)).toEqual({
      accepted: false,
      reason: "privacy_rejected"
    });
    policy.minimumPrivacy = "custom";
    expect(admitSemanticAnalyticsEvent(value, policy)).toEqual({
      accepted: false,
      reason: "identity_not_authorized"
    });
    policy.identity = {
      scope: policy.scope,
      verification: "first_party_association",
      namespace_revision: 1,
      anonymous_id_hash: null,
      user_id_hash: value.correlation.user_id_hash,
      account_id_hash: null
    };
    expect(admitSemanticAnalyticsEvent(value, policy)).toEqual({
      accepted: false,
      reason: "identity_not_authorized"
    });
    policy.principal = "relay";
    expect(admitSemanticAnalyticsEvent(value, policy)).toMatchObject({
      accepted: true,
      authority: "client_observed"
    });
    policy.identity.namespace_revision = 2;
    expect(admitSemanticAnalyticsEvent(value, policy)).toEqual({
      accepted: false,
      reason: "identity_not_authorized"
    });
  });
  it("bounds future skew and lateness without allowing receipt time to establish order", () => {
    const value = event();
    value.occurred_at = "2026-09-28T10:06:00.001Z";
    expect(admitSemanticAnalyticsEvent(value, context())).toEqual({
      accepted: false,
      reason: "future_timestamp"
    });
    value.occurred_at = "2026-09-28T10:06:00.000Z";
    expect(admitSemanticAnalyticsEvent(value, context()).accepted).toBe(true);
    value.occurred_at = "2026-09-26T10:00:59.999Z";
    expect(admitSemanticAnalyticsEvent(value, context())).toEqual({
      accepted: false,
      reason: "outside_correction_window"
    });
  });
  it("stamps immutable policy generations and rejects missing or unrelated scopes", () => {
    const policy = context();
    expect(admitSemanticAnalyticsEvent(event(), policy)).toMatchObject({
      accepted: true,
      scope: policy.scope,
      scope_revision: 1,
      catalog_revision: 1,
      identity_scope: null,
      identity_verification: null
    });
    expect(admitSemanticAnalyticsEvent(event(), { ...policy, scopeRevision: 0 })).toEqual({
      accepted: false,
      reason: "analytics_policy_unavailable"
    });
    expect(
      admitSemanticAnalyticsEvent(event(), {
        ...policy,
        scope: { kind: "project", project_id: "22222222-2222-4222-8222-222222222222" }
      })
    ).toEqual({ accepted: false, reason: "analytics_policy_unavailable" });
  });
  it("prevents anonymous project handles from becoming cross-project identities", () => {
    const value = browser();
    const hash = `sha256:${"a".repeat(64)}`;
    value.payload.privacy.mode = "standard";
    value.correlation.anonymous_id_hash = hash;
    value.correlation.namespace_revision = 1;
    const policy = context();
    policy.principal = "project_token";
    policy.minimumPrivacy = "standard";
    policy.catalog[0]!.producers = ["browser"];
    policy.catalog[0]!.purpose = "product_analytics";
    policy.scope = { kind: "space", space_id: "33333333-3333-4333-8333-333333333333" };
    policy.identity = {
      scope: { kind: "project", project_id: policy.projectId },
      verification: "project_anonymous",
      namespace_revision: 1,
      anonymous_id_hash: hash,
      user_id_hash: null,
      account_id_hash: null
    };
    expect(admitSemanticAnalyticsEvent(value, policy)).toMatchObject({
      accepted: true,
      identity_scope: { kind: "project", project_id: policy.projectId },
      identity_verification: "project_anonymous"
    });
    policy.identity.scope = policy.scope;
    expect(admitSemanticAnalyticsEvent(value, policy)).toEqual({
      accepted: false,
      reason: "identity_not_authorized"
    });
    policy.identity.verification = "first_party_association";
    expect(admitSemanticAnalyticsEvent(value, policy)).toEqual({
      accepted: false,
      reason: "identity_not_authorized"
    });
    policy.principal = "relay";
    expect(admitSemanticAnalyticsEvent(value, policy)).toMatchObject({
      accepted: true,
      identity_scope: policy.scope,
      authority: "client_observed"
    });
    policy.identity.scope = { kind: "space", space_id: "44444444-4444-4444-8444-444444444444" };
    expect(admitSemanticAnalyticsEvent(value, policy)).toEqual({
      accepted: false,
      reason: "identity_not_authorized"
    });
  });
  it("validates supported currency/exponent without coercing the amount", () => {
    const value = event();
    value.payload.money = { amount_minor: "9223372036854775807", currency: "JPY", exponent: 0 };
    value.payload.financial = {
      kind: "payment",
      payment_id: value.operation_id!,
      subscription_id: null
    };
    expect(admitSemanticAnalyticsEvent(value, context())).toMatchObject({
      accepted: true,
      event: { payload: { money: value.payload.money } }
    });
    value.payload.money.exponent = 2;
    expect(admitSemanticAnalyticsEvent(value, context())).toEqual({
      accepted: false,
      reason: "unsupported_currency"
    });
  });
});
