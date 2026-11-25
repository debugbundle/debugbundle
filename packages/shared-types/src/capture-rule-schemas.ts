import { z } from "zod";

const CAPTURE_RULE_EVENT_TYPES = [
  "backend_exception",
  "request_event",
  "log_event",
  "frontend_breadcrumb",
  "frontend_exception",
  "deploy_metadata",
  "error_suppressed",
  "probe_event",
  "diagnostic_context"
] as const;

const CAPTURE_RULE_RUNTIME_VALUES = [
  "browser",
  "node",
  "python",
  "php",
  "java",
  "go",
  "ruby",
  "dotnet",
  "rust",
  "android",
  "swift",
  "react-native",
  "unknown"
] as const;

export const CaptureRuleActionValues = ["demote", "sample", "drop", "threshold", "allow"] as const;
export const CaptureRuleActionSchema = z.enum(CaptureRuleActionValues);
export type CaptureRuleAction = z.infer<typeof CaptureRuleActionSchema>;

export const CaptureRuleSampleEventClassValues = ["preserve", "context"] as const;
export const CaptureRuleSampleEventClassSchema = z.enum(CaptureRuleSampleEventClassValues);
export type CaptureRuleSampleEventClass = z.infer<typeof CaptureRuleSampleEventClassSchema>;

export const CaptureRuleThresholdGroupByValues = ["resource", "fingerprint"] as const;
export const CaptureRuleThresholdGroupBySchema = z.enum(CaptureRuleThresholdGroupByValues);
export type CaptureRuleThresholdGroupBy = z.infer<typeof CaptureRuleThresholdGroupBySchema>;

export const CaptureRuleRuntimeSchema = z.enum(CAPTURE_RULE_RUNTIME_VALUES);
export type CaptureRuleRuntime = z.infer<typeof CaptureRuleRuntimeSchema>;

export const CaptureRuleEventTypeSchema = z.enum(CAPTURE_RULE_EVENT_TYPES);
export type CaptureRuleEventType = z.infer<typeof CaptureRuleEventTypeSchema>;

export const BrowserEventKindSchema = z.enum(["window_error", "resource_error"]);
export type BrowserEventKind = z.infer<typeof BrowserEventKindSchema>;

export const BrowserPageVisibilityStateSchema = z.enum([
  "visible",
  "hidden",
  "prerender",
  "unloaded"
]);
export type BrowserPageVisibilityState = z.infer<typeof BrowserPageVisibilityStateSchema>;

export const BrowserPageReadyStateSchema = z.enum(["loading", "interactive", "complete"]);
export type BrowserPageReadyState = z.infer<typeof BrowserPageReadyStateSchema>;

export const CaptureRuleClientKindSchema = z.enum(["human", "bot", "unknown"]);
export type CaptureRuleClientKind = z.infer<typeof CaptureRuleClientKindSchema>;

