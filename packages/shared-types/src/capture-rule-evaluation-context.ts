import { z } from "zod";
import { browserResourceLocation } from "./browser-resource.js";
import {
  BrowserEventKindSchema,
  BrowserPageReadyStateSchema,
  BrowserPageVisibilityStateSchema,
  CaptureRuleClientKindSchema,
  CaptureRuleEventTypeSchema,
  CaptureRuleFingerprintSchema,
  CaptureRuleRuntimeSchema,
  type CaptureRuleBrowserTargetAttributes,
  type CaptureRuleClientKind,
  type CaptureRuleEventType,
  type CaptureRuleFingerprint,
  type CaptureRuleRuntime
} from "./capture-rule-schemas.js";

const CaptureRuleEvaluationUrlSchema = z.object({
  host: z
    .string()
    .min(1)
    .transform((value) => value.toLowerCase())
    .optional(),
  path: z
    .string()
    .min(1)
    .transform((value) => (value.startsWith("/") ? value : `/${value}`))
});

export type CaptureRuleEvaluationUrl = z.infer<typeof CaptureRuleEvaluationUrlSchema>;

export const CaptureRuleEvaluationContextSchema = z.object({
  project_id: z.string().min(1).max(120),
  event_id: z.string().guid(),
  event_type: CaptureRuleEventTypeSchema,
  service: z.string().min(1).optional(),
  service_aliases: z.array(z.string().min(1)).max(1000).optional(),
  environment: z.string().min(1).optional(),
  runtime: CaptureRuleRuntimeSchema,
  first_party: z.boolean().optional(),
  error_name: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  browser_event_kind: BrowserEventKindSchema.optional(),
  browser_event_opaque: z.boolean().optional(),
  browser_page_visibility_state: BrowserPageVisibilityStateSchema.optional(),
  browser_page_ready_state: BrowserPageReadyStateSchema.optional(),
  browser_target_tag_name: z.string().min(1).max(120).optional(),
  browser_target_attributes: z
    .object({
      rel: z.string().min(1).max(120).optional(),
      as: z.string().min(1).max(120).optional(),
      type: z.string().min(1).max(255).optional(),
      media: z.string().min(1).max(500).optional(),
      cross_origin: z.string().min(1).max(120).optional(),
      async: z.boolean().optional(),
      defer: z.boolean().optional(),
      integrity_present: z.boolean().optional()
    })
    .optional(),
  client_kind: CaptureRuleClientKindSchema.optional(),
  bot_family: z.string().min(1).max(120).optional(),
  resource_url: CaptureRuleEvaluationUrlSchema.optional(),
  request_url: CaptureRuleEvaluationUrlSchema.optional(),
  status_code: z.number().int().min(0).max(599).optional(),
  fingerprint: CaptureRuleFingerprintSchema.optional(),
  // Server-derived prior versions keep installed exact-match rules effective.
  fingerprint_aliases: z.array(CaptureRuleFingerprintSchema).max(2).optional()
});

export type CaptureRuleEvaluationContext = z.infer<typeof CaptureRuleEvaluationContextSchema>;

export type CaptureRuleEvaluableEvent = {
  event_id: string;
  event_type: CaptureRuleEventType;
  service: {
    name: string;
    environment: string;
    runtime?: string | null;
  };
  payload: Record<string, unknown>;
};

function normalizeRuntime(value: string | null | undefined): CaptureRuleRuntime {
  switch (value?.trim().toLowerCase()) {
    case "browser":
      return "browser";
    case "node":
    case "nodejs":
      return "node";
    case "python":
      return "python";
    case "php":
      return "php";
    case "java":
    case "jvm":
      return "java";
    case "go":
    case "golang":
      return "go";
    case "ruby":
      return "ruby";
    case "dotnet":
    case ".net":
      return "dotnet";
    case "rust":
      return "rust";
    case "android":
      return "android";
    case "swift":
    case "ios":
      return "swift";
    case "react-native":
    case "react_native":
      return "react-native";
    default:
      return "unknown";
  }
}

