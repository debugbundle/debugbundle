import {
  AnalyticsEventEnvelopeSchema,
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
}): { event: ValidAnalyticsEvent; error?: never } | { event?: never; error: { index: number; reason: string } } {
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
      event: {
        ...validation.data,
        project_id: input.projectId
      }
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
}): Promise<{ acceptedEvents: ValidAnalyticsEvent[]; errors: Array<{ index: number; reason: string }> }> {
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
    const dimensionValidation = validateAnalyticsCustomDimensions({
      event: entry.event,
      settings: analyticsSettings,
      organizationPlan: input.organizationPlan
    });
    if (dimensionValidation !== "ok") {
      errors.push({ index: entry.index, reason: dimensionValidation });
      continue;
    }

    acceptedEvents.push(entry);
  }

  return { acceptedEvents, errors };
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

  if (input.organizationPlan !== "team") {
    return "analytics_invalid_dimension";
  }
  if (customDimensionKeys.length > input.settings.max_custom_dimensions) {
    return "analytics_invalid_dimension";
  }

  const approvedDimensions = new Set(input.settings.approved_custom_dimensions);
  return customDimensionKeys.every((dimension) => approvedDimensions.has(dimension))
    ? "ok"
    : "analytics_invalid_dimension";
}
