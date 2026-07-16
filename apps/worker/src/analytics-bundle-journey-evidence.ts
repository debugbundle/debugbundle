import { gunzipSync } from "node:zlib";

import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import {
  AnalyticsJourneySampleArtifactSchema,
  type AnalyticsJourneySampleArtifact,
  type AnalyticsJourneySampleEvent
} from "../../../packages/shared-types/src/index.js";
import type {
  AnalyticsBundleGenerationRecord,
  AnalyticsJourneySampleStore,
  ObjectStoreReader
} from "../../../packages/storage/src/index.js";

const MAX_REPRESENTATIVE_JOURNEYS = 5;

type JourneyPatternEvidence = {
  sample_ids?: string[] | undefined;
  from_route_key?: string | undefined;
  to_route_key?: string | undefined;
  affected_sessions?: number | undefined;
  unique_sessions?: number | undefined;
  transition_count?: number | undefined;
  transition_share?: number | undefined;
};

type RepresentativeJourneyCandidate = {
  sample_id: string;
  selection_rank: number;
  selection_basis: "affected_sessions" | "unique_sessions";
  primary_count: number;
  secondary_count: number;
  transition_share: number;
  transition_key: string;
};

type RepresentativeJourneyScore = Omit<
  RepresentativeJourneyCandidate,
  "sample_id" | "selection_rank"
>;

export async function readRepresentativeJourneySamples(input: {
  project_id: string;
  analysis_kind: AnalyticsBundleGenerationRecord["analysis_kind"];
  journeys: JourneyPatternEvidence[];
  analyticsJourneySampleStore: Pick<
    AnalyticsJourneySampleStore,
    "getAnalyticsJourneySampleForProject"
  >;
  objectStore: ObjectStoreReader;
  logger?: RuntimeLogger | undefined;
}): Promise<Array<Record<string, unknown>>> {
  if (input.analysis_kind === "usage_summary") {
    return [];
  }

  const candidates = rankRepresentativeJourneyCandidates(input.analysis_kind, input.journeys).slice(
    0,
    MAX_REPRESENTATIVE_JOURNEYS
  );
  const records: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();

  for (const candidate of candidates) {
    try {
      const sample = await input.analyticsJourneySampleStore.getAnalyticsJourneySampleForProject({
        project_id: input.project_id,
        sample_id: candidate.sample_id,
        now
      });
      if (sample === null) continue;

      const artifact = parseJourneySampleArtifact(
        await input.objectStore.getObject({ key: sample.object_key })
      );
      if (
        artifact === null ||
        artifact.project_id !== input.project_id ||
        artifact.sample_id !== sample.sample_id
      ) {
        input.logger?.warn?.(
          { project_id: input.project_id, sample_id: candidate.sample_id },
          "worker_analytics_bundle_journey_sample_invalid"
        );
        continue;
      }

      records.push(toRepresentativeJourneyRecord(artifact, candidate));
    } catch (error) {
      input.logger?.warn?.(
        {
          error_message: error instanceof Error ? error.message : "unknown_error",
          project_id: input.project_id,
          sample_id: candidate.sample_id
        },
        "worker_analytics_bundle_journey_sample_unavailable"
      );
    }
  }

  return records;
}

function rankRepresentativeJourneyCandidates(
  analysisKind: AnalyticsBundleGenerationRecord["analysis_kind"],
  journeys: JourneyPatternEvidence[]
): RepresentativeJourneyCandidate[] {
  const candidates = new Map<string, RepresentativeJourneyScore>();

  for (const journey of journeys) {
    const candidate = toRepresentativeJourneyCandidate(analysisKind, journey);
    for (const sampleId of journey.sample_ids ?? []) {
      const normalizedSampleId = readNonEmptyString(sampleId);
      if (normalizedSampleId === undefined) continue;

      const existing = candidates.get(normalizedSampleId);
      if (existing === undefined || compareRepresentativeJourneyScores(candidate, existing) < 0) {
        candidates.set(normalizedSampleId, candidate);
      }
    }
  }

  return [...candidates.entries()]
    .map(([sample_id, candidate]) => ({ ...candidate, sample_id }))
    .sort(compareRepresentativeJourneyCandidates)
    .map((candidate, index) => ({ ...candidate, selection_rank: index + 1 }));
}

