import { buildBundle } from "../../packages/bundle-engine/src/index.js";
import {
  buildCaptureRuleSuggestions,
  createEventEnvelope,
  findExistingCaptureRuleForSuggestion,
  type BundleV1,
  type CaptureRule
} from "../../packages/shared-types/src/index.js";
import type { MockRecord } from "./fixtures.js";

const FAILURE_REF = "00000000-0000-4000-8000-000000000601";
const PAGE_ID = "00000000-0000-4000-8000-000000000602";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000603";

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function isMockBrowserResourceIncident(incidentId: string): boolean {
  return incidentId === "inc_normal";
}

export function buildMockBrowserResourceBundle(row: MockRecord): BundleV1 {
  const occurredAt = asString(row["last_seen_at"], new Date().toISOString());
  const serviceName = asString(row["service_name"], "checkout-web");
  const environment = asString(row["environment"], "production");
  const event = createEventEnvelope({
    event_id: "00000000-0000-4000-8000-000000000610",
    event_type: "frontend_exception",
    occurred_at: occurredAt,
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "3.2.4",
    service: {
      name: serviceName,
      environment,
      runtime: "browser"
    },
    correlation: {
      request_id: null,
      trace_id: null,
      session_id: "sess-mock-preview-1",
      user_id_hash: null
    },
    context: {
      evidence_reference: {
        version: 1,
        failure_ref: FAILURE_REF,
        scope: { kind: "page", page_id: PAGE_ID }
      }
    },
    payload: {
      name: "Error",
      message: "Browser resource load error",
      stack: "Error: Browser resource load error",
      route: "/checkout",
      browser: { name: "Chrome", version: "130" },
      browser_event: {
        kind: "resource_error",
        message: null,
        file_name: null,
        line_number: null,
        column_number: null,
        opaque: true,
        target: {
          tag_name: "img",
          source_url: "https://cdn.example.test/assets/checkout-preview.webp"
        },
        page: {
          url: "https://app.example.test/checkout",
          referrer: null,
          visibility_state: "visible",
          ready_state: "complete"
        }
      },
      resource_observations: {
        version: 1,
        items: [
          {
            kind: "csp",
            observed_at: occurredAt,
            disposition: "enforce",
            effective_directive: "img-src",
            source_url: "https://cdn.example.test/assets/checkout-preview.webp",
            document_status_code: 200
          },
          {
            kind: "timing",
            observed_at: occurredAt,
            availability: "observed",
            source_url: "https://cdn.example.test/assets/checkout-preview.webp",
            response_status: 403,
            duration_ms: 84,
            transfer_size_bytes: 0
          }
        ]
      }
    }
  });

  const recovery = createEventEnvelope({
    event_id: "00000000-0000-4000-8000-000000000611",
    event_type: "diagnostic_context",
    occurred_at: occurredAt,
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "3.2.4",
    service: {
      name: serviceName,
      environment,
      runtime: "browser"
    },
    correlation: {
      request_id: null,
      trace_id: null,
      session_id: "sess-mock-preview-1",
      user_id_hash: null
    },
    payload: {
      version: 1,
      kind: "recovery",
      failure_ref: FAILURE_REF,
      scope: { kind: "page", page_id: PAGE_ID },
      attempt_id: ATTEMPT_ID,
      state: "recovery_observed"
    }
  });

  const bundle = buildBundle({
    job: { trigger: "occurrence_threshold" },
    incident: {
      incident_id: asString(row["incident_id"], "inc_normal"),
      project_id: asString(row["project_id"], "00000000-0000-4000-8000-000000000001"),
      service_id: null,
      service_name: serviceName,
      service_runtime: "browser",
      service_framework: null,
      environment,
      fingerprint: asString(row["fingerprint"], "fp_mock_resource"),
      title: asString(row["title"], "Image failed to load: checkout-preview.webp"),
      severity: "medium",
      first_seen_at: asString(row["first_seen_at"], occurredAt),
      last_seen_at: occurredAt,
      occurrence_count: Number(row["occurrence_count"] ?? 2),
      source_event_types: ["frontend_exception"],
      resource_routes: {
        items: [
          { route: "/checkout", occurrences: 4 },
          { route: "/cart", occurrences: 2 }
        ],
        recorded_occurrences: 6,
        unattributed_occurrences: 0,
        omitted_routes: 0,
        coverage: "occurrence_metadata"
      }
    },
    bundleMetadata: {
      generation_number: 1,
      created_at: occurredAt,
      updated_at: occurredAt,
      source_event_id: event.event_id,
      source_occurred_at: occurredAt
    },
    sourceEnvelopes: [event],
    diagnosticContexts: [{ received_at: occurredAt, event: recovery }],
    probeDataItems: []
  });

  return {
    ...bundle,
    verification: {
      ...bundle.verification,
      synthetic: true
    }
  };
}

export function buildMockCaptureRuleSuggestions(
  incident: MockRecord,
  bundle: BundleV1,
  existingRules: MockRecord[]
) {
  const projectRules = existingRules.filter(
    (rule) => rule["project_id"] === incident["project_id"]
  ) as unknown as CaptureRule[];
  const suggestions = buildCaptureRuleSuggestions({
    incident: {
      incident_id: asString(incident["incident_id"], "inc_normal"),
      project_id: asString(incident["project_id"], "00000000-0000-4000-8000-000000000001"),
      fingerprint: asString(incident["fingerprint"], "fp_mock_resource"),
      fingerprint_version: asString(incident["fingerprint_version"], "3"),
      title: asString(incident["title"], "Image failed to load"),
      occurrence_count: Number(incident["occurrence_count"] ?? 1),
      matched_fields: Array.isArray(incident["matched_fields"])
        ? (incident["matched_fields"] as string[])
        : []
    },
    bundle
  }).map((suggestion) => {
    const existing = findExistingCaptureRuleForSuggestion(projectRules, suggestion.rule);
    return {
      ...suggestion,
      created_rule_id: existing?.id ?? null,
      created_rule_enabled: existing?.enabled ?? null
    };
  });

  return {
    access_mode: "manage" as const,
    bundle_status: "ready" as const,
    bundle_reason: null,
    suggestions
  };
}
