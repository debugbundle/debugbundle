import {
  AnalyticsEventEnvelopeSchema,
  getTierCapabilities,
  type AnalyticsEventEnvelope,
  type AnalyticsSettings
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";

export type ValidAnalyticsEvent = { index: number; event: AnalyticsEventEnvelope };

export function isAnalyticsEventCandidate(candidate: unknown): boolean {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    (candidate as Record<string, unknown>)["event_type"] === "analytics_event"
  );
}

export function parseAnalyticsEventCandidate(input: {
  candidate: unknown;
  index: number;
  projectId: string;
}):
  | { event: ValidAnalyticsEvent; error?: never }
  | { event?: never; error: { index: number; reason: string } } {
  const validation = AnalyticsEventEnvelopeSchema.safeParse(input.candidate);
  if (!validation.success) {
    const invalidDimension = validation.error.issues.some((issue) =>
      issue.path.map((segment) => String(segment)).includes("custom_dimensions")
    );

    return {
      error: {
        index: input.index,
        reason: invalidDimension ? "analytics_invalid_dimension" : "analytics_invalid_event"
      }
    };
  }

  return {
    event: {
      index: input.index,
      event: omitAnalyticsProjectToken(validation.data, input.projectId)
    }
  };
}

export async function selectAcceptedAnalyticsEvents(input: {
  dependencies: ApiDependencies;
  events: ValidAnalyticsEvent[];
  organizationId: string | undefined;
  organizationPlan: string | undefined;
  projectId: string;
  analyticsAvailable: boolean;
}): Promise<{
  acceptedEvents: ValidAnalyticsEvent[];
  errors: Array<{ index: number; reason: string }>;
}> {
  if (input.events.length === 0) {
    return { acceptedEvents: [], errors: [] };
  }

  const analyticsSettings =
    input.dependencies.analyticsSettingsManagement === undefined
      ? null
      : await input.dependencies.analyticsSettingsManagement.getAnalyticsSettingsForProject({
          organization_id: input.organizationId ?? "",
          project_id: input.projectId
        });
  const analyticsPersistenceAvailable =
    input.dependencies.ingestionPersistence.persistAnalyticsAndEnqueue !== undefined;

  if (
    analyticsSettings === null ||
    !analyticsSettings.enabled ||
    !input.analyticsAvailable ||
    !analyticsPersistenceAvailable
  ) {
    return {
      acceptedEvents: [],
      errors: input.events.map(({ index }) => ({ index, reason: "analytics_disabled" }))
    };
  }

  const acceptedEvents: ValidAnalyticsEvent[] = [];
  const errors: Array<{ index: number; reason: string }> = [];
  for (const entry of input.events) {
    const settingsRejection = getAnalyticsSettingsRejection(entry.event, analyticsSettings);
    if (settingsRejection !== "ok") {
      errors.push({ index: entry.index, reason: settingsRejection });
      continue;
    }
    const dimensionValidation = validateAnalyticsCustomDimensions({
      event: entry.event,
      settings: analyticsSettings,
      organizationPlan: input.organizationPlan
    });
    if (dimensionValidation !== "ok") {
      errors.push({ index: entry.index, reason: dimensionValidation });
      continue;
    }

    acceptedEvents.push({
      ...entry,
      event: enforceAnalyticsPrivacy(entry.event, analyticsSettings)
    });
  }

  return { acceptedEvents, errors };
}

function omitAnalyticsProjectToken(
  event: AnalyticsEventEnvelope,
  projectId: string
): AnalyticsEventEnvelope {
  const sanitized = { ...event, project_id: projectId };
  delete sanitized.project_token;
  return sanitized;
}

function getAnalyticsSettingsRejection(
  event: AnalyticsEventEnvelope,
  settings: AnalyticsSettings
): "ok" | "analytics_consent_required" | "analytics_capture_disabled" {
  if (settings.consent_required && !event.payload.privacy.consent_granted) {
    return "analytics_consent_required";
  }

  const captureEnabled =
    event.payload.kind === "page_view"
      ? settings.capture_page_views
      : event.payload.kind === "route_change"
        ? settings.capture_route_changes
        : event.payload.kind === "action"
          ? settings.capture_actions
          : event.payload.kind === "journey_marker"
            ? settings.capture_friction_signals
            : true;
  return captureEnabled ? "ok" : "analytics_capture_disabled";
}

function enforceAnalyticsPrivacy(
  event: AnalyticsEventEnvelope,
  settings: AnalyticsSettings
): AnalyticsEventEnvelope {
  const modeOrder = { strict: 0, standard: 1, custom: 2 } as const;
  const effectiveMode = modeOrder[event.payload.privacy.mode] <= modeOrder[settings.privacy_mode]
    ? event.payload.privacy.mode
    : settings.privacy_mode;
  return {
    ...event,
    correlation: {
      ...event.correlation,
      ...(effectiveMode === "strict" ? { visitor_id_hash: null, user_id_hash: null } : {})
    },
    payload: {
      ...event.payload,
      privacy: {
        ...event.payload.privacy,
        mode: effectiveMode
      }
    }
  };
}

function getAnalyticsCustomDimensionKeys(event: AnalyticsEventEnvelope): string[] {
  return Object.keys(event.payload.custom_dimensions ?? {});
}

function validateAnalyticsCustomDimensions(input: {
  event: AnalyticsEventEnvelope;
  settings: AnalyticsSettings;
  organizationPlan: string | undefined;
}): "ok" | "analytics_invalid_dimension" {
  const customDimensionKeys = getAnalyticsCustomDimensionKeys(input.event);
  if (customDimensionKeys.length === 0) {
    return "ok";
  }

  const tierLimit = getTierCapabilities(input.organizationPlan).max_analytics_custom_dimensions;
  const effectiveLimit = Math.min(input.settings.max_custom_dimensions, tierLimit);
  if (effectiveLimit === 0) {
    return "analytics_invalid_dimension";
  }
  if (customDimensionKeys.length > effectiveLimit) {
    return "analytics_invalid_dimension";
  }

  const approvedDimensions = new Set(input.settings.approved_custom_dimensions);
  return customDimensionKeys.every((dimension) => approvedDimensions.has(dimension))
    ? "ok"
    : "analytics_invalid_dimension";
}
