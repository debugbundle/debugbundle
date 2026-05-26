import { z } from "zod";

import {
  CaptureRuleActionSchema,
  CaptureRuleCreateSchema,
  CaptureRuleEventTypeSchema,
  type CaptureRuleAction,
  type CaptureRuleCreate,
  type CaptureRuleEventType
} from "./capture-rules.js";

export const CaptureRuleSuggestionConfidenceSchema = z.enum(["high", "medium", "low"]);
export type CaptureRuleSuggestionConfidence = z.infer<typeof CaptureRuleSuggestionConfidenceSchema>;

export const CaptureRuleSuggestionSchema = z.object({
  suggestion_id: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  recommended_action: CaptureRuleActionSchema,
  confidence: CaptureRuleSuggestionConfidenceSchema,
  reason: z.string().min(1).max(500),
  requires_confirmation: z.boolean(),
  rule: CaptureRuleCreateSchema
});

export type CaptureRuleSuggestion = z.infer<typeof CaptureRuleSuggestionSchema>;

export const CaptureRuleSuggestionsResponseSchema = z.object({
  suggestions: z.array(CaptureRuleSuggestionSchema),
  bundle_status: z.enum(["ready", "pending", "failed"]).optional(),
  bundle_reason: z.string().nullable().optional()
});

export type CaptureRuleSuggestionsResponse = z.infer<typeof CaptureRuleSuggestionsResponseSchema>;

export const CreateCaptureRuleFromSuggestionSchema = z.object({
  suggestion_id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
  expires_at: z.string().datetime().nullable().optional()
});

export type CreateCaptureRuleFromSuggestion = z.infer<typeof CreateCaptureRuleFromSuggestionSchema>;

export interface CaptureRuleSuggestionIncident {
  incident_id: string;
  project_id: string;
  fingerprint: string;
  fingerprint_version: string;
  title: string;
  occurrence_count: number;
  matched_fields: string[];
}

export interface CaptureRuleSuggestionBundle {
  signal: {
    signal_type: string;
    source_event_types: string[];
    fingerprint: string;
  };
  context: {
    request?: {
      path?: string;
      headers?: Record<string, unknown>;
    } | null | undefined;
    response?: {
      status_code?: number;
    } | null | undefined;
    frontend?: {
      exceptions?: unknown[];
    } | null | undefined;
  };
}

interface SuggestionEvidence {
  requestHost?: string;
  requestPath?: string;
  responseStatusCode?: number;
  eventType?: CaptureRuleEventType;
  browserEventKind?: "window_error" | "resource_error";
  resourceHost?: string;
  resourcePath?: string;
  resourceFirstParty?: boolean;
}

function normalizeHostHeader(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return undefined;
  }

  const withoutPort = trimmed.split(":", 1)[0];
  return withoutPort && withoutPort.length > 0 ? withoutPort : undefined;
}

function normalizePath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  const pathWithoutQueryOrFragment = trimmed.split(/[?#]/, 1)[0] ?? "";
  if (pathWithoutQueryOrFragment.length === 0) {
    return "/";
  }

  return pathWithoutQueryOrFragment.startsWith("/") ? pathWithoutQueryOrFragment : `/${pathWithoutQueryOrFragment}`;
}

function normalizeUrl(value: string | undefined): { host?: string; path?: string; firstParty?: boolean } {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return {};
  }

  const relativePath = normalizePath(trimmed);
  if (relativePath !== undefined && trimmed.startsWith("/")) {
    return {
      path: relativePath,
      firstParty: true
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const normalizedPath = normalizePath(parsed.pathname);
      return {
        ...(parsed.hostname.length > 0 ? { host: parsed.hostname.toLowerCase() } : {}),
        ...(normalizedPath === undefined ? {} : { path: normalizedPath }),
      };
    }
  } catch {
    return {};
  }

  return {};
}

function toCaptureRuleEventType(value: string | undefined): CaptureRuleEventType | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = CaptureRuleEventTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function readFrontendException(bundle: CaptureRuleSuggestionBundle): Record<string, unknown> | null {
  const exceptions = bundle.context.frontend?.exceptions;
  if (!Array.isArray(exceptions) || exceptions.length === 0) {
    return null;
  }

  const candidate = exceptions[exceptions.length - 1];
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null;
}