function toRepresentativeJourneyCandidate(
  analysisKind: AnalyticsBundleGenerationRecord["analysis_kind"],
  journey: JourneyPatternEvidence
): Omit<RepresentativeJourneyCandidate, "sample_id" | "selection_rank"> {
  const isIncidentImpact = analysisKind === "incident_impact";
  const fromRoute = readNonEmptyString(journey.from_route_key) ?? "unknown";
  const toRoute = readNonEmptyString(journey.to_route_key) ?? "unknown";

  return {
    selection_basis: isIncidentImpact ? "affected_sessions" : "unique_sessions",
    primary_count: isIncidentImpact
      ? readNonNegativeInteger(journey.affected_sessions)
      : readNonNegativeInteger(journey.unique_sessions),
    secondary_count: isIncidentImpact ? 0 : readNonNegativeInteger(journey.transition_count),
    transition_share: isIncidentImpact ? 0 : readNonNegativeNumber(journey.transition_share),
    transition_key: `${fromRoute}\u0000${toRoute}`
  };
}

function compareRepresentativeJourneyCandidates(
  left: Omit<RepresentativeJourneyCandidate, "selection_rank">,
  right: Omit<RepresentativeJourneyCandidate, "selection_rank">
): number {
  return compareRepresentativeJourneyScores(left, right) || left.sample_id.localeCompare(right.sample_id);
}

function compareRepresentativeJourneyScores(
  left: RepresentativeJourneyScore,
  right: RepresentativeJourneyScore
): number {
  return (
    right.primary_count - left.primary_count ||
    right.secondary_count - left.secondary_count ||
    right.transition_share - left.transition_share ||
    left.transition_key.localeCompare(right.transition_key)
  );
}

function parseJourneySampleArtifact(body: Buffer): AnalyticsJourneySampleArtifact | null {
  try {
    const artifact = AnalyticsJourneySampleArtifactSchema.safeParse(
      JSON.parse(gunzipSync(body).toString("utf8")) as unknown
    );
    return artifact.success ? artifact.data : null;
  } catch {
    return null;
  }
}

function toRepresentativeJourneyRecord(
  artifact: AnalyticsJourneySampleArtifact,
  candidate: RepresentativeJourneyCandidate
): Record<string, unknown> {
  return {
    sample_id: artifact.sample_id,
    selection_rank: candidate.selection_rank,
    selection_basis: candidate.selection_basis,
    selection_primary_count: candidate.primary_count,
    selection_secondary_count: candidate.secondary_count,
    selection_transition_share: candidate.transition_share,
    service: artifact.service,
    environment: artifact.environment,
    first_seen_at: artifact.first_seen_at,
    last_seen_at: artifact.last_seen_at,
    analysis_tags: artifact.analysis_tags,
    dimensions_summary: artifact.dimensions_summary,
    event_count: artifact.events.length,
    timeline: Object.fromEntries(
      artifact.events.map((event, index) => [
        String(index + 1).padStart(3, "0"),
        toRepresentativeJourneyEvent(event)
      ])
    )
  };
}

function toRepresentativeJourneyEvent(event: AnalyticsJourneySampleEvent): Record<string, unknown> {
  return {
    event_id: readNullableString(event.event_id),
    occurred_at: readNullableString(event.occurred_at),
    kind: readNullableString(event.kind) ?? "unknown",
    route: toRouteKey(event.route),
    previous_route: toRouteKey(event.previous_route),
    action_key: readNullableString(event.signal?.action_key),
    funnel_key: readNullableString(event.signal?.funnel_key),
    step_key: readNullableString(event.signal?.step_key),
    conversion_key: readNullableString(event.signal?.conversion_key),
    marker_key: readNullableString(event.signal?.marker_key),
    trace_id: readNullableString(event.trace_id),
    deploy_id: readNullableString(event.deploy_id),
    dimensions: isRecord(event.dimensions) ? event.dimensions : {},
    custom_dimensions: isRecord(event.custom_dimensions) ? event.custom_dimensions : {}
  };
}

function toRouteKey(route: AnalyticsJourneySampleEvent["route"]): string | null {
  return route === null || route === undefined ? null : readNullableString(route.normalized_path);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function readNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
