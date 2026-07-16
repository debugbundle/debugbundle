import { gzipSync } from "node:zlib";

import { FINGERPRINT_VERSION, inferMatchedFields } from "../../event-normalizer/src/index.js";
import {
  type AnalyticsEventEnvelope,
  normalizeImmediateClientErrorStatuses,
  normalizeImmediateClientErrorPathRules,
  type CapturePreset,
  type EventEnvelope,
  type ImmediateClientErrorPathRule
} from "../../shared-types/src/index.js";
import type { AccountAnalyticsStore } from "./account-analytics-store.js";
import type {
  AnalyticsIngestionPersistenceService,
  AnalyticsQueueClient,
} from "./analytics-ingestion-jobs.js";
import {
  buildAnalyticsRawEventObjectKey,
  buildRawEventObjectKey,
  hashToken,
  inferEventLogLevel,
  inferSeverity
} from "./helpers.js";
import type {
  IncidentFrequencyCounter,
  IngestionMetadataService,
  IngestionPersistenceService,
  MemberAuthService,
  MetadataStore,
  ObjectStoreClient,
  PersistEventMetadataInput,
  QueueClient,
  ResolveMemberResult,
  ResolveProjectResult,
  UpsertIncidentResult,
} from "./types.js";

interface CreateIngestionMetadataServiceInput {
  frequencyCounter?: IncidentFrequencyCounter;
  accountAnalyticsStore?: Pick<AccountAnalyticsStore, "recordMetricDeltas">;
  resolveOrganizationIdForProject?: (projectId: string) => Promise<string | null>;
}

export function createIngestionMetadataService(
  store: MetadataStore,
  options: CreateIngestionMetadataServiceInput = {}
): IngestionMetadataService {
  return {
    async resolveProjectByTokenHash(tokenHash: string): Promise<ResolveProjectResult | null> {
      return store.resolveProjectByTokenHash(tokenHash);
    },

    async resolveProjectFromToken(token: string): Promise<ResolveProjectResult | null> {
      return store.resolveProjectByTokenHash(hashToken(token));
    },

    async persistEventMetadata(input: PersistEventMetadataInput): Promise<UpsertIncidentResult> {
      const severity = inferSeverity(input.event.event_type);
      const incident = await store.upsertIncident({
        event_id: input.event.event_id,
        event_type: input.event.event_type,
        project_id: input.projectId,
        service_name: input.event.service.name,
        environment: input.event.service.environment,
        fingerprint: input.fingerprint,
        fingerprint_version: FINGERPRINT_VERSION,
        matched_fields: inferMatchedFields(input.normalizedEvent),
        title: input.normalizedEvent.normalized_message,
        severity,
        occurred_at: input.event.occurred_at,
        ...(input.event.event_type === "deploy_metadata"
          ? {
              deploy_metadata: {
                commit_sha: input.event.payload.commit_sha,
                version: input.event.payload.version,
                branch: input.event.payload.branch,
                deployed_at: input.event.payload.deployed_at
              }
            }
          : {})
      });

      await store.insertIncidentEvent({
        incident_id: incident.incident_id,
        event_id: input.event.event_id,
        event_type: input.event.event_type,
        occurred_at: input.event.occurred_at,
        is_sampled: true,
        level: inferEventLogLevel(input.event)
      });

      let markedSpiking = false;
      if (options.frequencyCounter !== undefined) {
        if (incident.duplicate_event !== true) {
          const frequency = await options.frequencyCounter.recordOccurrence({
            incident_id: incident.incident_id,
            event_id: input.event.event_id,
            occurred_at: input.event.occurred_at
          });

          if (frequency.has_sufficient_baseline && frequency.is_spiking) {
            markedSpiking = await store.markIncidentSpiking({
              incident_id: incident.incident_id,
              detected_at: input.event.occurred_at
            });
          }
        }
      }

      if (
        options.accountAnalyticsStore !== undefined &&
        options.resolveOrganizationIdForProject !== undefined
      ) {
        const deltas: Partial<
          Record<
            | "incidents_opened"
            | "incidents_regressed"
            | "incident_occurrences"
            | "incident_occurrences_high_severity"
            | "incident_occurrences_critical_severity"
            | "incidents_auto_detected_spiking",
            number
          >
        > = {};

        if (incident.duplicate_event !== true) {
          deltas["incident_occurrences"] = 1;
          if (severity === "high") {
            deltas["incident_occurrences_high_severity"] = 1;
          }
          if (severity === "critical") {
            deltas["incident_occurrences_critical_severity"] = 1;
          }
          if (incident.occurrence_count === 1) {
            deltas["incidents_opened"] = 1;
          }
          if (incident.regressed_now) {
            deltas["incidents_regressed"] = 1;
          }
        }

        if (markedSpiking) {
          deltas["incidents_auto_detected_spiking"] = 1;
        }

        if (Object.keys(deltas).length > 0) {
          const organizationId = await options.resolveOrganizationIdForProject(input.projectId);
          if (organizationId !== null) {
            await options.accountAnalyticsStore.recordMetricDeltas({
              organization_id: organizationId,
              occurred_at: input.event.occurred_at,
              source: "incident_persist",
              dedupe_key: `incident_persist:${incident.incident_id}:${input.event.event_id}`,
              deltas
            });
          }
        }
      }

      return incident;
    }
  };
}