function buildSuggestionEvidence(
  incident: CaptureRuleSuggestionIncident,
  bundle: CaptureRuleSuggestionBundle
): SuggestionEvidence {
  const requestHeaders = bundle.context.request?.headers;
  const requestHost =
    normalizeHostHeader(requestHeaders?.["host"]) ?? normalizeHostHeader(requestHeaders?.["x-forwarded-host"]);
  const requestPath = normalizePath(bundle.context.request?.path);
  const responseStatusCode =
    typeof bundle.context.response?.status_code === "number" && Number.isInteger(bundle.context.response.status_code)
      ? bundle.context.response.status_code
      : undefined;
  const eventType = toCaptureRuleEventType(bundle.signal.source_event_types[0]);
  const frontendException = readFrontendException(bundle);
  const browserEvent =
    typeof frontendException?.["browser_event"] === "object" && frontendException["browser_event"] !== null
      ? (frontendException["browser_event"] as Record<string, unknown>)
      : null;
  const browserEventKind =
    browserEvent?.["kind"] === "window_error" || browserEvent?.["kind"] === "resource_error"
      ? browserEvent["kind"]
      : undefined;
  const target =
    typeof browserEvent?.["target"] === "object" && browserEvent["target"] !== null
      ? (browserEvent["target"] as Record<string, unknown>)
      : null;
  const sourceUrl =
    typeof target?.["source_url"] === "string"
      ? target["source_url"]
      : typeof browserEvent?.["file_name"] === "string"
        ? browserEvent["file_name"]
        : undefined;
  const resourceUrl = normalizeUrl(sourceUrl);
  const resourceFirstParty =
    resourceUrl.firstParty ?? (resourceUrl.host !== undefined && requestHost !== undefined ? resourceUrl.host === requestHost : undefined);

  return {
    ...(requestHost === undefined ? {} : { requestHost }),
    ...(requestPath === undefined ? {} : { requestPath }),
    ...(responseStatusCode === undefined ? {} : { responseStatusCode }),
    ...(eventType === undefined ? {} : { eventType }),
    ...(browserEventKind === undefined ? {} : { browserEventKind }),
    ...(resourceUrl.host === undefined ? {} : { resourceHost: resourceUrl.host }),
    ...(resourceUrl.path === undefined ? {} : { resourcePath: resourceUrl.path }),
    ...(resourceFirstParty === undefined ? {} : { resourceFirstParty }),
  };
}

