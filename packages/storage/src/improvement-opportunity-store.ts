import { randomUUID } from "node:crypto";

import type { EventEnvelope, ImprovementBundleSensitivity, TierName } from "../../shared-types/src/index.js";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import type {
  ImprovementRetrievalRecord,
  ImprovementsCursor,
  Queryable,
  RetainedBundleOwnerReference,
  ReopenImprovementForOrganizationInput,
  ResolveImprovementForOrganizationInput,
  SnoozeImprovementForOrganizationInput
} from "./types.js";
import {
  buildIncidentPatternFingerprint,
  buildRequestPatternFingerprint,
  buildWarningHotspotFingerprint,
  recordImprovementOpportunityOccurrence,
  type RecordedImprovementOpportunityOccurrence
} from "./improvement-opportunity-recording.js";
import { pruneRetainedBundleOwnersForProject } from "./retained-bundle-pruning.js";

export type ImprovementOpportunityKind =
  | "warning_hotspot"
  | "slow_request"
  | "request_failure_pattern"
  | "recurring_incident"
  | "post_deploy_regression";
export type ImprovementOpportunityStatus = "open" | "resolved" | "snoozed";
export type ImprovementOpportunitySeverity = "low" | "medium" | "high" | "critical";
export type ImprovementBundleTrigger = "occurrence_threshold";

export interface ProjectImprovementExecutionSettings {
  plan: TierName;
  automated_improvement_bundles_enabled: boolean;
  improvement_bundle_sensitivity: ImprovementBundleSensitivity;
}

export interface ImprovementOpportunityRecord {
  opportunity_id: string;
  project_id: string;
  project_slug: string;
  service_id: string | null;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  kind: ImprovementOpportunityKind;
  status: ImprovementOpportunityStatus;
  severity: ImprovementOpportunitySeverity;
  confidence: number;
  fingerprint: string;
  title: string;
  summary: string;
  occurrence_count: number;
  evidence: Record<string, unknown>;
  related_incident_ids: string[];
  first_detected_at: string;
  last_detected_at: string;
  last_source_event_id: string | null;
  bundle_generation_number: number;
  bundle_created_at: string | null;
  bundle_updated_at: string | null;
  bundle_source_event_id: string | null;
  bundle_failure_reason: string | null;
}

export interface ImprovementEventReference {
  event_id: string;
  event_type: EventEnvelope["event_type"];
  occurred_at: string;
}

export interface RecordWarningHotspotInput {
  project_id: string;
  service_name: string;
  environment: string;
  normalized_message: string;
  source_event_id: string;
  occurred_at: string;
  severity: ImprovementOpportunitySeverity;
  confidence: number;
  threshold: number;
}

export interface RecordWarningHotspotResult {
  opportunity_id: string;
  occurrence_count: number;
  bundle_generation_number: number;
  should_generate_bundle: boolean;
}

export interface RecordRequestPatternInput {
  project_id: string;
  kind: "slow_request" | "request_failure_pattern";
  service_name: string;
  environment: string;
  route_template: string;
  http_method: string;
  response_status: number;
  duration_ms: number;
  source_event_id: string;
  occurred_at: string;
  severity: ImprovementOpportunitySeverity;
  confidence: number;
  threshold: number;
  slow_request_duration_threshold_ms?: number;
}

export type RecordRequestPatternResult = RecordedImprovementOpportunityOccurrence;

export interface RecordIncidentPatternInput {
  project_id: string;
  kind: "recurring_incident" | "post_deploy_regression";
  service_name: string;
  environment: string;
  incident_id: string;
  incident_title: string;
  incident_occurrence_count: number;
  incident_severity: ImprovementOpportunitySeverity;
  source_event_id: string;
  source_event_type: EventEnvelope["event_type"];
  occurred_at: string;
  confidence: number;
  threshold: number;
  regression_deploy?: {
    deployment_id: string;
    commit_sha: string | null;
    version: string | null;
    branch: string | null;
    deployed_at: string;
    minutes_since_deploy: number;
  } | null;
}

export type RecordIncidentPatternResult = RecordedImprovementOpportunityOccurrence;

export interface ReservedImprovementBundleGeneration {
  generation_number: number;
  created_at: string;
  updated_at: string;
  source_event_id: string;
  source_occurred_at: string;
  trigger: ImprovementBundleTrigger;
}

