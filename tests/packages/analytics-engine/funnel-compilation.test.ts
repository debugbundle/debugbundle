import { expect, it } from "vitest";
import fixture from "../../fixtures/analytics-semantic-event.json" with { type: "json" };
import {
  admitSemanticAnalyticsEvent,
  type SemanticAnalyticsAdmissionContext
} from "../../../packages/event-normalizer/src/semantic-analytics-admission.js";
import {
  compileOrderedFunnelFact,
  compileOrderedPortfolioFunnelFact,
  matchesAnalyticsPredicate
} from "../../../packages/analytics-engine/src/index.js";
import { AnalyticsOrderedFunnelDefinitionSchema } from "../../../packages/shared-types/src/index.js";

const project = "11111111-1111-4111-8111-111111111111";
const space = "22222222-2222-4222-8222-222222222222";
const hash = `sha256:${"a".repeat(64)}`;
const scope = { kind: "project" as const, project_id: project };
const definition = AnalyticsOrderedFunnelDefinitionSchema.parse({
  key: "signup",
  revision: 1,
  display_name: "Signup",
  scope,
  subject: "user",
  timezone: "UTC",
  kind: "ordered_funnel",
  conversion_window_seconds: 60,
  breakdown: { field: "property", key: "signup_method" },
  steps: [
    {
      key: "entry",
      predicate: { field: "event_name", operator: "in", values: ["account.created"] }
    },
    {
      key: "success",
      predicate: { field: "property", key: "signup_method", operator: "in", values: ["email"] }
    }
  ]
});
function accepted(changes: Partial<SemanticAnalyticsAdmissionContext> = {}) {
  const result = admitSemanticAnalyticsEvent(
    {
      ...fixture,
      correlation: {
        ...fixture.correlation,
        namespace_revision: 1,
        user_id_hash: hash,
        account_id_hash: hash
      },
      payload: { ...fixture.payload, privacy: { mode: "custom", consent_granted: false } }
    },
    {
      projectId: project,
      scope,
      scopeRevision: 1,
      catalogRevision: 1,
      principal: "server_writer",
      enabled: true,
      businessMeasurementAllowed: true,
      minimumPrivacy: "custom",
      maxProperties: 20,
      earliestOccurredAt: "2026-09-28T00:00:00.000Z",
      receivedAt: "2026-09-28T10:00:01.000Z",
      supportedCurrencies: {},
      identity: {
        scope,
        verification: "server_namespace",
        namespace_revision: 1,
        anonymous_id_hash: null,
        user_id_hash: hash,
        account_id_hash: hash
      },
      catalog: [
        {
          name: "account.created",
          revision: 1,
          description: "Account committed",
          purpose: "business_measurement",
          success_boundary: "committed",
          producers: ["server"],
          expected_producers: [],
          properties: { signup_method: { type: "enum", values: ["email"], required: true } },
          measurements: {}
        }
      ],
      ...changes
    }
  );
  if (!result.accepted) throw new Error(result.reason);
  return result;
}

it("compiles only protected accepted evidence into bounded aggregate inputs", () => {
  const admitted = accepted();
  const compiled = compileOrderedFunnelFact(definition, 1, admitted);
  expect(compiled.status).toBe("included");
  if (compiled.status !== "included") throw new Error(compiled.reason);
  expect(compiled.fact).toMatchObject({
    matches: [true, true],
    breakdown: { kind: "value", value: "email" },
    definition_key: "signup",
    definition_revision: 1,
    scope_revision: 1,
    origin_project_id: project,
    received_at: admitted.received_at
  });
  expect(compiled.fact.subject_key).toMatch(/^[a-f0-9]{64}$/);
  expect(compiled.fact.subject_key).not.toBe(hash.slice(7));
  expect(JSON.stringify(compiled.fact)).not.toContain("user_id_hash");
});

it("keeps missing property values distinct from explicit null in finite predicates", () => {
  const payload = accepted().event;
  expect(
    matchesAnalyticsPredicate(
      { field: "property", key: "missing", operator: "in", values: [null] },
      payload
    )
  ).toBe(false);
  payload.payload.properties["missing"] = null;
  expect(
    matchesAnalyticsPredicate(
      { field: "property", key: "missing", operator: "in", values: [null] },
      payload
    )
  ).toBe(true);
  expect(
    matchesAnalyticsPredicate(
      {
        all: [
          { field: "event_kind", operator: "in", values: ["semantic"] },
          {
            any: [
              { field: "producer", operator: "in", values: ["browser"] },
              { field: "producer", operator: "in", values: ["server"] }
            ]
          }
        ]
      },
      payload
    )
  ).toBe(true);
});

it("never joins the same protected value from independent project namespaces", () => {
  const first = compileOrderedFunnelFact(definition, 1, accepted());
  const otherScope = { kind: "project" as const, project_id: space };
  const secondAccepted = accepted({
    projectId: space,
    scope: otherScope,
    identity: {
      ...accepted().event.correlation,
      scope: otherScope,
      verification: "server_namespace"
    }
  });
  const second = compileOrderedFunnelFact({ ...definition, scope: otherScope }, 1, secondAccepted);
  expect(first.status).toBe("included");
  expect(second.status).toBe("included");
  if (first.status === "included" && second.status === "included")
    expect(first.fact.subject_key).not.toBe(second.fact.subject_key);
  expect(compileOrderedFunnelFact(definition, 1, secondAccepted)).toEqual({
    status: "excluded",
    reason: "scope_mismatch"
  });
});

