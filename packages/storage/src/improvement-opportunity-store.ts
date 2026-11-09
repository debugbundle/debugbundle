import { projectActorAllowedSql, projectReadScopeSql } from "./project-read-scope.js";
import type { ImprovementBundleSensitivity } from "../../shared-types/src/index.js";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import type { AccountMetricKey } from "./account-analytics-store.js";
import type { Queryable, QueryResult } from "./types.js";
import {
  buildIncidentPatternFingerprint,
  buildRequestPatternFingerprint,
  buildWarningHotspotFingerprint,
  recordImprovementOpportunityOccurrence
} from "./improvement-opportunity-recording.js";
import { runInTransaction } from "./transaction.js";
import { getOrCreateServiceIdentity } from "./metadata-incident-shared.js";
import { createImprovementBundleMetadata } from "./improvement-bundle-metadata.js";
import { createImprovementOpportunityRead } from "./improvement-opportunity-read.js";
import type {
  PostgresImprovementOpportunityStoreOptions,
  ImprovementOpportunityStore
} from "./improvement-opportunity-types.js";
import {
  normalizePlan,
  toRecordedImprovementResult,
  getImprovementOpenedMetricKey,
  resolveOrganizationIdForProject,
  recordImprovementMetricDeltas,
  getImprovementLifecycleState,
  type ImprovementRetrievalRow
} from "./improvement-opportunity-shared.js";
export type * from "./improvement-opportunity-types.js";