export interface ImprovementOpportunityStore {
  getImprovementExecutionSettings(projectId: string): Promise<ProjectImprovementExecutionSettings | null>;
  recordWarningHotspot(input: RecordWarningHotspotInput): Promise<RecordWarningHotspotResult | null>;
  recordRequestPattern(input: RecordRequestPatternInput): Promise<RecordRequestPatternResult | null>;
  recordIncidentPattern?(input: RecordIncidentPatternInput): Promise<RecordIncidentPatternResult | null>;
  listImprovementsForOrganization(input: {
    organization_id: string;
    user_id?: string;
    project_id?: string;
    environment?: string;
    service?: string;
    status?: ImprovementOpportunityStatus;
    severity?: ImprovementOpportunitySeverity;
    kind?: ImprovementOpportunityKind;
    cursor?: ImprovementsCursor;
    limit: number;
  }): Promise<ImprovementRetrievalRecord[]>;
  getImprovementForOrganization(input: {
    organization_id: string;
    improvement_id: string;
    user_id?: string;
  }): Promise<ImprovementRetrievalRecord | null>;
  resolveImprovementForOrganization(input: ResolveImprovementForOrganizationInput): Promise<ImprovementRetrievalRecord | null>;
  resolveIncidentDerivedImprovementsForIncident?(input: {
    organization_id: string;
    incident_id: string;
    resolved_by_member_id: string;
    resolved_at: string;
  }): Promise<number>;
  reopenImprovementForOrganization(input: ReopenImprovementForOrganizationInput): Promise<ImprovementRetrievalRecord | null>;
  snoozeImprovementForOrganization?(input: SnoozeImprovementForOrganizationInput): Promise<ImprovementRetrievalRecord | null>;
  getImprovementBundleBuildContext(input: { project_id: string; opportunity_id: string }): Promise<ImprovementOpportunityRecord | null>;
  listImprovementEventReferences(input: { opportunity_id: string; limit: number }): Promise<ImprovementEventReference[]>;
  hasImprovementBundleGenerationForSourceEvent(input: { opportunity_id: string; event_id: string }): Promise<boolean>;
  reserveImprovementBundleGeneration(input: {
    opportunity_id: string;
    event_id: string;
    occurred_at: string;
    trigger: ImprovementBundleTrigger;
  }): Promise<ReservedImprovementBundleGeneration>;
  markImprovementBundleGenerationFailure(input: { opportunity_id: string; reason: string | null }): Promise<void>;
  pruneRetainedBundleOwnersForProject(input: {
    project_id: string;
    retained_bundle_limit: number;
  }): Promise<RetainedBundleOwnerReference[]>;
}

function normalizePlan(plan: string | null | undefined): TierName {
  if (plan === "solo" || plan === "team") {
    return plan;
  }

  return "free";
}

type ImprovementOpportunityRow = ImprovementOpportunityRecord & Record<string, unknown>;
type ImprovementRetrievalRow = ImprovementRetrievalRecord & Record<string, unknown>;

function buildImprovementSelectClause(): string {
  return `
    io.id::text AS improvement_id,
    io.project_id::text AS project_id,
    p.name AS project_name,
    p.slug AS project_slug,
    io.service_id::text AS service_id,
    io.service_name,
    s.runtime AS service_runtime,
    s.framework AS service_framework,
    io.environment,
    io.kind,
    io.status,
    io.severity,
    io.confidence::float8 AS confidence,
    io.fingerprint,
    io.title,
    io.summary,
    io.occurrence_count,
    io.evidence,
    io.related_incident_ids::text[] AS related_incident_ids,
    io.first_detected_at::text AS first_detected_at,
    io.last_detected_at::text AS last_detected_at,
    io.resolved_at::text AS resolved_at,
    io.snoozed_until::text AS snoozed_until,
    io.bundle_generation_number,
    io.bundle_created_at::text AS bundle_created_at,
    io.bundle_updated_at::text AS bundle_updated_at,
    io.bundle_failure_reason
  `;
}

