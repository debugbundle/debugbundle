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
] as const;

const CAPTURE_RULE_RUNTIME_VALUES = [
  "browser",
  "node",
  "python",
  "php",
  "java",
  "go",
  "ruby",
  "unknown",
] as const;

export const CaptureRuleActionValues = ["demote", "sample", "drop"] as const;
export const CaptureRuleActionSchema = z.enum(CaptureRuleActionValues);
export type CaptureRuleAction = z.infer<typeof CaptureRuleActionSchema>;

export const CaptureRuleSampleEventClassValues = ["preserve", "context"] as const;
export const CaptureRuleSampleEventClassSchema = z.enum(CaptureRuleSampleEventClassValues);
export type CaptureRuleSampleEventClass = z.infer<typeof CaptureRuleSampleEventClassSchema>;

export const CaptureRuleRuntimeSchema = z.enum(CAPTURE_RULE_RUNTIME_VALUES);
export type CaptureRuleRuntime = z.infer<typeof CaptureRuleRuntimeSchema>;

export const CaptureRuleEventTypeSchema = z.enum(CAPTURE_RULE_EVENT_TYPES);
export type CaptureRuleEventType = z.infer<typeof CaptureRuleEventTypeSchema>;

export const BrowserEventKindSchema = z.enum(["window_error", "resource_error"]);
export type BrowserEventKind = z.infer<typeof BrowserEventKindSchema>;

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

const UrlMatcherSchema = z
  .object({
    host: z.string().min(1).max(255).optional(),
    host_suffix: z.string().min(1).max(255).optional(),
    path_prefix: z.string().min(1).max(1024).optional(),
    path_equals: z.string().min(1).max(1024).optional(),
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
  .refine((value) => hasValue(value.host) || hasValue(value.host_suffix) || hasValue(value.path_prefix) || hasValue(value.path_equals), {
    message: "URL matchers must include at least one host or path constraint.",
  });

const StatusRangeSchema = z
  .object({
    start: z.number().int().min(100).max(599),
    end: z.number().int().min(100).max(599),
  })
  .refine((value) => value.start <= value.end, {
    message: "Status range start must be less than or equal to end.",
  });

export const CaptureRuleFingerprintSchema = z.object({
  version: z.string().min(1).max(32),
  value: z.string().min(1).max(256),
});

export type CaptureRuleFingerprint = z.infer<typeof CaptureRuleFingerprintSchema>;

function normalizeStringArray(values: readonly string[] | undefined): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
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
  client_kind?: CaptureRuleClientKind;
  bot_family?: string;
  resource_url?: CaptureRuleUrlMatcher;
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
    client_kind: CaptureRuleClientKindSchema.optional(),
    bot_family: z.string().min(1).max(120).optional(),
    resource_url: UrlMatcherSchema.optional(),
    request_url: UrlMatcherSchema.optional(),
    status_codes: z.array(z.number().int().min(100).max(599)).min(1).optional(),
    status_ranges: z.array(StatusRangeSchema).min(1).optional(),
    fingerprint: CaptureRuleFingerprintSchema.optional(),
  })
  .transform((value) => {
    const normalized: CaptureRuleMatcher = {};
    const eventTypes = normalizeStringArray(value.event_types) as CaptureRuleEventType[] | undefined;
    const services = normalizeStringArray(value.services);
    const environments = normalizeStringArray(value.environments);
    const runtime = normalizeStringArray(value.runtime) as CaptureRuleRuntime[] | undefined;
    const errorName = normalizeOptionalTrimmedString(value.error_name);
    const messageContains = normalizeOptionalTrimmedString(value.message_contains);
    const messageEquals = normalizeOptionalTrimmedString(value.message_equals);
    const botFamily = normalizeOptionalTrimmedString(value.bot_family);
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
    if (value.client_kind !== undefined) {
      normalized.client_kind = value.client_kind;
    }
    if (botFamily !== undefined) {
      normalized.bot_family = botFamily;
    }
    if (value.resource_url !== undefined) {
      normalized.resource_url = value.resource_url;
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
      "client_kind",
      "bot_family",
      "resource_url",
      "request_url",
      "status_codes",
      "status_ranges",
      "fingerprint",
    ] as const;

    if (!narrowingKeys.some((key) => hasValue(value[key]))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Capture rules must include at least one narrowing field beyond event_types.",
      });
    }

    if (value.browser_event_kind === "resource_error") {
      const hasResourceConstraint = hasValue(value.resource_url) || hasValue(value.fingerprint);
      if (!hasResourceConstraint) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Resource-error rules require a resource URL constraint or an exact fingerprint.",
        });
      }
    }
  });

const CaptureRuleCoreObjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable(),
    enabled: z.boolean(),
    action: CaptureRuleActionSchema,
    matcher: CaptureRuleMatcherSchema,
    sample_rate: z.number().min(0).max(1).nullable(),
    sample_event_class: CaptureRuleSampleEventClassSchema.nullable(),
    created_by_user_id: z.string().min(1).max(120).nullable(),
    created_from_incident_id: z.string().min(1).max(120).nullable(),
    created_from_event_id: z.string().min(1).max(120).nullable(),
    expires_at: z.string().datetime().nullable(),
  });

function addCaptureRuleActionValidation<Schema extends z.AnyZodObject>(schema: Schema): z.ZodEffects<Schema> {
  return schema.superRefine((value, context) => {
    if (value["action"] === "sample") {
      if (value["sample_rate"] === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rules require sample_rate.",
        });
      }
      if (value["sample_event_class"] === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_event_class"],
          message: "Sample rules require sample_event_class.",
        });
      }
      return;
    }

    if (value["sample_rate"] !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_rate"],
        message: "Only sample rules can set sample_rate.",
      });
    }

    if (value["sample_event_class"] !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_event_class"],
        message: "Only sample rules can set sample_event_class.",
      });
    }
  });
}

export const CaptureRuleSchema = addCaptureRuleActionValidation(
  CaptureRuleCoreObjectSchema.extend({
  id: z.string().uuid(),
  project_id: z.string().min(1).max(120),
  hit_count: z.number().int().nonnegative(),
  last_matched_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
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
    created_by_user_id: z.string().min(1).max(120).nullable().default(null),
    created_from_incident_id: z.string().min(1).max(120).nullable().default(null),
    created_from_event_id: z.string().min(1).max(120).nullable().default(null),
    expires_at: z.string().datetime().nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.action === "sample") {
      if (value.sample_rate === undefined || value.sample_rate === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rules require sample_rate.",
        });
      }
      return;
    }

    if (value.sample_rate !== undefined && value.sample_rate !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_rate"],
        message: "Only sample rules can set sample_rate.",
      });
    }

    if (value.sample_event_class !== undefined && value.sample_event_class !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_event_class"],
        message: "Only sample rules can set sample_event_class.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    sample_rate: value.action === "sample" ? value.sample_rate! : null,
    sample_event_class: value.action === "sample" ? (value.sample_event_class ?? "preserve") : null,
  }));

export type CaptureRuleCreate = z.infer<typeof CaptureRuleCreateSchema>;

export const CaptureRuleUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
    action: CaptureRuleActionSchema.optional(),
    matcher: CaptureRuleMatcherSchema.optional(),
    sample_rate: z.number().min(0).max(1).nullable().optional(),
    sample_event_class: CaptureRuleSampleEventClassSchema.nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one capture rule field must be provided.",
      });
    }

    const resolvedAction = value.action;
    if (resolvedAction === "sample") {
      if (!("sample_rate" in value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rule updates must include sample_rate when changing action to sample.",
        });
      }
      if (!("sample_event_class" in value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_event_class"],
          message: "Sample rule updates must include sample_event_class when changing action to sample.",
        });
      }
      return;
    }

    if ("sample_rate" in value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_rate"],
        message: "Sample rule fields can only be updated while setting action to sample.",
      });
    }

    if ("sample_event_class" in value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_event_class"],
        message: "Sample rule fields can only be updated while setting action to sample.",
      });
    }
  });

export type CaptureRuleUpdate = z.infer<typeof CaptureRuleUpdateSchema>;

export const CaptureRuleResponseSchema = z.object({
  rule: CaptureRuleSchema,
});

export type CaptureRuleResponse = z.infer<typeof CaptureRuleResponseSchema>;

export const CaptureRulesResponseSchema = z.object({
  access_mode: z.enum(["manage", "preview"]),
  rules: z.array(CaptureRuleSchema),
});

export type CaptureRulesResponse = z.infer<typeof CaptureRulesResponseSchema>;

export const CaptureRulesFileSchema = z.object({
  version: z.literal(1),
  rules: z.array(CaptureRuleSchema),
});

export type CaptureRulesFile = z.infer<typeof CaptureRulesFileSchema>;
