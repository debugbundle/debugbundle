import { gzipSync } from "node:zlib";

import { FINGERPRINT_VERSION, inferMatchedFields } from "../../event-normalizer/src/index.js";
import {
  normalizeImmediateClientErrorStatuses,
  type CapturePreset,
  type EventEnvelope
} from "../../shared-types/src/index.js";
import { buildRawEventObjectKey, hashToken, inferEventLogLevel, inferSeverity } from "./helpers.js";
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
        severity: inferSeverity(input.event.event_type),
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

      if (options.frequencyCounter !== undefined) {
        if (incident.duplicate_event !== true) {
          const frequency = await options.frequencyCounter.recordOccurrence({
            incident_id: incident.incident_id,
            event_id: input.event.event_id,
            occurred_at: input.event.occurred_at
          });

          if (frequency.has_sufficient_baseline && frequency.is_spiking) {
            await store.markIncidentSpiking({
              incident_id: incident.incident_id,
              detected_at: input.event.occurred_at
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
): IngestionPersistenceService {
  return {
    async persistAndEnqueue(
      event: EventEnvelope,
      projectId: string,
      options?: { capturePreset?: CapturePreset; immediateClientErrorStatuses?: number[] }
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
            })
      });

      return {
        object_key: objectKey
      };
    }
  };
}