function normalizeRoutePath(value: string | null | undefined): string | undefined {
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

function normalizeEvaluationUrl(value: string | null | undefined): {
  url?: CaptureRuleEvaluationUrl;
  first_party?: boolean;
} {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return {};
  }

  const relativePath = normalizeRoutePath(trimmed);
  if (relativePath !== undefined && trimmed.startsWith("/")) {
    return {
      url: { path: relativePath },
      first_party: true
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return {
        url: {
          host: parsed.hostname.length > 0 ? parsed.hostname.toLowerCase() : undefined,
          path: normalizeRoutePath(parsed.pathname) ?? "/"
        },
        first_party: false
      };
    }
  } catch {
    if (relativePath !== undefined) {
      return {
        url: { path: relativePath },
        first_party: true
      };
    }
  }

  return {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readBrowserTargetString(value: unknown, maxLength: number): string | undefined {
  const normalized = readString(value)?.trim().toLowerCase();
  // Installed SDKs permit longer DOM values. Omit them from matching, rather
  // than rejecting their event or truncating into an unintended rule match.
  return normalized !== undefined && normalized.length <= maxLength ? normalized : undefined;
}

function readBrowserTargetAttributes(
  value: Record<string, unknown> | undefined
): CaptureRuleBrowserTargetAttributes | undefined {
  if (value === undefined) return undefined;
  const attributes: CaptureRuleBrowserTargetAttributes = {};
  for (const [key, maxLength] of [
    ["rel", 120],
    ["as", 120],
    ["type", 255],
    ["media", 500],
    ["cross_origin", 120]
  ] as const) {
    const attribute = readBrowserTargetString(value[key], maxLength);
    if (attribute !== undefined) attributes[key] = attribute;
  }
  for (const key of ["async", "defer", "integrity_present"] as const) {
    const attribute = readBoolean(value[key]);
    if (attribute !== undefined) attributes[key] = attribute;
  }
  return Object.keys(attributes).length === 0 ? undefined : attributes;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readHeaderValue(
  headers: Record<string, unknown> | undefined,
  name: string
): string | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return readString(value);
    }
  }

  return undefined;
}

function readDeviceUserAgent(payload: Record<string, unknown>): string | undefined {
  const device = readRecord(payload["device"]);
  return readString(device?.["user_agent"]);
}

export function classifyCaptureRuleClientFromUserAgent(userAgent: string | null | undefined): {
  client_kind: CaptureRuleClientKind;
  bot_family?: string;
} {
  if (userAgent === null || userAgent === undefined) {
    return { client_kind: "unknown" };
  }

  const lower = userAgent.toLowerCase();
  const knownBots: Array<{ family: string; markers: readonly string[] }> = [
    { family: "Googlebot", markers: ["googlebot", "adsbot-google", "google-inspectiontool"] },
    { family: "Bingbot", markers: ["bingbot", "msnbot"] },
    { family: "DuckDuckBot", markers: ["duckduckbot"] },
    { family: "Applebot", markers: ["applebot"] },
    { family: "YandexBot", markers: ["yandexbot"] },
    { family: "Baiduspider", markers: ["baiduspider"] },
    { family: "FacebookBot", markers: ["facebookexternalhit", "facebot"] },
    { family: "LinkedInBot", markers: ["linkedinbot"] },
    { family: "TwitterBot", markers: ["twitterbot"] },
    { family: "Slackbot", markers: ["slackbot"] }
  ];

  const knownBot = knownBots.find((entry) =>
    entry.markers.some((marker) => lower.includes(marker))
  );
  if (knownBot !== undefined) {
    return { client_kind: "bot", bot_family: knownBot.family };
  }

  if (["bot", "crawler", "spider", "slurp"].some((marker) => lower.includes(marker))) {
    return { client_kind: "bot", bot_family: "OtherBot" };
  }

  return { client_kind: "human" };
}

function readEventUserAgent(event: CaptureRuleEvaluableEvent): string | undefined {
  const deviceUserAgent = readDeviceUserAgent(event.payload);
  if (deviceUserAgent !== undefined) {
    return deviceUserAgent;
  }

  if (event.event_type === "backend_exception") {
    const request = readRecord(event.payload["request"]);
    return readHeaderValue(readRecord(request?.["headers"]), "user-agent");
  }

  if (event.event_type === "request_event") {
    return readHeaderValue(readRecord(event.payload["headers"]), "user-agent");
  }

  return undefined;
}

