import { z } from "zod";
import { buildBrowserResourceSuggestions } from "./browser-resource-suggestions.js";
import { describeBrowserResource, type BrowserResource } from "./browser-resource.js";

import {
  CaptureRuleActionSchema,
  CaptureRuleCreateSchema,
  CaptureRuleEventTypeSchema,
  classifyCaptureRuleClientFromUserAgent,
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
  created_rule_id: z.string().min(1).max(120).nullable().default(null),
  created_rule_enabled: z.boolean().nullable().default(null),
  rule: CaptureRuleCreateSchema
});

export type CaptureRuleSuggestion = z.infer<typeof CaptureRuleSuggestionSchema>;

export const CaptureRuleSuggestionsResponseSchema = z.object({
  access_mode: z.enum(["manage", "preview"]).optional(),
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
  project?:
    | {
        environment?: string | null;
      }
    | null
    | undefined;
  service?:
    | {
        name?: string | null;
      }
    | null
    | undefined;
  signal: {
    signal_type: string;
    source_event_types: string[];
    fingerprint: string;
  };
  context: {
    resource_failure?: Pick<BrowserResource, "host" | "path" | "type"> | null | undefined;
    error?: { name: string; message: string } | null | undefined;
    request?:
      | {
          path?: string;
          headers?: Record<string, unknown>;
        }
      | null
      | undefined;
    response?:
      | {
          status_code?: number;
        }
      | null
      | undefined;
    frontend?:
      | {
          exceptions?: unknown[];
        }
      | null
      | undefined;
    device?:
      | {
          user_agent?: string | null;
        }
      | null
      | undefined;
  };
}

interface SuggestionEvidence {
  serviceName?: string;
  environment?: string;
  requestPath?: string;
  responseStatusCode?: number;
  eventType?: CaptureRuleEventType;
  errorName?: string;
  message?: string;
  browserEventKind?: "window_error" | "resource_error";
  browserEventOpaque?: boolean;
  resourceHost?: string;
  clientKind?: "human" | "bot" | "unknown";
  botFamily?: string;
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

  return pathWithoutQueryOrFragment.startsWith("/")
    ? pathWithoutQueryOrFragment
    : `/${pathWithoutQueryOrFragment}`;
}

function normalizeUrl(value: string | undefined): {
  host?: string;
  path?: string;
  firstParty?: boolean;
} {
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
        ...(normalizedPath === undefined ? {} : { path: normalizedPath })
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

function readFrontendException(
  bundle: CaptureRuleSuggestionBundle
): Record<string, unknown> | null {
  const exceptions = bundle.context.frontend?.exceptions;
  if (!Array.isArray(exceptions) || exceptions.length === 0) {
    return null;
  }

  const resource = bundle.context.resource_failure;
  const primaryError = bundle.context.error;
  // Related exceptions can follow the primary signal; only its resource may seed a noise rule.
  const candidates =
    resource == null && primaryError == null
      ? exceptions
      : exceptions.filter((value) => {
          if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
          const exception = value as Record<string, unknown>;
          if (resource == null)
            return (
              exception["name"] === primaryError!.name &&
              exception["message"] === primaryError!.message
            );
          const candidate = describeBrowserResource(exception["browser_event"]);
          return (
            candidate !== null &&
            candidate.host === resource.host &&
            candidate.path === resource.path &&
            candidate.type === resource.type
          );
        });
  const candidate = candidates[candidates.length - 1];
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null;
}

function buildSuggestionEvidence(
  incident: CaptureRuleSuggestionIncident,
  bundle: CaptureRuleSuggestionBundle
): SuggestionEvidence {
  const serviceName =
    typeof bundle.service?.name === "string" && bundle.service.name.trim().length > 0
      ? bundle.service.name.trim()
      : undefined;
  const environment =
    typeof bundle.project?.environment === "string" && bundle.project.environment.trim().length > 0
      ? bundle.project.environment.trim()
      : undefined;

  const requestPath = normalizePath(bundle.context.request?.path);
  const responseStatusCode =
    typeof bundle.context.response?.status_code === "number" &&
    Number.isInteger(bundle.context.response.status_code)
      ? bundle.context.response.status_code
      : undefined;
  const eventType =
    bundle.context.resource_failure != null && bundle.signal.signal_type === "frontend_exception"
      ? "frontend_exception"
      : toCaptureRuleEventType(bundle.signal.source_event_types[0]);
  const frontendException = readFrontendException(bundle);
  const browserEvent =
    typeof frontendException?.["browser_event"] === "object" &&
    frontendException["browser_event"] !== null
      ? (frontendException["browser_event"] as Record<string, unknown>)
      : null;
  const browserEventKind =
    browserEvent?.["kind"] === "window_error" || browserEvent?.["kind"] === "resource_error"
      ? browserEvent["kind"]
      : undefined;
  const browserEventOpaque =
    typeof browserEvent?.["opaque"] === "boolean" ? browserEvent["opaque"] : undefined;
  const errorName =
    typeof frontendException?.["name"] === "string" ? frontendException["name"].trim() : undefined;
  const message =
    typeof frontendException?.["message"] === "string"
      ? frontendException["message"].trim()
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

  const client = classifyCaptureRuleClientFromUserAgent(
    typeof bundle.context.device?.user_agent === "string"
      ? bundle.context.device.user_agent
      : undefined
  );

  return {
    ...(serviceName === undefined ? {} : { serviceName }),
    ...(environment === undefined ? {} : { environment }),
    ...(requestPath === undefined ? {} : { requestPath }),
    ...(responseStatusCode === undefined ? {} : { responseStatusCode }),
    ...(eventType === undefined ? {} : { eventType }),
    ...(errorName === undefined || errorName.length === 0 ? {} : { errorName }),
    ...(message === undefined || message.length === 0 ? {} : { message }),
    ...(browserEventKind === undefined ? {} : { browserEventKind }),
    ...(browserEventOpaque === undefined ? {} : { browserEventOpaque }),
    ...(resourceUrl.host === undefined ? {} : { resourceHost: resourceUrl.host }),
    clientKind: client.client_kind,
    ...(client.bot_family === undefined ? {} : { botFamily: client.bot_family })
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
    evidence.browserEventKind === "resource_error"
  ) {
    return buildBrowserResourceSuggestions({
      browserEvent: readFrontendException(input.bundle)?.["browser_event"],
      service: evidence.serviceName,
      environment: evidence.environment,
      incident: input.incident
    }).map((suggestion) => CaptureRuleSuggestionSchema.parse(suggestion));
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
        reason:
          "The primary browser exception is opaque but tied to a specific host, so host-level demotion is safer than a broad ignore rule.",
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
    evidence.eventType === "frontend_exception" &&
    evidence.browserEventKind === "window_error" &&
    evidence.browserEventOpaque === true &&
    evidence.message === "Window error"
  ) {
    suggestions.push(
      createSuggestion({
        suggestion_id: "opaque_window_generic_demote",
        label: "Demote opaque browser Window errors",
        recommended_action: "demote",
        confidence: "medium",
        reason:
          "The primary browser exception is an opaque Window error with no usable application stack, scoped to the observed service and environment when available.",
        requires_confirmation: true,
        rule: {
          name: "Demote opaque browser Window errors",
          description:
            "Demote generic opaque browser Window error noise after confirming it is not an application exception.",
          enabled: true,
          action: "demote",
          matcher: {
            event_types: ["frontend_exception"],
            runtime: ["browser"],
            ...(evidence.serviceName === undefined ? {} : { services: [evidence.serviceName] }),
            ...(evidence.environment === undefined ? {} : { environments: [evidence.environment] }),
            browser_event_kind: "window_error",
            browser_event_opaque: true,
            message_equals: "Window error"
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
    evidence.eventType === "frontend_exception" &&
    evidence.clientKind === "bot" &&
    evidence.botFamily !== undefined &&
    evidence.message === "Unhandled promise rejection"
  ) {
    suggestions.push(
      createSuggestion({
        suggestion_id: "bot_unhandled_rejection_demote",
        label: `Demote ${evidence.botFamily} unhandled promise rejections`,
        recommended_action: "demote",
        confidence: "medium",
        reason:
          "The incident came from a known bot user agent and has only the generic unhandled-rejection message, so bot-scoped demotion is safer than a broad rejection rule.",
        requires_confirmation: true,
        rule: {
          name: `Demote ${evidence.botFamily} unhandled promise rejections`,
          description: "Demote bot-scoped generic browser unhandled promise rejection noise.",
          enabled: true,
          action: "demote",
          matcher: {
            event_types: ["frontend_exception"],
            runtime: ["browser"],
            ...(evidence.serviceName === undefined ? {} : { services: [evidence.serviceName] }),
            ...(evidence.environment === undefined ? {} : { environments: [evidence.environment] }),
            client_kind: "bot",
            bot_family: evidence.botFamily,
            message_equals: "Unhandled promise rejection"
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
        reason:
          "The incident is driven by repeated request failures on a narrow route, so deterministic sampling reduces incident churn without hiding the pattern entirely.",
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
      reason:
        "Fingerprint-based demotion is the safest fallback when broader structured evidence is unavailable or ambiguous.",
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

    const actionDifference =
      actionRank(right.recommended_action) - actionRank(left.recommended_action);
    if (actionDifference !== 0) {
      return actionDifference;
    }

    return left.suggestion_id.localeCompare(right.suggestion_id);
  });
}