export function createPostgresImprovementOpportunityStore(
  db: Queryable,
  options: PostgresImprovementOpportunityStoreOptions = {}
): ImprovementOpportunityStore {
  const accountAnalyticsStore = options.accountAnalyticsStore;

  return {
    async getImprovementExecutionSettings(projectId) {
      const result = await db.query<
        {
          plan: string;
          automated_improvement_bundles_enabled: boolean;
          improvement_bundle_sensitivity: ImprovementBundleSensitivity;
        } & Record<string, unknown>
      >(
        `
          SELECT
            COALESCE(o.plan, 'free') AS plan,
            p.automated_improvement_bundles_enabled,
            p.improvement_bundle_sensitivity
          FROM projects p
          JOIN organizations o ON o.id = p.organization_id
          WHERE p.id = debugbundle_canonical_project($1::uuid)
          LIMIT 1
        `,
        [projectId]
      );

      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }

      const plan = normalizePlan(row.plan);
      if (!getTierCapabilities(plan).cloud_improvement_bundles) {
        return {
          plan,
          automated_improvement_bundles_enabled: false,
          improvement_bundle_sensitivity: row.improvement_bundle_sensitivity
        };
      }

      return {
        plan,
        automated_improvement_bundles_enabled: row.automated_improvement_bundles_enabled,
        improvement_bundle_sensitivity: row.improvement_bundle_sensitivity
      };
    },

    async recordWarningHotspot(input) {
      const fingerprintInput = {
        service_name: input.service_name,
        environment: input.environment,
        normalized_message: input.normalized_message
      };
      const originalFingerprint = buildWarningHotspotFingerprint(fingerprintInput);
      const title = `Warning hotspot: ${input.normalized_message}`;
      const summary = `Repeated warning log pattern detected for ${input.service_name} in ${input.environment}.`;
      const evidence = {
        kind: "warning_hotspot",
        log_level: "warning",
        normalized_message: input.normalized_message,
        threshold: input.threshold
      };

      const recordOccurrence = async (
        queryable: Queryable
      ): ReturnType<typeof recordImprovementOpportunityOccurrence> => {
        const service = await getOrCreateServiceIdentity(
          queryable,
          input.project_id,
          input.service_name,
          input.environment
        );
        const fingerprint =
          service.input_name === input.service_name
            ? originalFingerprint
            : buildWarningHotspotFingerprint({
                ...fingerprintInput,
                service_name: service.input_name
              });
        return recordImprovementOpportunityOccurrence(queryable, {
          project_id: input.project_id,
          service_name: service.input_name,
          environment: input.environment,
          kind: "warning_hotspot",
          severity: input.severity,
          confidence: input.confidence,
          fingerprint,
          original_fingerprint: originalFingerprint,
          title,
          summary,
          evidence,
          occurred_at: input.occurred_at,
          source_event_id: input.source_event_id,
          source_event_type: "log_event",
          threshold: input.threshold
        });
      };

      if (accountAnalyticsStore === undefined) {
        const recorded = await recordOccurrence(db);
        return recorded === null ? null : toRecordedImprovementResult(recorded);
      }

      return runInTransaction(db, async (tx) => {
        const recorded = await recordOccurrence(tx);
        if (recorded === null) {
          return null;
        }

        const organizationId = await resolveOrganizationIdForProject(tx, input.project_id);
        if (organizationId !== null && recorded.lifecycle_transition !== "none") {
          const deltas: Partial<Record<AccountMetricKey, number>> =
            recorded.lifecycle_transition === "opened"
              ? {
                  improvements_opened: 1,
                  [getImprovementOpenedMetricKey("warning_hotspot")]: 1
                }
              : {
                  improvements_reopened: 1
                };
          await recordImprovementMetricDeltas(accountAnalyticsStore, tx, {
            organization_id: organizationId,
            occurred_at: input.occurred_at,
            source: "improvement_occurrence",
            dedupe_key: `improvement_occurrence:${recorded.opportunity_id}:${input.source_event_id}`,
            deltas
          });
        }

        return toRecordedImprovementResult(recorded);
      });
    },

    async recordRequestPattern(input) {
      const fingerprintInput = {
        kind: input.kind,
        service_name: input.service_name,
        environment: input.environment,
        http_method: input.http_method,
        route_template: input.route_template,
        response_status: input.kind === "request_failure_pattern" ? input.response_status : null
      };
      const originalFingerprint = buildRequestPatternFingerprint(fingerprintInput);
      const routeLabel = `${input.http_method} ${input.route_template}`;
      const title =
        input.kind === "slow_request"
          ? `Slow request pattern: ${routeLabel}`
          : `Request failure pattern: ${routeLabel} returned ${input.response_status}`;
      const summary =
        input.kind === "slow_request"
          ? `Repeated slow requests detected for ${routeLabel} in ${input.environment}.`
          : `Repeated request failures detected for ${routeLabel} (${input.response_status}) in ${input.environment}.`;
      const evidence = {
        kind: input.kind,
        route_template: input.route_template,
        http_method: input.http_method,
        response_status: input.response_status,
        duration_ms: input.duration_ms,
        threshold: input.threshold,
        ...(input.kind === "slow_request" && input.slow_request_duration_threshold_ms !== undefined
          ? { slow_request_duration_threshold_ms: input.slow_request_duration_threshold_ms }
          : {})
      };

      const recordOccurrence = async (
        queryable: Queryable
      ): ReturnType<typeof recordImprovementOpportunityOccurrence> => {
        const service = await getOrCreateServiceIdentity(
          queryable,
          input.project_id,
          input.service_name,
          input.environment
        );
        const fingerprint =
          service.input_name === input.service_name
            ? originalFingerprint
            : buildRequestPatternFingerprint({
                ...fingerprintInput,
                service_name: service.input_name
              });
        return recordImprovementOpportunityOccurrence(queryable, {
          project_id: input.project_id,
          service_name: service.input_name,
          environment: input.environment,
          kind: input.kind,
          severity: input.severity,
          confidence: input.confidence,
          fingerprint,
          original_fingerprint: originalFingerprint,
          title,
          summary,
          evidence,
          occurred_at: input.occurred_at,
          source_event_id: input.source_event_id,
          source_event_type: "request_event",
          threshold: input.threshold
        });
      };

      if (accountAnalyticsStore === undefined) {
        const recorded = await recordOccurrence(db);
        return recorded === null ? null : toRecordedImprovementResult(recorded);
      }

      return runInTransaction(db, async (tx) => {
        const recorded = await recordOccurrence(tx);
        if (recorded === null) {
          return null;
        }

        const organizationId = await resolveOrganizationIdForProject(tx, input.project_id);
        if (organizationId !== null && recorded.lifecycle_transition !== "none") {
          const deltas: Partial<Record<AccountMetricKey, number>> =
            recorded.lifecycle_transition === "opened"
              ? {
                  improvements_opened: 1,
                  [getImprovementOpenedMetricKey(input.kind)]: 1
                }
              : {
                  improvements_reopened: 1
                };
          await recordImprovementMetricDeltas(accountAnalyticsStore, tx, {
            organization_id: organizationId,
            occurred_at: input.occurred_at,
            source: "improvement_occurrence",
            dedupe_key: `improvement_occurrence:${recorded.opportunity_id}:${input.source_event_id}`,
            deltas
          });
        }

        return toRecordedImprovementResult(recorded);
      });
    },

    async recordIncidentPattern(input) {
      const deployKey =
        input.regression_deploy === undefined || input.regression_deploy === null
          ? null
          : input.regression_deploy.deployment_id ||
            input.regression_deploy.commit_sha ||
            input.regression_deploy.version;
      const fingerprint = buildIncidentPatternFingerprint({
        kind: input.kind,
        incident_id: input.incident_id,
        deploy_key: deployKey
      });
      const title =
        input.kind === "recurring_incident"
          ? `Recurring incident: ${input.incident_title}`
          : `Post-deploy regression: ${input.incident_title}`;
      const summary =
        input.kind === "recurring_incident"
          ? `Incident has recurred ${input.incident_occurrence_count} times for ${input.service_name} in ${input.environment}.`
          : `Incident regressed after deploy for ${input.service_name} in ${input.environment}.`;
      const evidence = {
        kind: input.kind,
        incident_id: input.incident_id,
        incident_title: input.incident_title,
        incident_occurrence_count: input.incident_occurrence_count,
        threshold: input.threshold,
        ...(input.regression_deploy === undefined || input.regression_deploy === null
          ? {}
          : {
              regression_deploy: {
                deployment_id: input.regression_deploy.deployment_id,
                commit_sha: input.regression_deploy.commit_sha,
                version: input.regression_deploy.version,
                branch: input.regression_deploy.branch,
                deployed_at: input.regression_deploy.deployed_at,
                minutes_since_deploy: input.regression_deploy.minutes_since_deploy
              }
            })
      };

      const recordOccurrence = async (
        queryable: Queryable
      ): ReturnType<typeof recordImprovementOpportunityOccurrence> => {
        const service = await getOrCreateServiceIdentity(
          queryable,
          input.project_id,
          input.service_name,
          input.environment
        );
        return recordImprovementOpportunityOccurrence(queryable, {
          project_id: input.project_id,
          service_name: service.input_name,
          environment: input.environment,
          kind: input.kind,
          severity: input.incident_severity,
          confidence: input.confidence,
          fingerprint,
          title,
          summary,
          evidence,
          occurred_at: input.occurred_at,
          source_event_id: input.source_event_id,
          source_event_type: input.source_event_type,
          threshold: input.threshold,
          related_incident_id: input.incident_id
        });
      };

      if (accountAnalyticsStore === undefined) {
        const recorded = await recordOccurrence(db);
        return recorded === null ? null : toRecordedImprovementResult(recorded);
      }

      return runInTransaction(db, async (tx) => {
        const recorded = await recordOccurrence(tx);
        if (recorded === null) {
          return null;
        }

        const organizationId = await resolveOrganizationIdForProject(tx, input.project_id);
        if (organizationId !== null && recorded.lifecycle_transition !== "none") {
          const deltas: Partial<Record<AccountMetricKey, number>> =
            recorded.lifecycle_transition === "opened"
              ? {
                  improvements_opened: 1,
                  [getImprovementOpenedMetricKey(input.kind)]: 1
                }
              : {
                  improvements_reopened: 1
                };
          await recordImprovementMetricDeltas(accountAnalyticsStore, tx, {
            organization_id: organizationId,
            occurred_at: input.occurred_at,
            source: "improvement_occurrence",
            dedupe_key: `improvement_occurrence:${recorded.opportunity_id}:${input.source_event_id}`,
            deltas
          });
        }

        return toRecordedImprovementResult(recorded);
      });
    },

    ...createImprovementOpportunityRead(db),

    async resolveImprovementForOrganization(input) {
      const params: unknown[] = [
        input.organization_id,
        input.improvement_id,
        input.resolved_at,
        input.resolved_by_member_id,
        input.user_id ?? null
      ];
      const scopeSql = projectReadScopeSql(params, input, "io.project_id");
      const resolveImprovement = (
        queryable: Queryable
      ): Promise<QueryResult<ImprovementRetrievalRow>> =>
        queryable.query<ImprovementRetrievalRow>(
          `
            WITH updated AS (
              UPDATE improvement_opportunities io
              SET
                status = 'resolved',
                resolved_at = COALESCE(io.resolved_at, $3::timestamptz),
                resolved_by_user_id = COALESCE(io.resolved_by_user_id, $4::uuid),
                snoozed_until = NULL,
                updated_at = now()
              FROM projects p
              WHERE debugbundle_canonical_project(io.project_id) = p.id
                AND (
                  (
                    $5::uuid IS NULL
                    AND p.organization_id = $1::uuid
                  )
                  OR (
                    $5::uuid IS NOT NULL
                    AND (
                      ${projectActorAllowedSql("p.id", "$5::uuid", input, true)}
                    )
                  )
                )
                ${scopeSql}
                AND io.id = $2::uuid
                AND io.status <> 'resolved'
              RETURNING io.*
            )
            SELECT
              updated.id::text AS improvement_id,
              updated.project_id::text AS project_id,
              CASE WHEN p.id<>updated.project_id THEN p.id END AS canonical_project_id,
              sd.id AS service_definition_id,sd.name AS canonical_service_name,
              p.name AS project_name,
            p.color_tag AS project_color_tag,
              p.slug AS project_slug,
              updated.service_id::text AS service_id,
              updated.service_name,
              s.runtime AS service_runtime,
              s.framework AS service_framework,
              updated.environment,
              updated.kind,
              updated.status,
              updated.severity,
              updated.confidence::float8 AS confidence,
              updated.fingerprint,
              updated.title,
              updated.summary,
              updated.occurrence_count,
              updated.evidence,
              updated.related_incident_ids::text[] AS related_incident_ids,
              updated.first_detected_at::text AS first_detected_at,
              updated.last_detected_at::text AS last_detected_at,
              updated.resolved_at::text AS resolved_at,
              updated.snoozed_until::text AS snoozed_until,
              updated.bundle_generation_number,
              updated.bundle_created_at::text AS bundle_created_at,
              updated.bundle_updated_at::text AS bundle_updated_at,
              updated.bundle_failure_reason
            FROM updated
            JOIN projects p ON p.id = debugbundle_canonical_project(updated.project_id)
            LEFT JOIN services s ON s.id = updated.service_id
            LEFT JOIN service_definitions sd ON sd.id=s.service_definition_id
          `,
          params
        );

      if (accountAnalyticsStore === undefined) {
        const result = await resolveImprovement(db);
        return result.rows[0] ?? null;
      }

      return runInTransaction(db, async (tx) => {
        const result = await resolveImprovement(tx);
        const row = result.rows[0] ?? null;
        if (row !== null) {
          await recordImprovementMetricDeltas(accountAnalyticsStore, tx, {
            organization_id: input.organization_id,
            occurred_at: input.resolved_at,
            source: "improvement_resolved",
            dedupe_key: `improvement_resolved:${input.improvement_id}:${input.resolved_at}`,
            deltas: {
              improvements_resolved: 1
            }
          });
        }
        return row;
      });
    },

    async resolveIncidentDerivedImprovementsForIncident(input) {
      const resolveIncidentDerivedImprovements = (
        queryable: Queryable
      ): Promise<QueryResult<{ resolved_count: number } & Record<string, unknown>>> =>
        queryable.query<{ resolved_count: number } & Record<string, unknown>>(
          `
            WITH candidates AS (
              SELECT io.id
              FROM improvement_opportunities io
              JOIN projects p ON p.id = debugbundle_canonical_project(io.project_id)
              WHERE p.organization_id = $1::uuid
                AND $2::uuid = ANY(io.related_incident_ids)
                AND io.kind IN ('recurring_incident', 'post_deploy_regression')
                AND io.status <> 'resolved'
                AND NOT EXISTS (
                  SELECT 1
                  FROM unnest(io.related_incident_ids) AS related_incident_id
                  LEFT JOIN incidents i ON i.id = related_incident_id
                    AND i.project_id = io.project_id
                  WHERE i.id IS NULL
                    OR i.status <> 'resolved'
                )
            ),
            updated AS (
              UPDATE improvement_opportunities io
              SET
                status = 'resolved',
                resolved_at = COALESCE(io.resolved_at, $4::timestamptz),
                resolved_by_user_id = COALESCE(io.resolved_by_user_id, $3::uuid),
                snoozed_until = NULL,
                updated_at = now()
              FROM candidates
              WHERE io.id = candidates.id
              RETURNING 1
            )
            SELECT COUNT(*)::int AS resolved_count
            FROM updated
          `,
          [input.organization_id, input.incident_id, input.resolved_by_member_id, input.resolved_at]
        );

      if (accountAnalyticsStore === undefined) {
        const result = await resolveIncidentDerivedImprovements(db);
        return result.rows[0]?.resolved_count ?? 0;
      }

      return runInTransaction(db, async (tx) => {
        const result = await resolveIncidentDerivedImprovements(tx);
        const resolvedCount = result.rows[0]?.resolved_count ?? 0;
        if (resolvedCount > 0) {
          await recordImprovementMetricDeltas(accountAnalyticsStore, tx, {
            organization_id: input.organization_id,
            occurred_at: input.resolved_at,
            source: "incident_derived_improvement_resolved",
            dedupe_key: `incident_derived_improvement_resolved:${input.incident_id}:${input.resolved_at}`,
            deltas: {
              improvements_resolved: resolvedCount
            }
          });
        }
        return resolvedCount;
      });
    },

    async reopenImprovementForOrganization(input) {
      const params: unknown[] = [
        input.organization_id,
        input.improvement_id,
        input.user_id ?? null
      ];
      const scopeSql = projectReadScopeSql(params, input, "io.project_id");
      const reopenImprovement = (
        queryable: Queryable
      ): Promise<QueryResult<ImprovementRetrievalRow>> =>
        queryable.query<ImprovementRetrievalRow>(
          `
            WITH updated AS (
              UPDATE improvement_opportunities io
              SET
                status = 'open',
                resolved_at = NULL,
                resolved_by_user_id = NULL,
                snoozed_until = NULL,
                updated_at = now()
              FROM projects p
              WHERE debugbundle_canonical_project(io.project_id) = p.id
                AND (
                  (
                    $3::uuid IS NULL
                    AND p.organization_id = $1::uuid
                  )
                  OR (
                    $3::uuid IS NOT NULL
                    AND (
                      ${projectActorAllowedSql("p.id", "$3::uuid", input, true)}
                    )
                  )
                )
                ${scopeSql}
                AND io.id = $2::uuid
                AND io.status <> 'open'
              RETURNING io.*
            )
            SELECT
              updated.id::text AS improvement_id,
              updated.project_id::text AS project_id,
              CASE WHEN p.id<>updated.project_id THEN p.id END AS canonical_project_id,
              sd.id AS service_definition_id,sd.name AS canonical_service_name,
              p.name AS project_name,
            p.color_tag AS project_color_tag,
              p.slug AS project_slug,
              updated.service_id::text AS service_id,
              updated.service_name,
              s.runtime AS service_runtime,
              s.framework AS service_framework,
              updated.environment,
              updated.kind,
              updated.status,
              updated.severity,
              updated.confidence::float8 AS confidence,
              updated.fingerprint,
              updated.title,
              updated.summary,
              updated.occurrence_count,
              updated.evidence,
              updated.related_incident_ids::text[] AS related_incident_ids,
              updated.first_detected_at::text AS first_detected_at,
              updated.last_detected_at::text AS last_detected_at,
              updated.resolved_at::text AS resolved_at,
              updated.snoozed_until::text AS snoozed_until,
              updated.bundle_generation_number,
              updated.bundle_created_at::text AS bundle_created_at,
              updated.bundle_updated_at::text AS bundle_updated_at,
              updated.bundle_failure_reason
            FROM updated
            JOIN projects p ON p.id = debugbundle_canonical_project(updated.project_id)
            LEFT JOIN services s ON s.id = updated.service_id
            LEFT JOIN service_definitions sd ON sd.id=s.service_definition_id
          `,
          params
        );

      if (accountAnalyticsStore === undefined) {
        const result = await reopenImprovement(db);
        return result.rows[0] ?? null;
      }

      return runInTransaction(db, async (tx) => {
        const previousState = await getImprovementLifecycleState(tx, input);
        const result = await reopenImprovement(tx);
        const row = result.rows[0] ?? null;
        if (row !== null && previousState !== null) {
          await recordImprovementMetricDeltas(accountAnalyticsStore, tx, {
            organization_id: input.organization_id,
            occurred_at: new Date().toISOString(),
            source: "improvement_reopened",
            dedupe_key: `improvement_reopened:${input.improvement_id}:${previousState.status}:${previousState.resolved_at ?? previousState.snoozed_until ?? "none"}`,
            deltas: {
              improvements_reopened: 1
            }
          });
        }
        return row;
      });
    },

    async snoozeImprovementForOrganization(input) {
      const params: unknown[] = [
        input.organization_id,
        input.improvement_id,
        input.snoozed_until,
        input.user_id ?? null
      ];
      const scopeSql = projectReadScopeSql(params, input, "io.project_id");
      const snoozeImprovement = (
        queryable: Queryable
      ): Promise<QueryResult<ImprovementRetrievalRow>> =>
        queryable.query<ImprovementRetrievalRow>(
          `
            WITH updated AS (
              UPDATE improvement_opportunities io
              SET
                status = 'snoozed',
                resolved_at = NULL,
                resolved_by_user_id = NULL,
                snoozed_until = $3::timestamptz,
                updated_at = now()
              FROM projects p
              WHERE debugbundle_canonical_project(io.project_id) = p.id
                AND (
                  (
                    $4::uuid IS NULL
                    AND p.organization_id = $1::uuid
                  )
                  OR (
                    $4::uuid IS NOT NULL
                    AND (
                      ${projectActorAllowedSql("p.id", "$4::uuid", input, true)}
                    )
                  )
                )
                ${scopeSql}
                AND io.id = $2::uuid
                AND (io.status <> 'snoozed' OR io.snoozed_until IS DISTINCT FROM $3::timestamptz)
              RETURNING io.*
            )
            SELECT
              updated.id::text AS improvement_id,
              updated.project_id::text AS project_id,
              CASE WHEN p.id<>updated.project_id THEN p.id END AS canonical_project_id,
              sd.id AS service_definition_id,sd.name AS canonical_service_name,
              p.name AS project_name,
            p.color_tag AS project_color_tag,
              p.slug AS project_slug,
              updated.service_id::text AS service_id,
              updated.service_name,
              s.runtime AS service_runtime,
              s.framework AS service_framework,
              updated.environment,
              updated.kind,
              updated.status,
              updated.severity,
              updated.confidence::float8 AS confidence,
              updated.fingerprint,
              updated.title,
              updated.summary,
              updated.occurrence_count,
              updated.evidence,
              updated.related_incident_ids::text[] AS related_incident_ids,
              updated.first_detected_at::text AS first_detected_at,
              updated.last_detected_at::text AS last_detected_at,
              updated.resolved_at::text AS resolved_at,
              updated.snoozed_until::text AS snoozed_until,
              updated.bundle_generation_number,
              updated.bundle_created_at::text AS bundle_created_at,
              updated.bundle_updated_at::text AS bundle_updated_at,
              updated.bundle_failure_reason
            FROM updated
            JOIN projects p ON p.id = debugbundle_canonical_project(updated.project_id)
            LEFT JOIN services s ON s.id = updated.service_id
            LEFT JOIN service_definitions sd ON sd.id=s.service_definition_id
          `,
          params
        );

      if (accountAnalyticsStore === undefined) {
        const result = await snoozeImprovement(db);
        return result.rows[0] ?? null;
      }

      return runInTransaction(db, async (tx) => {
        const result = await snoozeImprovement(tx);
        const row = result.rows[0] ?? null;
        if (row !== null) {
          await recordImprovementMetricDeltas(accountAnalyticsStore, tx, {
            organization_id: input.organization_id,
            occurred_at: input.snoozed_until,
            source: "improvement_snoozed",
            dedupe_key: `improvement_snoozed:${input.improvement_id}:${input.snoozed_until}`,
            deltas: {
              improvements_snoozed: 1
            }
          });
        }
        return row;
      });
    },

    ...createImprovementBundleMetadata(db)
  };
}