export function buildCaptureRuleEvaluationContext(input: {
  project_id: string;
  service_aliases?: string[];
  event: CaptureRuleEvaluableEvent;
  fingerprint?: CaptureRuleFingerprint;
  fingerprint_aliases?: CaptureRuleFingerprint[];
}): CaptureRuleEvaluationContext {
  const context: CaptureRuleEvaluationContext = {
    project_id: input.project_id,
    event_id: input.event.event_id,
    event_type: input.event.event_type,
    service: input.event.service.name,
    ...(input.service_aliases === undefined ? {} : { service_aliases: input.service_aliases }),
    environment: input.event.service.environment,
    runtime: normalizeRuntime(input.event.service.runtime),
    ...classifyCaptureRuleClientFromUserAgent(readEventUserAgent(input.event)),
    ...(input.fingerprint === undefined ? {} : { fingerprint: input.fingerprint }),
    ...(input.fingerprint_aliases === undefined
      ? {}
      : { fingerprint_aliases: input.fingerprint_aliases })
  };

  switch (input.event.event_type) {
    case "backend_exception": {
      const request = readRecord(input.event.payload["request"]);
      const response = readRecord(input.event.payload["response"]);
      const requestUrl = normalizeEvaluationUrl(readString(request?.["path"]));

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        first_party: true,
        error_name: readString(input.event.payload["name"]),
        message: readString(input.event.payload["message"]),
        request_url: requestUrl.url,
        status_code: readNumber(response?.["status_code"])
      });
    }

    case "request_event": {
      const requestUrl = normalizeEvaluationUrl(readString(input.event.payload["path"]));

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        first_party: requestUrl.first_party ?? true,
        request_url: requestUrl.url,
        status_code: readNumber(input.event.payload["response_status"])
      });
    }

    case "log_event":
      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        message: readString(input.event.payload["message"])
      });

    case "frontend_exception": {
      const browserEvent = readRecord(input.event.payload["browser_event"]);
      const target = readRecord(browserEvent?.["target"]);
      const page = readRecord(browserEvent?.["page"]);
      const targetAttributes = readBrowserTargetAttributes(readRecord(target?.["attributes"]));
      const browserEventKind = browserEvent?.["kind"];
      const resourceSource =
        typeof target?.["source_url"] === "string"
          ? target["source_url"]
          : typeof browserEvent?.["file_name"] === "string"
            ? browserEvent["file_name"]
            : undefined;
      const resourceUrl = normalizeEvaluationUrl(resourceSource);
      const resourceLocation = browserResourceLocation(resourceSource, page?.["url"]);
      const visibilityState = page?.["visibility_state"];
      const readyState = page?.["ready_state"];
      const targetTagName = readBrowserTargetString(target?.["tag_name"], 120);

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        ...(resourceLocation?.first_party == null
          ? {}
          : { first_party: resourceLocation.first_party }),
        error_name: readString(input.event.payload["name"]),
        message: readString(input.event.payload["message"]),
        browser_event_kind:
          browserEventKind === "window_error" || browserEventKind === "resource_error"
            ? browserEventKind
            : undefined,
        ...(typeof browserEvent?.["opaque"] === "boolean"
          ? { browser_event_opaque: browserEvent["opaque"] }
          : {}),
        ...(visibilityState === "visible" ||
        visibilityState === "hidden" ||
        visibilityState === "prerender" ||
        visibilityState === "unloaded"
          ? { browser_page_visibility_state: visibilityState }
          : {}),
        ...(readyState === "loading" || readyState === "interactive" || readyState === "complete"
          ? { browser_page_ready_state: readyState }
          : {}),
        ...(targetTagName === undefined ? {} : { browser_target_tag_name: targetTagName }),
        ...(targetAttributes === undefined ? {} : { browser_target_attributes: targetAttributes }),
        resource_url:
          resourceLocation === null
            ? resourceUrl.url
            : {
                ...(resourceLocation.host === null ? {} : { host: resourceLocation.host }),
                path: resourceLocation.path
              }
      });
    }

    case "frontend_breadcrumb": {
      if (input.event.payload["breadcrumb_type"] !== "network_request") {
        return CaptureRuleEvaluationContextSchema.parse(context);
      }

      const data = readRecord(input.event.payload["data"]);
      const requestUrl = normalizeEvaluationUrl(readString(data?.["url"]));

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        ...(requestUrl.first_party === undefined ? {} : { first_party: requestUrl.first_party }),
        request_url: requestUrl.url,
        status_code: readNumber(data?.["status_code"])
      });
    }

    default:
      return CaptureRuleEvaluationContextSchema.parse(context);
  }
}