export function createMemberAuthService(store: Pick<MetadataStore, "resolveMemberByTokenHash">): MemberAuthService {
  return {
    async resolveMemberByTokenHash(tokenHash: string): Promise<ResolveMemberResult | null> {
      return store.resolveMemberByTokenHash(tokenHash);
    },

    async resolveMemberFromToken(token: string): Promise<ResolveMemberResult | null> {
      return store.resolveMemberByTokenHash(hashToken(token));
    }
  };
}

interface CreateIngestionPersistenceServiceInput {
  objectStore: ObjectStoreClient;
  queue: QueueClient;
}

export function createIngestionPersistenceService(
  input: CreateIngestionPersistenceServiceInput
): IngestionPersistenceService & AnalyticsIngestionPersistenceService {
  const analyticsQueue = input.queue as typeof input.queue & AnalyticsQueueClient;

  return {
    async persistAndEnqueue(
      event: EventEnvelope,
      projectId: string,
      options?: {
        capturePreset?: CapturePreset;
        immediateClientErrorStatuses?: number[];
        immediateClientErrorPathRules?: ImmediateClientErrorPathRule[];
        captureRule?: import("../../shared-types/src/index.js").CaptureRuleEvaluationResult;
      }
    ): Promise<{ object_key: string }> {
      const objectKey = buildRawEventObjectKey({
        projectId,
        eventId: event.event_id,
        occurredAt: new Date(event.occurred_at)
      });

      const body = gzipSync(Buffer.from(JSON.stringify(event), "utf8"));

      await input.objectStore.putObject({
        key: objectKey,
        body,
        contentType: "application/json",
        contentEncoding: "gzip"
      });

      await input.queue.enqueue("normalize-events", {
        project_id: projectId,
        event_id: event.event_id,
        object_key: objectKey,
        ...(options?.capturePreset === undefined ? {} : { capture_preset: options.capturePreset }),
        ...(options?.immediateClientErrorStatuses === undefined
          ? {}
          : {
              immediate_client_error_statuses: normalizeImmediateClientErrorStatuses(
                options.immediateClientErrorStatuses
              )
            }),
        ...(options?.immediateClientErrorPathRules === undefined
          ? {}
          : {
              immediate_client_error_path_rules: normalizeImmediateClientErrorPathRules(
                options.immediateClientErrorPathRules
              )
            }),
        ...(options?.captureRule === undefined ? {} : { capture_rule: options.captureRule })
      });

      return {
        object_key: objectKey
      };
    },

    async persistAnalyticsAndEnqueue(
      event: AnalyticsEventEnvelope,
      projectId: string
    ): Promise<{ object_key: string }> {
      const objectKey = buildAnalyticsRawEventObjectKey({
        projectId,
        eventId: event.event_id,
        occurredAt: new Date(event.occurred_at)
      });

      const body = gzipSync(Buffer.from(JSON.stringify(event), "utf8"));

      await input.objectStore.putObject({
        key: objectKey,
        body,
        contentType: "application/json",
        contentEncoding: "gzip"
      });

      await analyticsQueue.enqueue("aggregate-analytics-events", {
        project_id: projectId,
        event_id: event.event_id,
        object_key: objectKey
      });

      return {
        object_key: objectKey
      };
    }
  };
}