function normalizeOptionalTrimmedString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalLowercaseHost(value: string | undefined): string | undefined {
  const trimmed = normalizeOptionalTrimmedString(value);
  return trimmed?.toLowerCase();
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
  const trimmed = normalizeOptionalTrimmedString(value);
  if (trimmed === undefined) {
    return undefined;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export interface CaptureRuleUrlMatcher {
  host?: string;
  host_suffix?: string;
  path_prefix?: string;
  path_equals?: string;
}

export interface CaptureRuleExactUrlMatcher {
  host: string;
  path_equals: string;
}

export interface CaptureRuleBrowserTargetAttributes {
  rel?: string;
  as?: string;
  type?: string;
  media?: string;
  cross_origin?: string;
  async?: boolean;
  defer?: boolean;
  integrity_present?: boolean;
}

const BrowserTargetAttributesSchema = z
  .object({
    rel: z.string().trim().min(1).max(120).optional(),
    as: z.string().trim().min(1).max(120).optional(),
    type: z.string().trim().min(1).max(255).optional(),
    media: z.string().trim().min(1).max(500).optional(),
    cross_origin: z.string().trim().min(1).max(120).optional(),
    async: z.boolean().optional(),
    defer: z.boolean().optional(),
    integrity_present: z.boolean().optional()
  })
  .strict()
  .transform((value) => {
    const normalized: CaptureRuleBrowserTargetAttributes = {};
    for (const key of ["rel", "as", "type", "media", "cross_origin"] as const) {
      const attribute = normalizeOptionalTrimmedString(value[key]);
      if (attribute !== undefined) normalized[key] = attribute.toLowerCase();
    }
    for (const key of ["async", "defer", "integrity_present"] as const) {
      if (value[key] !== undefined) normalized[key] = value[key];
    }
    return normalized;
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Browser target attribute matchers must include at least one attribute."
  });

const UrlMatcherSchema = z
  .object({
    host: z.string().min(1).max(255).optional(),
    host_suffix: z.string().min(1).max(255).optional(),
    path_prefix: z.string().min(1).max(1024).optional(),
    path_equals: z.string().min(1).max(1024).optional()
  })
  .transform((value) => {
    const normalized: CaptureRuleUrlMatcher = {};
    const host = normalizeOptionalLowercaseHost(value.host);
    const hostSuffix = normalizeOptionalLowercaseHost(value.host_suffix);
    const pathPrefix = normalizeOptionalPath(value.path_prefix);
    const pathEquals = normalizeOptionalPath(value.path_equals);

    if (host !== undefined) {
      normalized.host = host;
    }
    if (hostSuffix !== undefined) {
      normalized.host_suffix = hostSuffix;
    }
    if (pathPrefix !== undefined) {
      normalized.path_prefix = pathPrefix;
    }
    if (pathEquals !== undefined) {
      normalized.path_equals = pathEquals;
    }

    return normalized;
  })
  .refine(
    (value) =>
      hasValue(value.host) ||
      hasValue(value.host_suffix) ||
      hasValue(value.path_prefix) ||
      hasValue(value.path_equals),
    {
      message: "URL matchers must include at least one host or path constraint."
    }
  );

const ExactUrlMatcherSchema = z
  .object({
    host: z.string().trim().min(1).max(255),
    path_equals: z.string().trim().min(1).max(1024)
  })
  .strict()
  .transform((value): CaptureRuleExactUrlMatcher => ({
    host: value.host.toLowerCase(),
    path_equals: value.path_equals.startsWith("/") ? value.path_equals : `/${value.path_equals}`
  }));

function normalizeExactUrlMatchers(
  values: readonly CaptureRuleExactUrlMatcher[] | undefined
): CaptureRuleExactUrlMatcher[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized: CaptureRuleExactUrlMatcher[] = [];
  for (const entry of values) {
    const key = `${entry.host}\0${entry.path_equals}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(entry);
  }
  return normalized;
}

const StatusRangeSchema = z
  .object({
    start: z.number().int().min(100).max(599),
    end: z.number().int().min(100).max(599)
  })
  .refine((value) => value.start <= value.end, {
    message: "Status range start must be less than or equal to end."
  });

export const CaptureRuleFingerprintSchema = z.object({
  version: z.string().min(1).max(32),
  value: z.string().min(1).max(256)
});

export type CaptureRuleFingerprint = z.infer<typeof CaptureRuleFingerprintSchema>;

function normalizeStringArray(values: readonly string[] | undefined): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function normalizeNumberArray(values: readonly number[] | undefined): number[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return Array.from(new Set(values)).sort((left, right) => left - right);
}

export interface CaptureRuleMatcher {
  event_types?: readonly CaptureRuleEventType[];
  services?: readonly string[];
  environments?: readonly string[];
  runtime?: readonly CaptureRuleRuntime[];
  first_party?: boolean;
  error_name?: string;
  message_contains?: string;
  message_equals?: string;
  browser_event_kind?: BrowserEventKind;
  browser_event_opaque?: boolean;
  browser_page_visibility_state?: BrowserPageVisibilityState;
  browser_page_ready_state?: BrowserPageReadyState;
  browser_target_tag_name?: string;
  browser_target_attributes?: CaptureRuleBrowserTargetAttributes;
  client_kind?: CaptureRuleClientKind;
  bot_family?: string;
  resource_url?: CaptureRuleUrlMatcher;
  resource_urls?: readonly CaptureRuleExactUrlMatcher[];
  request_url?: CaptureRuleUrlMatcher;
  status_codes?: readonly number[];
  status_ranges?: readonly { start: number; end: number }[];
  fingerprint?: CaptureRuleFingerprint;
}

export const CaptureRuleMatcherSchema = z
  .object({
    event_types: z.array(CaptureRuleEventTypeSchema).min(1).optional(),
    services: z.array(z.string().min(1).max(120)).min(1).optional(),
    environments: z.array(z.string().min(1).max(120)).min(1).optional(),
    runtime: z.array(CaptureRuleRuntimeSchema).min(1).optional(),
    first_party: z.boolean().optional(),
    error_name: z.string().min(1).max(120).optional(),
    message_contains: z.string().min(1).max(500).optional(),
    message_equals: z.string().min(1).max(500).optional(),
    browser_event_kind: BrowserEventKindSchema.optional(),
    browser_event_opaque: z.boolean().optional(),
    browser_page_visibility_state: BrowserPageVisibilityStateSchema.optional(),
    browser_page_ready_state: BrowserPageReadyStateSchema.optional(),
    browser_target_tag_name: z.string().trim().min(1).max(120).optional(),
    browser_target_attributes: BrowserTargetAttributesSchema.optional(),
    client_kind: CaptureRuleClientKindSchema.optional(),
    bot_family: z.string().min(1).max(120).optional(),
    resource_url: UrlMatcherSchema.optional(),
    resource_urls: z.array(ExactUrlMatcherSchema).min(1).max(10).optional(),
    request_url: UrlMatcherSchema.optional(),
    status_codes: z.array(z.number().int().min(100).max(599)).min(1).optional(),
    status_ranges: z.array(StatusRangeSchema).min(1).optional(),
    fingerprint: CaptureRuleFingerprintSchema.optional()
  })
  .transform((value) => {
    const normalized: CaptureRuleMatcher = {};
    const eventTypes = normalizeStringArray(value.event_types) as
      | CaptureRuleEventType[]
      | undefined;
    const services = normalizeStringArray(value.services);
    const environments = normalizeStringArray(value.environments);
    const runtime = normalizeStringArray(value.runtime) as CaptureRuleRuntime[] | undefined;
    const errorName = normalizeOptionalTrimmedString(value.error_name);
    const messageContains = normalizeOptionalTrimmedString(value.message_contains);
    const messageEquals = normalizeOptionalTrimmedString(value.message_equals);
    const botFamily = normalizeOptionalTrimmedString(value.bot_family);
    const browserTargetTagName = normalizeOptionalTrimmedString(value.browser_target_tag_name);
    const resourceUrls = normalizeExactUrlMatchers(value.resource_urls);
    const statusCodes = normalizeNumberArray(value.status_codes);

    if (eventTypes !== undefined) {
      normalized.event_types = eventTypes;
    }
    if (services !== undefined) {
      normalized.services = services;
    }
    if (environments !== undefined) {
      normalized.environments = environments;
    }
    if (runtime !== undefined) {
      normalized.runtime = runtime;
    }
    if (value.first_party !== undefined) {
      normalized.first_party = value.first_party;
    }
    if (errorName !== undefined) {
      normalized.error_name = errorName;
    }
    if (messageContains !== undefined) {
      normalized.message_contains = messageContains;
    }
    if (messageEquals !== undefined) {
      normalized.message_equals = messageEquals;
    }
    if (value.browser_event_kind !== undefined) {
      normalized.browser_event_kind = value.browser_event_kind;
    }
    if (value.browser_event_opaque !== undefined) {
      normalized.browser_event_opaque = value.browser_event_opaque;
    }
    if (value.browser_page_visibility_state !== undefined) {
      normalized.browser_page_visibility_state = value.browser_page_visibility_state;
    }
    if (value.browser_page_ready_state !== undefined) {
      normalized.browser_page_ready_state = value.browser_page_ready_state;
    }
    if (browserTargetTagName !== undefined) {
      normalized.browser_target_tag_name = browserTargetTagName.toLowerCase();
    }
    if (value.browser_target_attributes !== undefined) {
      normalized.browser_target_attributes = value.browser_target_attributes;
    }
    if (value.client_kind !== undefined) {
      normalized.client_kind = value.client_kind;
    }
    if (botFamily !== undefined) {
      normalized.bot_family = botFamily;
    }
    if (value.resource_url !== undefined) {
      normalized.resource_url = value.resource_url;
    }
    if (resourceUrls !== undefined) {
      normalized.resource_urls = resourceUrls;
    }
    if (value.request_url !== undefined) {
      normalized.request_url = value.request_url;
    }
    if (statusCodes !== undefined) {
      normalized.status_codes = statusCodes;
    }
    if (value.status_ranges !== undefined) {
      normalized.status_ranges = value.status_ranges;
    }
    if (value.fingerprint !== undefined) {
      normalized.fingerprint = value.fingerprint;
    }

    return normalized;
  })
  .superRefine((value, context) => {
    const narrowingKeys = [
      "services",
      "environments",
      "runtime",
      "first_party",
      "error_name",
      "message_contains",
      "message_equals",
      "browser_event_kind",
      "browser_event_opaque",
      "browser_page_visibility_state",
      "browser_page_ready_state",
      "browser_target_tag_name",
      "browser_target_attributes",
      "client_kind",
      "bot_family",
      "resource_url",
      "resource_urls",
      "request_url",
      "status_codes",
      "status_ranges",
      "fingerprint"
    ] as const;

    if (!narrowingKeys.some((key) => hasValue(value[key]))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Capture rules must include at least one narrowing field beyond event_types."
      });
    }

    if (hasValue(value.resource_url) && hasValue(value.resource_urls)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resource_urls"],
        message: "Capture rules cannot combine resource_url and resource_urls."
      });
    }

    if (value.browser_event_kind === "resource_error") {
      const hasResourceConstraint =
        hasValue(value.resource_url) ||
        hasValue(value.resource_urls) ||
        hasValue(value.fingerprint);
      if (!hasResourceConstraint) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Resource-error rules require a resource URL constraint or an exact fingerprint."
        });
      }
    }
  });

const CaptureRuleCoreObjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable(),
  enabled: z.boolean(),
  action: CaptureRuleActionSchema,
  matcher: CaptureRuleMatcherSchema,
  sample_rate: z.number().min(0).max(1).nullable(),
  sample_event_class: CaptureRuleSampleEventClassSchema.nullable(),
  threshold_count: z.number().int().min(2).max(1000).nullable().optional(),
  threshold_window_seconds: z.number().int().min(60).max(86400).nullable().optional(),
  threshold_group_by: CaptureRuleThresholdGroupBySchema.nullable().optional(),
  created_by_user_id: z.string().min(1).max(120).nullable(),
  created_from_incident_id: z.string().min(1).max(120).nullable(),
  created_from_event_id: z.string().min(1).max(120).nullable(),
  expires_at: z.string().datetime().nullable()
});

function validateResourceThresholdMatcher(
  matcher: CaptureRuleMatcher | undefined,
  context: z.RefinementCtx
): void {
  if (matcher === undefined) {
    return;
  }
  const allowsFrontendException =
    matcher.event_types === undefined || matcher.event_types.includes("frontend_exception");
  if (matcher.browser_event_kind !== "resource_error" || !allowsFrontendException) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["threshold_group_by"],
      message: "Resource threshold grouping requires a browser resource_error matcher."
    });
  }
}

function addCaptureRuleActionValidation<Schema extends z.ZodObject>(schema: Schema): Schema {
  return schema.superRefine((value, context) => {
    const action = value["action"];
    const sampleRate = value["sample_rate"];
    const sampleEventClass = value["sample_event_class"];
    const thresholdCount = value["threshold_count"];
    const thresholdWindowSeconds = value["threshold_window_seconds"];
    const thresholdGroupBy = value["threshold_group_by"];
    const matcher = value["matcher"] as CaptureRuleMatcher | undefined;

    if (action === "sample") {
      if (sampleRate === null || sampleRate === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rules require sample_rate."
        });
      }
      if (sampleEventClass === null || sampleEventClass === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_event_class"],
          message: "Sample rules require sample_event_class."
        });
      }
    } else {
      if (hasValue(sampleRate)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Only sample rules can set sample_rate."
        });
      }
      if (hasValue(sampleEventClass)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_event_class"],
          message: "Only sample rules can set sample_event_class."
        });
      }
    }

    if (action === "threshold") {
      if (!hasValue(thresholdCount)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_count"],
          message: "Threshold rules require threshold_count."
        });
      }
      if (!hasValue(thresholdWindowSeconds)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_window_seconds"],
          message: "Threshold rules require threshold_window_seconds."
        });
      }
      if (!hasValue(thresholdGroupBy)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_group_by"],
          message: "Threshold rules require threshold_group_by."
        });
      } else if (thresholdGroupBy === "resource") {
        validateResourceThresholdMatcher(matcher, context);
      }
      return;
    }

    if (hasValue(thresholdCount)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold_count"],
        message: "Only threshold rules can set threshold_count."
      });
    }
    if (hasValue(thresholdWindowSeconds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold_window_seconds"],
        message: "Only threshold rules can set threshold_window_seconds."
      });
    }
    if (hasValue(thresholdGroupBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold_group_by"],
        message: "Only threshold rules can set threshold_group_by."
      });
    }
  });
}

export const CaptureRuleSchema = addCaptureRuleActionValidation(
  CaptureRuleCoreObjectSchema.extend({
    id: z.string().guid(),
    project_id: z.string().min(1).max(120),
    scope_origin_ids: z.array(z.string().guid()).max(1000).nullable().optional(),
    filter_project_id: z.string().guid().nullable().optional(),
    hit_count: z.number().int().nonnegative(),
    last_matched_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime()
  })
);

export type CaptureRule = z.infer<typeof CaptureRuleSchema>;

export const CaptureRuleCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().default(null),
    enabled: z.boolean().default(true),
    action: CaptureRuleActionSchema,
    matcher: CaptureRuleMatcherSchema,
    sample_rate: z.number().min(0).max(1).nullable().optional(),
    sample_event_class: CaptureRuleSampleEventClassSchema.nullable().optional(),
    threshold_count: z.number().int().min(2).max(1000).nullable().optional(),
    threshold_window_seconds: z.number().int().min(60).max(86400).nullable().optional(),
    threshold_group_by: CaptureRuleThresholdGroupBySchema.nullable().optional(),
    created_by_user_id: z.string().min(1).max(120).nullable().default(null),
    created_from_incident_id: z.string().min(1).max(120).nullable().default(null),
    created_from_event_id: z.string().min(1).max(120).nullable().default(null),
    expires_at: z.string().datetime().nullable().default(null)
  })
  .superRefine((value, context) => {
    if (value.action === "sample") {
      if (value.sample_rate === undefined || value.sample_rate === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rules require sample_rate."
        });
      }
    } else {
      if (value.sample_rate !== undefined && value.sample_rate !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Only sample rules can set sample_rate."
        });
      }
      if (value.sample_event_class !== undefined && value.sample_event_class !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_event_class"],
          message: "Only sample rules can set sample_event_class."
        });
      }
    }

    if (value.action === "threshold") {
      if (!hasValue(value.threshold_count)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_count"],
          message: "Threshold rules require threshold_count."
        });
      }
      if (!hasValue(value.threshold_window_seconds)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_window_seconds"],
          message: "Threshold rules require threshold_window_seconds."
        });
      }
      if (!hasValue(value.threshold_group_by)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_group_by"],
          message: "Threshold rules require threshold_group_by."
        });
      } else if (value.threshold_group_by === "resource") {
        validateResourceThresholdMatcher(value.matcher, context);
      }
      return;
    }

    if (hasValue(value.threshold_count)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold_count"],
        message: "Only threshold rules can set threshold_count."
      });
    }
    if (hasValue(value.threshold_window_seconds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold_window_seconds"],
        message: "Only threshold rules can set threshold_window_seconds."
      });
    }
    if (hasValue(value.threshold_group_by)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold_group_by"],
        message: "Only threshold rules can set threshold_group_by."
      });
    }
  })
  .transform((value) => ({
    ...value,
    sample_rate: value.action === "sample" ? value.sample_rate! : null,
    sample_event_class: value.action === "sample" ? (value.sample_event_class ?? "preserve") : null,
    threshold_count: value.action === "threshold" ? value.threshold_count! : null,
    threshold_window_seconds: value.action === "threshold" ? value.threshold_window_seconds! : null,
    threshold_group_by: value.action === "threshold" ? value.threshold_group_by! : null
  }));

export type CaptureRuleCreate = Omit<
  z.infer<typeof CaptureRuleCreateSchema>,
  "threshold_count" | "threshold_window_seconds" | "threshold_group_by"
> & {
  threshold_count?: number | null;
  threshold_window_seconds?: number | null;
  threshold_group_by?: CaptureRuleThresholdGroupBy | null;
};

export const CaptureRuleUpdateSchema = z
  .object({
    project_scope: z.literal("current_project").optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
    action: CaptureRuleActionSchema.optional(),
    matcher: CaptureRuleMatcherSchema.optional(),
    sample_rate: z.number().min(0).max(1).nullable().optional(),
    sample_event_class: CaptureRuleSampleEventClassSchema.nullable().optional(),
    threshold_count: z.number().int().min(2).max(1000).nullable().optional(),
    threshold_window_seconds: z.number().int().min(60).max(86400).nullable().optional(),
    threshold_group_by: CaptureRuleThresholdGroupBySchema.nullable().optional(),
    expires_at: z.string().datetime().nullable().optional()
  })
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one capture rule field must be provided."
      });
    }

    const resolvedAction = value.action;
    if (resolvedAction === "sample") {
      if (!("sample_rate" in value) || value.sample_rate === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rule updates must include sample_rate when changing action to sample."
        });
      }
      if (!("sample_event_class" in value) || value.sample_event_class === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_event_class"],
          message:
            "Sample rule updates must include sample_event_class when changing action to sample."
        });
      }
    } else {
      if ("sample_rate" in value) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rule fields can only be updated while setting action to sample."
        });
      }
      if ("sample_event_class" in value) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_event_class"],
          message: "Sample rule fields can only be updated while setting action to sample."
        });
      }
    }

    if (resolvedAction === "threshold") {
      if (!("threshold_count" in value) || !hasValue(value.threshold_count)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_count"],
          message:
            "Threshold rule updates must include threshold_count when changing action to threshold."
        });
      }
      if (!("threshold_window_seconds" in value) || !hasValue(value.threshold_window_seconds)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_window_seconds"],
          message:
            "Threshold rule updates must include threshold_window_seconds when changing action to threshold."
        });
      }
      if (!("threshold_group_by" in value) || !hasValue(value.threshold_group_by)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold_group_by"],
          message:
            "Threshold rule updates must include threshold_group_by when changing action to threshold."
        });
      } else if (value.threshold_group_by === "resource" && value.matcher !== undefined) {
        validateResourceThresholdMatcher(value.matcher, context);
      }
      return;
    }

    if ("threshold_count" in value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold_count"],
        message: "Threshold rule fields can only be updated while setting action to threshold."
      });
    }
    if ("threshold_window_seconds" in value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold_window_seconds"],
        message: "Threshold rule fields can only be updated while setting action to threshold."
      });
    }
    if ("threshold_group_by" in value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold_group_by"],
        message: "Threshold rule fields can only be updated while setting action to threshold."
      });
    }
  });

export type CaptureRuleUpdate = z.infer<typeof CaptureRuleUpdateSchema>;

export const CaptureRuleResponseSchema = z.object({
  rule: CaptureRuleSchema
});

export type CaptureRuleResponse = z.infer<typeof CaptureRuleResponseSchema>;

export const CaptureRulesResponseSchema = z.object({
  access_mode: z.enum(["manage", "preview"]),
  rules: z.array(CaptureRuleSchema)
});

export type CaptureRulesResponse = z.infer<typeof CaptureRulesResponseSchema>;

export const CaptureRulesFileSchema = z.object({
  version: z.literal(1),
  rules: z.array(CaptureRuleSchema)
});

export type CaptureRulesFile = z.infer<typeof CaptureRulesFileSchema>;
