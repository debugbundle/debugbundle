import { describe, expect, it } from "vitest";
import { buildBundle, type BuildBundleInput } from "../../../packages/bundle-engine/src/index.js";
import { BundleV1Schema, createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

function input(): BuildBundleInput {
  const event = browserResourceEvent();
  return {
    job: { trigger: "occurrence_threshold" },
    incident: {
      incident_id: "inc_resource",
      project_id: "proj_resource",
      service_id: null,
      service_name: "web",
      service_runtime: "browser",
      service_framework: null,
      environment: "production",
      fingerprint: "resource",
      title: "Google Tag Manager script failed to load",
      severity: "medium",
      first_seen_at: event.occurred_at,
      last_seen_at: event.occurred_at,
      occurrence_count: 3,
      source_event_types: ["frontend_exception"]
    },
    bundleMetadata: {
      generation_number: 1,
      created_at: event.occurred_at,
      updated_at: event.occurred_at,
      source_event_id: event.event_id,
      source_occurred_at: event.occurred_at
    },
    sourceEnvelopes: [event],
    probeDataItems: []
  };
}

describe("browser resource bundles", () => {
  it("does not promote a related resource failure over the primary application exception", () => {
    const args = input();
    const backend = createEventEnvelope({
      event_type: "backend_exception",
      service: { name: "api", environment: "production", runtime: "node" },
      payload: {
        name: "TypeError",
        message: "Checkout failed",
        stack: "TypeError: Checkout failed\n    at checkout (/app/checkout.js:10:2)",
        handled: false,
        request: { method: "POST", path: "/checkout", query: {}, headers: {} },
        response: { status_code: 500 },
        runtime: { version: "24" }
      }
    });
    args.sourceEnvelopes.push(backend);
    args.bundleMetadata.source_event_id = backend.event_id;
    args.incident.source_event_types = ["backend_exception", "frontend_exception"];
    const bundle = buildBundle(args);
    expect(bundle.context.resource_failure).toBeUndefined();
    expect(bundle.summary.likely_cause).not.toContain("privacy tools");
    expect(bundle.summary.first_application_frame?.file).toBe("/app/checkout.js");
  });
  it("keeps Bundle v1 and original evidence while adding honest resource context", () => {
    const args = input();
    const bundle = buildBundle(args);
    expect(bundle.bundle_version).toBe(1);
    expect(bundle.context.error?.message).toBe("Browser resource load error");
    expect(bundle.context.resource_failure).toMatchObject({
      version: 1,
      provider: "Google Tag Manager",
      role: "tag_manager",
      routes: {
        items: [{ route: "/login", occurrences: 1 }],
        unattributed_occurrences: 2,
        coverage: "retained_samples"
      }
    });
    expect(bundle.summary.likely_cause).toContain("Possibly blocked by privacy tools");
    expect(bundle.summary.likely_cause).toContain("does not identify the cause");
    expect(bundle.summary.first_application_frame).toBeNull();
    expect(bundle.reproduction.possible).toBe(false);
    expect(buildBundle(args)).toEqual(bundle);
    const legacy = { ...bundle, context: { ...bundle.context } };
    delete legacy.context.resource_failure;
    expect(BundleV1Schema.safeParse(legacy).success).toBe(true);
  });
  it("prefers complete occurrence metadata over retained sample routes", () => {
    const args = input();
    args.incident.resource_routes = {
      items: [
        { route: "/dashboard", occurrences: 2 },
        { route: "/login", occurrences: 1 }
      ],
      recorded_occurrences: 3,
      unattributed_occurrences: 0,
      omitted_routes: 0,
      coverage: "occurrence_metadata"
    };
    expect(buildBundle(args).context.resource_failure?.routes).toEqual(
      args.incident.resource_routes
    );
  });
  it("does not imply that Google sign-in is optional or privacy-blocked", () => {
    const args = input();
    args.sourceEnvelopes = [
      browserResourceEvent({ url: "https://accounts.google.com/gsi/client" })
    ];
    const bundle = buildBundle(args);
    expect(bundle.context.resource_failure).toMatchObject({
      role: "authentication",
      optional_candidate: false
    });
    expect(bundle.summary.likely_cause).not.toContain("Possibly blocked");
  });
});