export function createPostgresImprovementOpportunityStore(db: Queryable): ImprovementOpportunityStore {
  return {
    async getImprovementExecutionSettings(projectId) {
      const result = await db.query<{
        plan: string;
        automated_improvement_bundles_enabled: boolean;
        improvement_bundle_sensitivity: ImprovementBundleSensitivity;
      } & Record<string, unknown>>(
        `
          SELECT
            COALESCE(o.plan, 'free') AS plan,
            p.automated_improvement_bundles_enabled,
            p.improvement_bundle_sensitivity
          FROM projects p
          JOIN organizations o ON o.id = p.organization_id
          WHERE p.id = $1::uuid
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
      const fingerprint = buildWarningHotspotFingerprint({
        service_name: input.service_name,
        environment: input.environment,
        normalized_message: input.normalized_message
      });
      const title = `Warning hotspot: ${input.normalized_message}`;
      const summary = `Repeated warning log pattern detected for ${input.service_name} in ${input.environment}.`;
      const evidence = {
        kind: "warning_hotspot",
        log_level: "warning",
        normalized_message: input.normalized_message,
        threshold: input.threshold
      };

      return recordImprovementOpportunityOccurrence(db, {
        project_id: input.project_id,
        service_name: input.service_name,
        environment: input.environment,
        kind: "warning_hotspot",
        severity: input.severity,
        confidence: input.confidence,
        fingerprint,
        title,
        summary,
        evidence,
        occurred_at: input.occurred_at,
        source_event_id: input.source_event_id,
        source_event_type: "log_event",
        threshold: input.threshold
      });
    },

    async recordRequestPattern(input) {
      const fingerprint = buildRequestPatternFingerprint({
        kind: input.kind,
        service_name: input.service_name,
        environment: input.environment,
        http_method: input.http_method,
        route_template: input.route_template,
        response_status: input.kind === "request_failure_pattern" ? input.response_status : null
      });
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

      return recordImprovementOpportunityOccurrence(db, {
        project_id: input.project_id,
        service_name: input.service_name,
        environment: input.environment,
        kind: input.kind,
        severity: input.severity,
        confidence: input.confidence,
        fingerprint,
        title,
        summary,
        evidence,
        occurred_at: input.occurred_at,
        source_event_id: input.source_event_id,
        source_event_type: "request_event",
        threshold: input.threshold
      });
    },

    async recordIncidentPattern(input) {
      const deployKey =
        input.regression_deploy === undefined || input.regression_deploy === null
          ? null
          : input.regression_deploy.deployment_id || input.regression_deploy.commit_sha || input.regression_deploy.version;
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

      return recordImprovementOpportunityOccurrence(db, {
        project_id: input.project_id,
        service_name: input.service_name,
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
    },

    async listImprovementsForOrganization(input) {
      const parameters: Array<string | number | null> = [input.organization_id, input.user_id ?? null];
      const predicates = [
        `(
          (
            $2::uuid IS NULL
            AND p.organization_id = $1::uuid
          )
          OR (
            $2::uuid IS NOT NULL
            AND (
              p.owner_user_id = $2::uuid
              OR EXISTS (
                SELECT 1
                FROM project_members pm
                WHERE pm.project_id = p.id
                  AND pm.user_id = $2::uuid
              )
            )
          )
        )`,
        `(
          io.status <> 'open'
          OR io.kind = 'post_deploy_regression'
          OR (
            io.kind = 'recurring_incident'
            AND COALESCE(
              CASE
                WHEN COALESCE(io.evidence->>'incident_occurrence_count', '') ~ '^[0-9]+$'
                  THEN (io.evidence->>'incident_occurrence_count')::int
              END,
              io.occurrence_count
            )
              >= COALESCE(
                CASE
                  WHEN COALESCE(io.evidence->>'threshold', '') ~ '^[0-9]+$'
                    THEN (io.evidence->>'threshold')::int
                END,
                1
              )
          )
          OR io.bundle_generation_number > 0
          OR io.bundle_failure_reason IS NOT NULL
        )`,
        `NOT (
          io.kind = 'request_failure_pattern'
          AND COALESCE(io.evidence->>'response_status', '') ~ '^[0-9]+$'
          AND (io.evidence->>'response_status')::int = 404
          AND upper(COALESCE(io.evidence->>'http_method', '')) = 'GET'
          AND (
            lower(regexp_replace(COALESCE(io.evidence->>'route_template', ''), '/+$', '')) IN (
              '/.env',
              '/__debug__/render_panel',
              '/actuator',
              '/autodiscover/autodiscover.json',
              '/cpanel',
              '/favicon.ico',
              '/geoserver/web',
              '/logon/logonpoint/index.html',
              '/owa/auth/logon.aspx',
              '/robots.txt',
              '/rdweb/pages',
              '/web',
              '/webclient/login.xhtml',
              '/webconsole',
              '/webui',
              '/whm',
              '/wp-admin',
              '/wp-login.php',
              '/wsman',
              '/xmlrpc.php'
            )
            OR lower(COALESCE(io.evidence->>'route_template', '')) LIKE '/owa/%'
            OR lower(COALESCE(io.evidence->>'route_template', '')) LIKE '/rdweb/%'
            OR lower(COALESCE(io.evidence->>'route_template', '')) LIKE '/vpn/%'
            OR lower(COALESCE(io.evidence->>'route_template', '')) LIKE '/wp-%'
          )
        )`
      ];

      if (input.project_id !== undefined) {
        parameters.push(input.project_id);
        predicates.push(`io.project_id = $${parameters.length}::uuid`);
      }
      if (input.environment !== undefined) {
        parameters.push(input.environment);
        predicates.push(`io.environment = $${parameters.length}`);
      }
      if (input.service !== undefined) {
        parameters.push(input.service);
        predicates.push(`io.service_name = $${parameters.length}`);
      }
      if (input.status !== undefined) {
        parameters.push(input.status);
        predicates.push(`io.status = $${parameters.length}`);
      }
      if (input.severity !== undefined) {
        parameters.push(input.severity);
        predicates.push(`io.severity = $${parameters.length}`);
      }
      if (input.kind !== undefined) {
        parameters.push(input.kind);
        predicates.push(`io.kind = $${parameters.length}`);
      }
      if (input.cursor !== undefined) {
        parameters.push(input.cursor.last_detected_at, input.cursor.improvement_id);
        predicates.push(`(io.last_detected_at, io.id) < ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`);
      }

      parameters.push(input.limit);

      const result = await db.query<ImprovementRetrievalRow>(
        `
          SELECT
            ${buildImprovementSelectClause()}
          FROM improvement_opportunities io
          JOIN projects p ON p.id = io.project_id
          LEFT JOIN services s ON s.id = io.service_id
          WHERE ${predicates.join("\n            AND ")}
          ORDER BY io.last_detected_at DESC, io.id DESC
          LIMIT $${parameters.length}
        `,
        parameters
      );

      return result.rows;
    },

    async getImprovementForOrganization(input) {
      const result = await db.query<ImprovementRetrievalRow>(
        `
          SELECT
            ${buildImprovementSelectClause()}
          FROM improvement_opportunities io
          JOIN projects p ON p.id = io.project_id
          LEFT JOIN services s ON s.id = io.service_id
          WHERE io.id = $2::uuid
            AND (
              (
                $3::uuid IS NULL
                AND p.organization_id = $1::uuid
              )
              OR (
                $3::uuid IS NOT NULL
                AND (
                  p.owner_user_id = $3::uuid
                  OR EXISTS (
                    SELECT 1
                    FROM project_members pm
                    WHERE pm.project_id = p.id
                      AND pm.user_id = $3::uuid
                  )
                )
              )
            )
          LIMIT 1
        `,
        [input.organization_id, input.improvement_id, input.user_id ?? null]
      );

      return result.rows[0] ?? null;
    },

    async resolveImprovementForOrganization(input) {
      const result = await db.query<ImprovementRetrievalRow>(
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
            WHERE io.project_id = p.id
              AND (
                (
                  $5::uuid IS NULL
                  AND p.organization_id = $1::uuid
                )
                OR (
                  $5::uuid IS NOT NULL
                  AND (
                    p.owner_user_id = $5::uuid
                    OR EXISTS (
                      SELECT 1
                      FROM project_members pm
                      WHERE pm.project_id = p.id
                        AND pm.user_id = $5::uuid
                    )
                  )
                )
              )
              AND io.id = $2::uuid
            RETURNING io.*
          )
          SELECT
            updated.id::text AS improvement_id,
            updated.project_id::text AS project_id,
            p.name AS project_name,
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
          JOIN projects p ON p.id = updated.project_id
          LEFT JOIN services s ON s.id = updated.service_id
        `,
        [input.organization_id, input.improvement_id, input.resolved_at, input.resolved_by_member_id, input.user_id ?? null]
      );

      return result.rows[0] ?? null;
    },

    async resolveIncidentDerivedImprovementsForIncident(input) {
      const result = await db.query<{ resolved_count: number } & Record<string, unknown>>(
        `
          WITH candidates AS (
            SELECT io.id
            FROM improvement_opportunities io
            JOIN projects p ON p.id = io.project_id
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

      return result.rows[0]?.resolved_count ?? 0;
    },

    async reopenImprovementForOrganization(input) {
      const result = await db.query<ImprovementRetrievalRow>(
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
            WHERE io.project_id = p.id
              AND (
                (
                  $3::uuid IS NULL
                  AND p.organization_id = $1::uuid
                )
                OR (
                  $3::uuid IS NOT NULL
                  AND (
                    p.owner_user_id = $3::uuid
                    OR EXISTS (
                      SELECT 1
                      FROM project_members pm
                      WHERE pm.project_id = p.id
                        AND pm.user_id = $3::uuid
                    )
                  )
                )
              )
              AND io.id = $2::uuid
            RETURNING io.*
          )
          SELECT
            updated.id::text AS improvement_id,
            updated.project_id::text AS project_id,
            p.name AS project_name,
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
          JOIN projects p ON p.id = updated.project_id
          LEFT JOIN services s ON s.id = updated.service_id
        `,
        [input.organization_id, input.improvement_id, input.user_id ?? null]
      );

      return result.rows[0] ?? null;
    },

    async snoozeImprovementForOrganization(input) {
      const result = await db.query<ImprovementRetrievalRow>(
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
            WHERE io.project_id = p.id
              AND (
                (
                  $4::uuid IS NULL
                  AND p.organization_id = $1::uuid
                )
                OR (
                  $4::uuid IS NOT NULL
                  AND (
                    p.owner_user_id = $4::uuid
                    OR EXISTS (
                      SELECT 1
                      FROM project_members pm
                      WHERE pm.project_id = p.id
                        AND pm.user_id = $4::uuid
                    )
                  )
                )
              )
              AND io.id = $2::uuid
            RETURNING io.*
          )
          SELECT
            updated.id::text AS improvement_id,
            updated.project_id::text AS project_id,
            p.name AS project_name,
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
          JOIN projects p ON p.id = updated.project_id
          LEFT JOIN services s ON s.id = updated.service_id
        `,
        [input.organization_id, input.improvement_id, input.snoozed_until, input.user_id ?? null]
      );

      return result.rows[0] ?? null;
    },

    async getImprovementBundleBuildContext(input) {
      const result = await db.query<ImprovementOpportunityRow>(
        `
          SELECT
            io.id::text AS opportunity_id,
            io.project_id::text AS project_id,
            p.slug AS project_slug,
            io.service_id::text AS service_id,
            io.service_name,
            s.runtime AS service_runtime,
            s.framework AS service_framework,
            io.environment,
            io.kind,
            io.status,
            io.severity,
            io.confidence::float8 AS confidence,
            io.fingerprint,
            io.title,
            io.summary,
            io.occurrence_count,
            io.evidence,
            io.related_incident_ids::text[] AS related_incident_ids,
            io.first_detected_at::text AS first_detected_at,
            io.last_detected_at::text AS last_detected_at,
            io.last_source_event_id::text AS last_source_event_id,
            io.bundle_generation_number,
            io.bundle_created_at::text AS bundle_created_at,
            io.bundle_updated_at::text AS bundle_updated_at,
            io.bundle_source_event_id::text AS bundle_source_event_id,
            io.bundle_failure_reason
          FROM improvement_opportunities io
          JOIN projects p ON p.id = io.project_id
          LEFT JOIN services s ON s.id = io.service_id
          WHERE io.project_id = $1::uuid
            AND io.id = $2::uuid
          LIMIT 1
        `,
        [input.project_id, input.opportunity_id]
      );

      return result.rows[0] ?? null;
    },

    async listImprovementEventReferences(input) {
      const result = await db.query<ImprovementEventReference & Record<string, unknown>>(
        `
          SELECT
            event_id::text AS event_id,
            event_type,
            occurred_at::text AS occurred_at
          FROM improvement_opportunity_events
          WHERE improvement_opportunity_id = $1::uuid
          ORDER BY occurred_at DESC, event_id DESC
          LIMIT $2
        `,
        [input.opportunity_id, input.limit]
      );

      return result.rows.reverse();
    },

    async hasImprovementBundleGenerationForSourceEvent(input) {
      const result = await db.query<{ exists: boolean } & Record<string, unknown>>(
        `
          SELECT EXISTS(
            SELECT 1
            FROM bundle_generations
            WHERE improvement_opportunity_id = $1::uuid
              AND source_event_id = $2::uuid
          ) AS exists
        `,
        [input.opportunity_id, input.event_id]
      );

      return result.rows[0]?.exists ?? false;
    },

    async reserveImprovementBundleGeneration(input) {
      const result = await db.query<{
        project_id: string;
        generation_number: number;
        created_at: string;
        updated_at: string;
        source_event_id: string;
        source_occurred_at: string;
        trigger: ImprovementBundleTrigger;
      } & Record<string, unknown>>(
        `
          WITH reserved AS (
            UPDATE improvement_opportunities
            SET
              bundle_generation_number = CASE
                WHEN bundle_source_event_id = $2::uuid THEN bundle_generation_number
                ELSE GREATEST(bundle_generation_number, 0) + 1
              END,
              bundle_created_at = CASE
                WHEN bundle_source_event_id = $2::uuid AND bundle_created_at IS NOT NULL THEN bundle_created_at
                ELSE now()
              END,
              bundle_updated_at = CASE
                WHEN bundle_source_event_id = $2::uuid AND bundle_updated_at IS NOT NULL THEN bundle_updated_at
                ELSE now()
              END,
              bundle_source_event_id = $2::uuid,
              bundle_failure_reason = NULL,
              updated_at = now()
            WHERE id = $1::uuid
            RETURNING
              project_id::text AS project_id,
              bundle_generation_number AS generation_number,
              bundle_created_at::text AS created_at,
              bundle_updated_at::text AS updated_at,
              bundle_source_event_id::text AS source_event_id
          ),
          persisted AS (
            INSERT INTO bundle_generations (
              id,
              project_id,
              incident_id,
              improvement_opportunity_id,
              bundle_type,
              generation_number,
              source_event_id,
              source_occurred_at,
              trigger,
              created_at,
              updated_at
            )
            SELECT
              $5::uuid,
              reserved.project_id::uuid,
              NULL,
              $1::uuid,
              'improvement',
              reserved.generation_number,
              reserved.source_event_id::uuid,
              $3::timestamptz,
              $4,
              reserved.created_at::timestamptz,
              reserved.updated_at::timestamptz
            FROM reserved
            ON CONFLICT (improvement_opportunity_id, source_event_id)
            WHERE improvement_opportunity_id IS NOT NULL
            DO UPDATE SET
              generation_number = EXCLUDED.generation_number,
              trigger = EXCLUDED.trigger,
              updated_at = EXCLUDED.updated_at
            RETURNING 1
          )
          SELECT
            reserved.project_id,
            reserved.generation_number,
            reserved.created_at,
            reserved.updated_at,
            reserved.source_event_id,
            $3::timestamptz::text AS source_occurred_at,
            $4::text AS trigger
          FROM reserved
        `,
        [input.opportunity_id, input.event_id, input.occurred_at, input.trigger, randomUUID()]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("improvement_bundle_generation_reserve_failed");
      }

      return {
        generation_number: row.generation_number,
        created_at: row.created_at,
        updated_at: row.updated_at,
        source_event_id: row.source_event_id,
        source_occurred_at: row.source_occurred_at,
        trigger: row.trigger
      };
    },

    async markImprovementBundleGenerationFailure(input) {
      await db.query(
        `
          UPDATE improvement_opportunities
          SET
            bundle_failure_reason = $2,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [input.opportunity_id, input.reason]
      );
    },

    async pruneRetainedBundleOwnersForProject(input) {
      return pruneRetainedBundleOwnersForProject(db, input);
    }
  };
}
