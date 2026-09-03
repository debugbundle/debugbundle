import type {
  OpenAiConnectionRecord,
  OpenAiConsentInteractionRecord,
  OpenAiProductScope
} from "./api-types.js";

export const OPENAI_PLUGIN_PREVIEW_STATES = {
  consent: [
    "default",
    "loading",
    "expired",
    "unavailable",
    "retryable",
    "allow-processing",
    "deny-processing"
  ],
  reviewer: ["default", "error", "rate-limit"],
  settings: ["empty", "active", "expired", "revoked", "confirmation"]
} as const;

export type OpenAiPluginPreviewSurface = keyof typeof OPENAI_PLUGIN_PREVIEW_STATES;
export type OpenAiConsentPreviewState = (typeof OPENAI_PLUGIN_PREVIEW_STATES.consent)[number];
export type OpenAiReviewerPreviewState = (typeof OPENAI_PLUGIN_PREVIEW_STATES.reviewer)[number];
export type OpenAiSettingsPreviewState = (typeof OPENAI_PLUGIN_PREVIEW_STATES.settings)[number];
export type OpenAiPluginPreviewState =
  | OpenAiConsentPreviewState
  | OpenAiReviewerPreviewState
  | OpenAiSettingsPreviewState;

export const OPENAI_PLUGIN_PREVIEW_VIEWPORTS = [
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
  { id: "tablet", label: "Tablet", width: 768, height: 1024 },
  { id: "desktop", label: "Desktop", width: 1280, height: 900 }
] as const;

export type OpenAiPluginPreviewViewport = (typeof OPENAI_PLUGIN_PREVIEW_VIEWPORTS)[number]["id"];

export const OPENAI_PRODUCT_SCOPES: readonly OpenAiProductScope[] = [
  "debugbundle:projects:read",
  "debugbundle:incidents:read",
  "debugbundle:artifacts:read",
  "debugbundle:improvements:read",
  "debugbundle:analytics:read",
  "debugbundle:health:read"
];

export const SYNTHETIC_OPENAI_INTERACTION: OpenAiConsentInteractionRecord = {
  interaction_id: "synthetic_preview_interaction",
  client_name: "ChatGPT and Codex",
  publisher: "OpenAI",
  organization_name: "Synthetic Review Workspace",
  identity_scopes: ["openid", "email"],
  product_scopes: [...OPENAI_PRODUCT_SCOPES],
  reviewer_access_available: true
};

const ACTIVE_CONNECTION: OpenAiConnectionRecord = {
  grant_id: "00000000-0000-4000-8000-000000000001",
  client_name: "ChatGPT and Codex",
  organization_name: "Synthetic Review Workspace",
  product_scopes: [...OPENAI_PRODUCT_SCOPES],
  consented_at: "2026-08-30T10:00:00.000Z",
  expires_at: "2026-09-29T10:00:00.000Z",
  revoked_at: null,
  status: "active"
};

export const SYNTHETIC_OPENAI_CONNECTIONS: Record<
  Exclude<OpenAiSettingsPreviewState, "empty" | "confirmation">,
  OpenAiConnectionRecord
> = {
  active: ACTIVE_CONNECTION,
  expired: {
    ...ACTIVE_CONNECTION,
    grant_id: "00000000-0000-4000-8000-000000000002",
    expires_at: "2026-08-29T10:00:00.000Z",
    status: "expired"
  },
  revoked: {
    ...ACTIVE_CONNECTION,
    grant_id: "00000000-0000-4000-8000-000000000003",
    revoked_at: "2026-08-31T09:00:00.000Z",
    status: "revoked"
  }
};

export function getOpenAiPreviewScopes(mask: number): OpenAiProductScope[] {
  const boundedMask = Number.isInteger(mask) ? Math.min(63, Math.max(0, mask)) : 63;
  return OPENAI_PRODUCT_SCOPES.filter((_, index) => (boundedMask & (1 << index)) !== 0);
}

export function parseOpenAiPreviewSurface(value: string | null): OpenAiPluginPreviewSurface {
  return value === "reviewer" || value === "settings" ? value : "consent";
}

export function parseOpenAiPreviewState(
  surface: OpenAiPluginPreviewSurface,
  value: string | null
): OpenAiPluginPreviewState {
  const states = OPENAI_PLUGIN_PREVIEW_STATES[surface] as readonly string[];
  return states.includes(value ?? "")
    ? (value as OpenAiPluginPreviewState)
    : (states[0] as OpenAiPluginPreviewState);
}

export function parseOpenAiPreviewViewport(value: string | null): OpenAiPluginPreviewViewport {
  return value === "mobile" || value === "tablet" ? value : "desktop";
}

export function parseOpenAiPreviewScopeMask(value: string | null): number {
  if (value === null || !/^\d{1,2}$/.test(value)) {
    return 63;
  }
  const parsed = Number.parseInt(value, 10);
  return parsed >= 0 && parsed <= 63 ? parsed : 63;
}

export function describeOpenAiPreviewScopes(mask: number): string {
  const labels = ["Projects", "Incidents", "Artifacts", "Improvements", "Analytics", "Health"];
  const selected = labels.filter((_, index) => (mask & (1 << index)) !== 0);
  if (selected.length === 0) {
    return "Identity only";
  }
  if (selected.length === labels.length) {
    return "All product scopes";
  }
  return selected.join(", ");
}
