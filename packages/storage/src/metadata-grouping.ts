import { normalizeResourceRoute } from "../../shared-types/src/browser-resource-routes.js";
import { runInTransaction } from "./transaction.js";
import { randomUUID } from "node:crypto";
import type {
  DemotedIncidentEventReference,
  InsertIncidentEventInput,
  MarkIncidentSpikingInput,
  PostgresMetadataStore,
  Queryable,
  RecordIncidentEventRetentionInput,
  RecordIncidentEventRetentionResult,
  UpsertIncidentInput,
  UpsertIncidentResult
} from "./types.js";
import {
  severityToRank,
  collectDemotedIncidentEvents,
  getOrCreateServiceId,
  upsertDeploymentFromEvent,
  getRegressionDeployCorrelation
} from "./metadata-incident-shared.js";

export function createMetadataGrouping(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  "upsertIncident" | "insertIncidentEvent" | "recordIncidentEventRetention" | "markIncidentSpiking"
> {
  return {
    async upsertIncident(input: UpsertIncidentInput): Promise<UpsertIncidentResult> {
      const serviceId = await getOrCreateServiceId(
        db,
        input.project_id,
        input.service_name,
        input.environment
      );

      if (input.event_type === "deploy_metadata" && input.deploy_metadata !== undefined) {
        await upsertDeploymentFromEvent({
          db,
          event_id: input.event_id,
          project_id: input.project_id,
          service_id: serviceId,
          environment: input.environment,
          commit_sha: input.deploy_metadata.commit_sha,
          version: input.deploy_metadata.version,
          branch: input.deploy_metadata.branch,
          deployed_at: input.deploy_metadata.deployed_at
        });
      }

      const matchedFields =
        input.matched_fields !== undefined && input.matched_fields.length > 0
          ? input.matched_fields
          : ["normalized_message"];
      const existingIncidentResult = await db.query<{
        id: string;
        status: "open" | "resolved" | "regressed";
      }>(
        `
          SELECT id, status
          FROM incidents
          WHERE project_id = $1
            AND environment = $2
            AND service_id = $3
            AND fingerprint = $4
          LIMIT 1
        `,
        [input.project_id, input.environment, serviceId, input.fingerprint]
      );

      const existingIncident = existingIncidentResult.rows[0] ?? null;
      let duplicateEvent = false;
      let hasEventType = false;
      let hasRequestEvent = false;

      if (existingIncident !== null && existingIncident.id !== undefined) {
        const duplicateResult = await db.query<{ duplicate: boolean }>(
          `
            SELECT EXISTS(
              SELECT 1
              FROM incident_events
              WHERE incident_id = $1
                AND event_id = $2::uuid
            ) AS duplicate
          `,
          [existingIncident.id, input.event_id]
        );

        duplicateEvent = Boolean(duplicateResult.rows[0]?.duplicate);

        if (!duplicateEvent) {
          const eventTypePresenceResult = await db.query<{
            has_event_type: boolean;
            has_request_event: boolean;
          }>(
            `
              SELECT
                EXISTS(
                  SELECT 1
                  FROM incident_events
                  WHERE incident_id = $1
                    AND event_type = $2
                ) AS has_event_type,
                EXISTS(
                  SELECT 1
                  FROM incident_events
                  WHERE incident_id = $1
                    AND event_type = 'request_event'
                ) AS has_request_event
            `,
            [existingIncident.id, input.event_type ?? null]
          );

          hasEventType = Boolean(eventTypePresenceResult.rows[0]?.has_event_type);
          hasRequestEvent = Boolean(eventTypePresenceResult.rows[0]?.has_request_event);
        }
      }

      const newContextTypeAdded =
        existingIncident !== null &&
        existingIncident.id !== undefined &&
        input.event_type !== undefined &&
        !duplicateEvent &&
        !hasEventType;

      const reproductionConfidenceChanged =
        existingIncident !== null &&
        existingIncident.id !== undefined &&
        input.event_type === "request_event" &&
        !duplicateEvent &&
        !hasRequestEvent;

      const regressedNow =
        existingIncident !== null &&
        existingIncident.id !== undefined &&
        existingIncident.status === "resolved" &&
        !duplicateEvent;

      const regressionDeploy = regressedNow
        ? await getRegressionDeployCorrelation({
            db,
            project_id: input.project_id,
            service_id: serviceId,
            environment: input.environment,
            occurred_at: input.occurred_at
          })
        : null;

      const result = await db.query<{
        incident_id: string;
        matched_fields: string[] | null;
        status: "open" | "resolved" | "regressed";
        occurrence_count: number;
      }>(
        `
          INSERT INTO incidents (
            id,
            project_id,
            service_id,
            environment,
            fingerprint,
            fingerprint_version,
            title,
            severity,
            status,
            first_seen_at,
            last_seen_at,
            occurrence_count,
            latest_deployment_id,
            matched_fields,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            'open',
            $9::timestamptz,
            $9::timestamptz,
            1,
            $10::uuid,
            $11::text[],
            now(),
            now()
          )
          ON CONFLICT (project_id, environment, service_id, fingerprint)
          DO UPDATE SET
            first_seen_at = LEAST(incidents.first_seen_at, EXCLUDED.first_seen_at),
            last_seen_at = CASE
              WHEN $12::boolean THEN incidents.last_seen_at
              ELSE GREATEST(incidents.last_seen_at, EXCLUDED.last_seen_at)
            END,
            occurrence_count = incidents.occurrence_count + CASE
              WHEN $12::boolean THEN 0
              ELSE 1
            END,
            status = CASE
              WHEN incidents.status = 'resolved' AND NOT $12::boolean THEN 'regressed'
              ELSE incidents.status
            END,
            regressed_at = CASE
              WHEN incidents.status = 'resolved' AND NOT $12::boolean THEN EXCLUDED.last_seen_at
              ELSE incidents.regressed_at
            END,
            latest_deployment_id = CASE
              WHEN incidents.status = 'resolved' AND NOT $12::boolean AND $10::uuid IS NOT NULL THEN $10::uuid
              ELSE incidents.latest_deployment_id
            END,
            matched_fields = EXCLUDED.matched_fields,
            updated_at = now()
          RETURNING
            id AS incident_id,
            matched_fields,
            status,
            occurrence_count
        `,
        [
          randomUUID(),
          input.project_id,
          serviceId,
          input.environment,
          input.fingerprint,
          input.fingerprint_version,
          input.title,
          input.severity,
          input.occurred_at,
          regressionDeploy?.deployment_id ?? null,
          matchedFields,
          duplicateEvent
        ]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("incident_upsert_failed");
      }

      return {
        incident_id: row.incident_id,
        matched_fields: row.matched_fields ?? [],
        status: row.status,
        regressed_now: regressedNow,
        occurrence_count: row.occurrence_count,
        duplicate_event: duplicateEvent,
        ...(newContextTypeAdded ? { new_context_type_added: true } : {}),
        ...(reproductionConfidenceChanged ? { reproduction_confidence_changed: true } : {}),
        regression_deploy: regressionDeploy
      };
    },

    async insertIncidentEvent(input: InsertIncidentEventInput): Promise<void> {
      await db.query(
        `
          INSERT INTO incident_events (incident_id, event_id, event_type, event_class, occurred_at, is_sampled, level, resource_route)
          VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8)
          ON CONFLICT (incident_id, event_id) DO NOTHING
        `,
        [
          input.incident_id,
          input.event_id,
          input.event_type,
          input.event_class ?? "context_signal",
          input.occurred_at,
          input.is_sampled,
          input.level ?? null,
          normalizeResourceRoute(input.resource_route)
        ]
      );
    },

    async recordIncidentEventRetention(
      input: RecordIncidentEventRetentionInput
    ): Promise<RecordIncidentEventRetentionResult> {
      return runInTransaction(db, async (db) => {
        const demotedEventReferences = new Map<string, DemotedIncidentEventReference>();
        const retainFirst = input.occurrence_count === 1;
        const retainDeployMetadata = input.event_type === "deploy_metadata";
        const severityRank = severityToRank(input.severity);

        let retainAfterDeploy = false;
        if (!retainDeployMetadata) {
          const latestDeploymentResult = await db.query<{
            deployment_id: string;
            deployed_at: string;
          }>(
            `
              SELECT
                d.id::text AS deployment_id,
                d.deployed_at::text AS deployed_at
              FROM incidents i
              JOIN deployments d
                ON d.project_id = i.project_id
               AND d.service_id = i.service_id
               AND d.environment = i.environment
              WHERE i.id = $1
                AND d.deployed_at <= $2::timestamptz
              ORDER BY d.deployed_at DESC
              LIMIT 1
            `,
            [input.incident_id, input.occurred_at]
          );

          const latestDeployment = latestDeploymentResult.rows[0] ?? null;
          if (latestDeployment !== null) {
            const priorOccurrenceResult = await db.query<{ has_prior_occurrence: boolean }>(
              `
                SELECT EXISTS(
                  SELECT 1
                  FROM incident_events ie
                  WHERE ie.incident_id = $1
                    AND ie.event_id <> $2::uuid
                    AND ie.event_type <> 'deploy_metadata'
                    AND ie.occurred_at >= $3::timestamptz
                ) AS has_prior_occurrence
              `,
              [input.incident_id, input.event_id, latestDeployment.deployed_at]
            );

            retainAfterDeploy = !Boolean(priorOccurrenceResult.rows[0]?.has_prior_occurrence);
          }
        }

        const currentHighestSeverityResult = await db.query<{ max_rank: number | null }>(
          `
            SELECT MAX(severity_rank) AS max_rank
            FROM incident_events
            WHERE incident_id = $1
          `,
          [input.incident_id]
        );

        const currentHighestSeverityRank = currentHighestSeverityResult.rows[0]?.max_rank ?? null;
        const retainHighestSeverity =
          currentHighestSeverityRank === null || severityRank > currentHighestSeverityRank;

        const clearedLatestResult = await db.query<{
          event_id: string;
          occurred_at: string;
          is_sampled: boolean;
        }>(
          `
            UPDATE incident_events
            SET retain_latest = false,
                is_sampled = retain_first OR retain_after_deploy OR retain_highest_severity OR retain_deploy_metadata
            WHERE incident_id = $1
              AND retain_latest = true
            RETURNING event_id::text AS event_id, occurred_at::text AS occurred_at, is_sampled
          `,
          [input.incident_id]
        );

        collectDemotedIncidentEvents(demotedEventReferences, clearedLatestResult.rows);

        if (retainHighestSeverity) {
          const clearedHighestSeverityResult = await db.query<{
            event_id: string;
            occurred_at: string;
            is_sampled: boolean;
          }>(
            `
              UPDATE incident_events
              SET retain_highest_severity = false,
                  is_sampled = retain_first OR retain_latest OR retain_after_deploy OR retain_deploy_metadata
              WHERE incident_id = $1
                AND retain_highest_severity = true
              RETURNING event_id::text AS event_id, occurred_at::text AS occurred_at, is_sampled
            `,
            [input.incident_id]
          );

          collectDemotedIncidentEvents(demotedEventReferences, clearedHighestSeverityResult.rows);
        }

        const insertedResult = await db.query<{ is_sampled: boolean }>(
          `
            INSERT INTO incident_events (
              incident_id,
              event_id,
              event_type,
              event_class,
              occurred_at,
              is_sampled,
              level,
              retain_first,
              retain_latest,
              retain_after_deploy,
              retain_highest_severity,
              retain_deploy_metadata,
              severity_rank,
              resource_route
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5::timestamptz,
              true,
              $6,
              $7,
              true,
              $8,
              $9,
              $10,
              $11,
              $12
            )
            ON CONFLICT (incident_id, event_id)
            DO UPDATE SET
              event_type = EXCLUDED.event_type,
              occurred_at = EXCLUDED.occurred_at,
              is_sampled = incident_events.is_sampled OR EXCLUDED.is_sampled,
              level = COALESCE(EXCLUDED.level, incident_events.level),
              resource_route = COALESCE(EXCLUDED.resource_route, incident_events.resource_route),
              retain_first = incident_events.retain_first OR EXCLUDED.retain_first,
              retain_latest = incident_events.retain_latest OR EXCLUDED.retain_latest,
              retain_after_deploy = incident_events.retain_after_deploy OR EXCLUDED.retain_after_deploy,
              retain_highest_severity = incident_events.retain_highest_severity OR EXCLUDED.retain_highest_severity,
              retain_deploy_metadata = incident_events.retain_deploy_metadata OR EXCLUDED.retain_deploy_metadata,
              severity_rank = GREATEST(incident_events.severity_rank, EXCLUDED.severity_rank)
            RETURNING is_sampled
          `,
          [
            input.incident_id,
            input.event_id,
            input.event_type,
            input.event_class ?? "context_signal",
            input.occurred_at,
            input.level ?? null,
            retainFirst,
            retainAfterDeploy,
            retainHighestSeverity,
            retainDeployMetadata,
            severityRank,
            normalizeResourceRoute(input.resource_route)
          ]
        );

        return {
          is_sampled: Boolean(insertedResult.rows[0]?.is_sampled),
          demoted_event_references: [...demotedEventReferences.values()].sort((left, right) => {
            if (left.occurred_at === right.occurred_at) {
              return left.event_id.localeCompare(right.event_id);
            }
            return left.occurred_at.localeCompare(right.occurred_at);
          })
        };
      });
    },

    async markIncidentSpiking(input: MarkIncidentSpikingInput): Promise<boolean> {
      const result = await db.query(
        `
          UPDATE incidents
          SET spike_detected_at = $2::timestamptz,
              updated_at = now()
          WHERE id = $1
            AND spike_detected_at IS NULL
        `,
        [input.incident_id, input.detected_at]
      );

      return (result.rowCount ?? 0) > 0;
    }
  };
}