function confidenceRank(value: CaptureRuleSuggestionConfidence): number {
  switch (value) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function createSuggestion(input: {
  suggestion_id: string;
  label: string;
  recommended_action: CaptureRuleAction;
  confidence: CaptureRuleSuggestionConfidence;
  reason: string;
  requires_confirmation?: boolean;
  rule: CaptureRuleCreate;
}): CaptureRuleSuggestion {
  return CaptureRuleSuggestionSchema.parse({
    ...input,
    requires_confirmation: input.requires_confirmation ?? false
  });
}

export function buildCaptureRuleSuggestions(input: {
  incident: CaptureRuleSuggestionIncident;
  bundle: CaptureRuleSuggestionBundle;
}): CaptureRuleSuggestion[] {
  const evidence = buildSuggestionEvidence(input.incident, input.bundle);
  const suggestions: CaptureRuleSuggestion[] = [];

  if (
    evidence.eventType === "frontend_exception" &&
    evidence.browserEventKind === "resource_error" &&
    evidence.resourceHost !== undefined
  ) {
    if (evidence.resourceFirstParty === false) {
      suggestions.push(
        createSuggestion({
          suggestion_id: "primary_resource_host_demote",
          label: `Demote resource errors from ${evidence.resourceHost}`,
          recommended_action: "demote",
          confidence: "high",
          reason: "The primary event is an opaque browser resource-load error from a third-party host.",
          rule: {
            name: `Demote resource errors from ${evidence.resourceHost}`,
            description: "Known third-party browser resource-load noise.",
            enabled: true,
            action: "demote",
            matcher: {
              event_types: ["frontend_exception"],
              browser_event_kind: "resource_error",
              resource_url: { host: evidence.resourceHost }
            },
            sample_rate: null,
            sample_event_class: null,
            created_by_user_id: null,
            created_from_incident_id: input.incident.incident_id,
            created_from_event_id: null,
            expires_at: null
          }
        }),
        createSuggestion({
          suggestion_id: "primary_resource_host_drop",
          label: `Drop resource errors from ${evidence.resourceHost}`,
          recommended_action: "drop",
          confidence: "medium",
          reason: "This third-party resource host appears to be known browser noise and can be dropped entirely if you do not need repeat context.",
          requires_confirmation: true,
          rule: {
            name: `Drop resource errors from ${evidence.resourceHost}`,
            description: "Drop recurring third-party browser resource-load noise.",
            enabled: true,
            action: "drop",
            matcher: {
              event_types: ["frontend_exception"],
              browser_event_kind: "resource_error",
              resource_url: { host: evidence.resourceHost }
            },
            sample_rate: null,
            sample_event_class: null,
            created_by_user_id: null,
            created_from_incident_id: input.incident.incident_id,
            created_from_event_id: null,
            expires_at: null
          }
        })
      );
    } else {
      const resourceMatcher =
        evidence.resourceHost !== undefined
          ? { host: evidence.resourceHost, ...(evidence.resourcePath === undefined ? {} : { path_equals: evidence.resourcePath }) }
          : evidence.resourcePath === undefined
            ? undefined
            : { path_equals: evidence.resourcePath };
      if (resourceMatcher !== undefined) {
        suggestions.push(
          createSuggestion({
            suggestion_id: "primary_resource_sample",
            label:
              evidence.resourcePath !== undefined
                ? `Sample resource errors for ${evidence.resourcePath}`
                : "Sample recurring first-party resource errors",
            recommended_action: "sample",
            confidence: "medium",
            reason: "The primary event is a first-party browser resource-load failure. Sampling keeps incident visibility without letting repeated chunk failures flood the queue.",
            rule: {
              name:
                evidence.resourcePath !== undefined
                  ? `Sample resource errors for ${evidence.resourcePath}`
                  : "Sample recurring first-party resource errors",
              description: "Sample recurring first-party browser resource-load failures.",
              enabled: true,
              action: "sample",
              matcher: {
                event_types: ["frontend_exception"],
                browser_event_kind: "resource_error",
                resource_url: resourceMatcher
              },
              sample_rate: 0.25,
              sample_event_class: "preserve",
              created_by_user_id: null,
              created_from_incident_id: input.incident.incident_id,
              created_from_event_id: null,
              expires_at: null
            }
          })
        );
      }
    }
  }

  if (
    evidence.eventType === "frontend_exception" &&
    evidence.browserEventKind === "window_error" &&
    evidence.resourceHost !== undefined
  ) {
    suggestions.push(
      createSuggestion({
        suggestion_id: "primary_window_host_demote",
        label: `Demote window errors from ${evidence.resourceHost}`,
        recommended_action: "demote",
        confidence: "medium",
        reason: "The primary browser exception is opaque but tied to a specific host, so host-level demotion is safer than a broad ignore rule.",
        rule: {
          name: `Demote window errors from ${evidence.resourceHost}`,
          description: "Demote opaque browser window errors tied to a specific host.",
          enabled: true,
          action: "demote",
          matcher: {
            event_types: ["frontend_exception"],
            browser_event_kind: "window_error",
            resource_url: { host: evidence.resourceHost }
          },
          sample_rate: null,
          sample_event_class: null,
          created_by_user_id: null,
          created_from_incident_id: input.incident.incident_id,
          created_from_event_id: null,
          expires_at: null
        }
      })
    );
  }

  if (
    evidence.eventType === "request_event" &&
    evidence.requestPath !== undefined &&
    evidence.responseStatusCode !== undefined &&
    evidence.responseStatusCode >= 400 &&
    evidence.responseStatusCode <= 599
  ) {
    suggestions.push(
      createSuggestion({
        suggestion_id: "primary_request_status_sample",
        label: `Sample ${evidence.responseStatusCode} request events for ${evidence.requestPath}`,
        recommended_action: "sample",
        confidence: input.incident.occurrence_count >= 10 ? "high" : "medium",
        reason: "The incident is driven by repeated request failures on a narrow route, so deterministic sampling reduces incident churn without hiding the pattern entirely.",
        rule: {
          name: `Sample ${evidence.responseStatusCode} request events for ${evidence.requestPath}`,
          description: "Sample repeated request-failure incidents on a narrow route.",
          enabled: true,
          action: "sample",
          matcher: {
            event_types: ["request_event"],
            first_party: true,
            request_url: { path_equals: evidence.requestPath },
            status_codes: [evidence.responseStatusCode]
          },
          sample_rate: 0.25,
          sample_event_class: "preserve",
          created_by_user_id: null,
          created_from_incident_id: input.incident.incident_id,
          created_from_event_id: null,
          expires_at: null
        }
      })
    );
  }

  suggestions.push(
    createSuggestion({
      suggestion_id: "exact_fingerprint_demote",
      label: "Demote this exact fingerprint",
      recommended_action: "demote",
      confidence: suggestions.length > 0 ? "low" : "medium",
      reason: "Fingerprint-based demotion is the safest fallback when broader structured evidence is unavailable or ambiguous.",
      requires_confirmation: suggestions.length === 0,
      rule: {
        name: `Demote exact fingerprint ${input.incident.fingerprint}`,
        description: "Demote only this exact grouped fingerprint.",
        enabled: true,
        action: "demote",
        matcher: {
          ...(evidence.eventType === undefined ? {} : { event_types: [evidence.eventType] }),
          fingerprint: {
            version: input.incident.fingerprint_version,
            value: input.incident.fingerprint
          }
        },
        sample_rate: null,
        sample_event_class: null,
        created_by_user_id: null,
        created_from_incident_id: input.incident.incident_id,
        created_from_event_id: null,
        expires_at: null
      }
    })
  );

  const deduped = new Map<string, CaptureRuleSuggestion>();
  for (const suggestion of suggestions) {
    if (!deduped.has(suggestion.suggestion_id)) {
      deduped.set(suggestion.suggestion_id, suggestion);
    }
  }

  return [...deduped.values()].sort((left, right) => {
    const confidenceDifference = confidenceRank(right.confidence) - confidenceRank(left.confidence);
    if (confidenceDifference !== 0) {
      return confidenceDifference;
    }

    const actionRank = (action: CaptureRuleAction): number => {
      switch (action) {
        case "demote":
          return 3;
        case "sample":
          return 2;
        case "drop":
          return 1;
      }
    };

    const actionDifference = actionRank(right.recommended_action) - actionRank(left.recommended_action);
    if (actionDifference !== 0) {
      return actionDifference;
    }

    return left.suggestion_id.localeCompare(right.suggestion_id);
  });
}