it("compiles a portfolio comparison only from project-bound subjects and keeps sources separate", () => {
  const portfolio = { ...definition, scope: { kind: "space" as const, space_id: space } };
  const first = compileOrderedPortfolioFunnelFact(portfolio, 7, accepted());
  const otherScope = { kind: "project" as const, project_id: space };
  const second = compileOrderedPortfolioFunnelFact(
    portfolio,
    7,
    accepted({
      projectId: space,
      scope: otherScope,
      identity: {
        ...accepted().event.correlation,
        scope: otherScope,
        verification: "server_namespace"
      }
    })
  );
  expect(first.status).toBe("included");
  expect(second.status).toBe("included");
  if (first.status === "included" && second.status === "included") {
    expect(first.fact.scope).toEqual(portfolio.scope);
    expect(first.fact.scope_revision).toBe(7);
    expect(first.fact.subject_key).not.toBe(second.fact.subject_key);
  }
  expect(compileOrderedPortfolioFunnelFact(definition, 7, accepted())).toEqual({
    status: "excluded",
    reason: "scope_mismatch"
  });
  const noIdentity = accepted();
  noIdentity.identity_scope = null;
  noIdentity.identity_verification = null;
  expect(compileOrderedPortfolioFunnelFact(portfolio, 7, noIdentity)).toEqual({
    status: "excluded",
    reason: "unlinked_subject"
  });
});

it("requires matching space identity and current membership evidence for connected reports", () => {
  const connected = { kind: "space" as const, space_id: space };
  const scopeOnly = accepted({ scope: connected });
  expect(compileOrderedFunnelFact({ ...definition, scope: connected }, 1, scopeOnly)).toEqual({
    status: "excluded",
    reason: "unlinked_subject"
  });
  const linked = accepted({
    scope: connected,
    identity: {
      ...accepted().event.correlation,
      scope: connected,
      verification: "server_namespace"
    }
  });
  expect(compileOrderedFunnelFact({ ...definition, scope: connected }, 1, linked).status).toBe(
    "included"
  );
  expect(compileOrderedFunnelFact({ ...definition, scope: connected }, 2, linked)).toEqual({
    status: "excluded",
    reason: "stale_scope"
  });
});

it("resolves account membership at occurrence time and never falls back to another subject unit", () => {
  const event = accepted();
  const account = compileOrderedFunnelFact({ ...definition, subject: "account" }, 1, event);
  event.event.correlation.user_id_hash = `sha256:${"b".repeat(64)}`;
  expect(compileOrderedFunnelFact({ ...definition, subject: "account" }, 1, event)).toEqual(
    account
  );
  event.event.correlation.account_id_hash = null;
  expect(compileOrderedFunnelFact({ ...definition, subject: "account" }, 1, event)).toEqual({
    status: "excluded",
    reason: "unlinked_subject"
  });
  expect(compileOrderedFunnelFact({ ...definition, subject: "session" }, 1, event)).toEqual({
    status: "excluded",
    reason: "unlinked_subject"
  });
});

it("separates namespace revisions and withholds invalid definitions or unmatched facts", () => {
  const event = accepted();
  const first = compileOrderedFunnelFact(definition, 1, event);
  event.event.correlation.namespace_revision = 2;
  const rotated = compileOrderedFunnelFact(definition, 1, event);
  if (first.status === "included" && rotated.status === "included")
    expect(rotated.fact.subject_key).not.toBe(first.fact.subject_key);
  else throw new Error("expected included facts");
  expect(compileOrderedFunnelFact({ ...definition, steps: [] }, 1, event)).toEqual({
    status: "excluded",
    reason: "invalid_definition"
  });
  expect(compileOrderedFunnelFact(definition, 0, event)).toEqual({
    status: "excluded",
    reason: "invalid_definition"
  });
  event.event.payload.name = "other";
  event.event.payload.properties = {};
  expect(compileOrderedFunnelFact(definition, 1, event)).toEqual({
    status: "excluded",
    reason: "no_match"
  });
});

it("preserves bounded client and acquisition dimensions while keeping session keys project-local", () => {
  const event = accepted();
  event.event.correlation.session_id = "33333333-3333-4333-8333-333333333333";
  event.event.payload.client = {
    auth_state: "authenticated",
    device_type: "mobile",
    browser_family: null,
    browser_major: null,
    os_family: null,
    os_major: null,
    language: null,
    locale: null,
    viewport_bucket: "unknown"
  };
  event.event.payload.acquisition = {
    landing_route: null,
    referrer_domain: "example.test",
    utm_source: "newsletter",
    utm_medium: null,
    utm_campaign: null
  };
  for (const [field, value] of [
    ["device_type", "mobile"],
    ["auth_state", "authenticated"],
    ["utm_source", "newsletter"]
  ] as const) {
    const result = compileOrderedFunnelFact(
      { ...definition, subject: "session", breakdown: { field } },
      1,
      event
    );
    expect(result.status).toBe("included");
    if (result.status === "included")
      expect(result.fact.breakdown).toEqual({ kind: "value", value });
  }
  const noBreakdown = compileOrderedFunnelFact(
    { ...definition, subject: "session", breakdown: null },
    1,
    event
  );
  if (noBreakdown.status !== "included") throw new Error(noBreakdown.reason);
  expect(noBreakdown.fact.breakdown).toEqual({ kind: "missing" });
  event.content_hash = "invalid";
  expect(compileOrderedFunnelFact(definition, 1, event)).toEqual({
    status: "excluded",
    reason: "invalid_evidence"
  });
});
