import { readMergeServiceInventory } from "./project-merge-service-inventory.js";
import {
  getDefaultPreset,
  getTierCapabilities,
  resolvePolicy,
  type CapturePolicyRecord
} from "../../shared-types/src/index.js";
import { createPostgresCapturePolicyStore } from "./capture-policy-store.js";
import { createPostgresAnalyticsSettingsStore } from "./analytics-settings-store.js";
import { inspectProjectMergeInventory } from "./project-merge-inventory.js";
import { SDK_PROBE_DIRECTIVES_MAX_BYTES } from "../../shared-types/src/sdk-config-limits.js";
import {
  projectMergeRevision,
  type ProjectMergeBlocker,
  type ProjectMergeRequest,
  type ProjectMergeSnapshot
} from "./project-merge-plan.js";
import { WorkerJobNameSchema } from "./worker-job-store.js";
import type { Queryable } from "./types.js";
import {
  defaultNotificationPreferences,
  NotificationPreferencesSchema
} from "../../shared-types/src/notification-preferences.js";

interface ProjectRow extends Record<string, unknown> {
  project_id: string;
  project_name: string | null;
  organization_id: string;
  owner_user_id: string;
  canonical_project_id: string;
  origin_ids: string[];
  organization_plan: string;
  environment_default: string;
  automated_improvement_bundles_enabled: boolean;
  improvement_bundle_sensitivity: string;
}

const configurationTables = [
  "service_definitions",
  "service_project_aliases",
  "capture_rules",
  "alert_rules",
  "agent_webhooks",
  "github_dispatch_rules",
  "project_github_repos",
  "weekly_report_channels",
  "notification_preferences",
  "availability_checks",
  "analytics_funnel_definitions",
  "analytics_flow_definitions",
  "public_status_page_projects",
  "public_status_page_checks",
  "public_status_pages",
  "weekly_report_channel_aliases"
] as const;
const runtimeColumns = [
  "updated_at",
  "hit_count",
  "last_matched_at",
  "consecutive_failures",
  "consecutive_successes",
  "last_checked_at",
  "next_check_at",
  "claimed_at",
  "last_result_status",
  "last_result_http_status",
  "last_result_error_kind",
  "last_result_error_message",
  "last_result_duration_ms",
  "status",
  "linked_incident_id",
  "last_success_at",
  "last_failure_at",
  "last_dispatched_at",
  "last_dispatch_at",
  "last_attempt_at",
  "last_response_code",
  "last_attempted_at",
  "last_error"
];

/** Read-only domain inventory. Returned revisions are hashes, never destination secrets. */
export async function readProjectMergeSnapshot(
  db: Queryable,
  request: ProjectMergeRequest,
  actorUserId: string,
  operationId?: string
): Promise<ProjectMergeSnapshot> {
  const inventory = await inspectProjectMergeInventory(db);
  const inventoryBlockers: ProjectMergeBlocker[] = inventory.blockers.map((resource) => ({
    code: "inventory_incomplete",
    project_id: null,
    resource
  }));
  const selectedIds = [request.target_project_id, ...request.source_project_ids];
  const rows = await db.query<ProjectRow>(
    `SELECT p.id AS project_id,p.organization_id,p.owner_user_id,
    CASE WHEN octet_length(p.name)<=480 THEN p.name ELSE NULL END AS project_name,
    debugbundle_canonical_project(p.id) AS canonical_project_id,debugbundle_project_origins(p.id) AS origin_ids,
    COALESCE(o.plan,'free') AS organization_plan,p.environment_default,
    p.automated_improvement_bundles_enabled,p.improvement_bundle_sensitivity
    FROM projects p JOIN organizations o ON o.id=p.organization_id
    WHERE p.id=ANY($1::uuid[]) AND p.owner_user_id=$2 AND o.suspended_at IS NULL
      AND EXISTS(SELECT 1 FROM organization_members actor WHERE actor.organization_id=p.organization_id
        AND actor.user_id=$2 AND actor.suspended_at IS NULL) ORDER BY p.id`,
    [selectedIds, actorUserId]
  );
  const capture = createPostgresCapturePolicyStore(db);
  const analytics = createPostgresAnalyticsSettingsStore(db);
  const projects: ProjectMergeSnapshot["projects"] = [];
  for (const project of rows.rows) {
    const members = await db.query<{ user_id: string; role: string }>(
      "SELECT user_id,role FROM project_members WHERE project_id=$1 ORDER BY user_id LIMIT 1001",
      [project.project_id]
    );
    const invites = await db.query<{ pending: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM project_invites
      WHERE project_id=$1 AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at>now()) AS pending`,
      [project.project_id]
    );
    const active = await db.query<{ operation_id: string }>(
      `SELECT operation_id FROM project_merge_participants
      WHERE project_id=ANY($1::uuid[]) AND ($2::uuid IS NULL OR operation_id<>$2) LIMIT 1`,
      [project.origin_ids, operationId ?? null]
    );
    const serviceInventory = await readMergeServiceInventory(
      db,
      project.project_id,
      project.origin_ids
    );
    if (!serviceInventory.complete)
      inventoryBlockers.push({
        code: "configuration_limit_exceeded",
        project_id: project.project_id,
        resource: "service_metadata_bytes"
      });
    const record = await capture.getCapturePolicyByProjectId(project.project_id);
    const defaultRecord: CapturePolicyRecord = {
      project_id: project.project_id,
      preset: getDefaultPreset(project.organization_plan),
      capture_logs: null,
      capture_request_events: null,
      capture_breadcrumbs: null,
      capture_probe_events: null,
      capture_diagnostic_context: null,
      immediate_client_error_statuses: null,
      immediate_client_error_path_rules: null,
      updated_at: "1970-01-01T00:00:00.000Z"
    };
    const settings: Record<string, unknown> = {
      capture: resolvePolicy(record ?? defaultRecord),
      analytics: await analytics.getAnalyticsSettingsByProjectId(project.project_id),
      improvements: [
        project.automated_improvement_bundles_enabled,
        project.improvement_bundle_sensitivity
      ],
      environment_default: project.environment_default
    };
    const notifications = await db.query<{
      user_id: string | null;
      organization_id: string | null;
      preferences: unknown;
    }>(
      `SELECT user_id,organization_id,preferences FROM notification_preferences WHERE project_id=$1
       ORDER BY user_id NULLS FIRST,organization_id NULLS FIRST LIMIT 1001`,
      [project.project_id]
    );
    const schedules = await db.query<{
      channel: string;
      config: unknown;
      schedule_day_of_week: string;
      schedule_hour_of_day: number;
      schedule_timezone: string;
      is_enabled: boolean;
    }>(
      `SELECT channel,config,schedule_day_of_week,schedule_hour_of_day,schedule_timezone,is_enabled
       FROM weekly_report_channels WHERE project_id=$1 ORDER BY channel,config::text LIMIT 5001`,
      [project.project_id]
    );
    settings["notification_preferences"] = notifications.rows
      .map((row) => ({ ...row, preferences: NotificationPreferencesSchema.parse(row.preferences) }))
      .filter(
        (row) =>
          projectMergeRevision(row.preferences) !==
          projectMergeRevision(defaultNotificationPreferences(true))
      );
    settings["weekly_reports"] = schedules.rows;
    if (
      members.rows.length > 1000 ||
      notifications.rows.length > 1000 ||
      schedules.rows.length > 5000
    )
      inventoryBlockers.push({
        code: "configuration_limit_exceeded",
        project_id: project.project_id,
        resource: "access_or_delivery"
      });
    const configuration: Record<string, unknown> = {
      settings,
      members: members.rows,
      input_aliases: serviceInventory.reserved_inputs
    };
    for (const table of configurationTables) {
      const projectPredicate =
        table === "public_status_pages"
          ? "anchor_project_id=ANY($1::uuid[])"
          : table === "weekly_report_channel_aliases"
            ? "legacy_channel_id IN (SELECT id FROM weekly_report_channels WHERE project_id=ANY($1::uuid[]))"
            : "project_id=ANY($1::uuid[])";
      const config = await db.query<{ revision: string; row_count: number; byte_count: string }>(
        `WITH bounded AS MATERIALIZED (
          SELECT (to_jsonb(config)-$2::text[])::text AS body FROM ${table} config
          WHERE ${projectPredicate} LIMIT 5001
        ), hashed AS (
          SELECT octet_length(body) AS bytes,encode(sha256(convert_to(body,'UTF8')),'hex') AS hash FROM bounded
        ) SELECT count(*)::int AS row_count,COALESCE(sum(bytes),0)::text AS byte_count,
          encode(sha256(convert_to(COALESCE(string_agg(hash,'' ORDER BY hash),''),'UTF8')),'hex') AS revision FROM hashed`,
        [project.origin_ids, runtimeColumns]
      );
      if (
        (config.rows[0]?.row_count ?? 5001) > 5000 ||
        Number(config.rows[0]?.byte_count ?? Infinity) > 16 * 1024 * 1024
      )
        inventoryBlockers.push({
          code: "configuration_limit_exceeded",
          project_id: project.project_id,
          resource: table
        });
      configuration[table] = config.rows[0]?.revision;
    }
    projects.push({
      project_id: project.project_id,
      ...(project.project_name === null ? {} : { project_name: project.project_name }),
      organization_id: project.organization_id,
      owner_user_id: project.owner_user_id,
      canonical_project_id: project.canonical_project_id,
      origin_ids: project.origin_ids,
      access_revision: projectMergeRevision({
        owner: project.owner_user_id,
        members: members.rows
      }),
      settings_revision: projectMergeRevision(settings),
      settings_categories: Object.fromEntries(
        Object.entries(settings).map(([category, value]) => [category, projectMergeRevision(value)])
      ),
      configuration_revision: projectMergeRevision(configuration),
      pending_invites: invites.rows[0]?.pending !== false,
      active_operation_id: active.rows[0]?.operation_id ?? null,
      services: serviceInventory.services,
      reserved_names: serviceInventory.reserved_names,
      reserved_inputs: serviceInventory.reserved_inputs,
      row_count: serviceInventory.row_count + project.origin_ids.length
    });
  }
  const origins = [...new Set(projects.flatMap((p) => p.origin_ids))];
  const unknownJobs = await db.query<{ job_name: string }>(
    "SELECT job_name FROM worker_jobs WHERE project_id=ANY($1::uuid[]) AND NOT(job_name=ANY($2::text[])) LIMIT 1",
    [origins, WorkerJobNameSchema.options]
  );
  const resources = await db.query<{
    checks: number;
    funnels: number;
    probes: number;
    capture_rules: number;
    alert_rules: number;
    webhooks: number;
    github_rules: number;
    weekly_channels: number;
    service_instances: number;
    flows: number;
    active_flows: number;
  }>(
    `SELECT
    (SELECT count(*)::int FROM availability_checks WHERE project_id=ANY($1::uuid[]) AND deleted_at IS NULL) AS checks,
    (SELECT count(*)::int FROM analytics_funnel_definitions WHERE project_id=ANY($1::uuid[]) AND archived_at IS NULL) AS funnels,
    (SELECT count(*)::int FROM probe_activations WHERE project_id=ANY($1::uuid[]) AND deactivated_at IS NULL AND expires_at>now()) AS probes,
    (SELECT count(*)::int FROM capture_rules WHERE project_id=ANY($1::uuid[])) AS capture_rules,
    (SELECT count(*)::int FROM alert_rules WHERE project_id=ANY($1::uuid[])) AS alert_rules,
    (SELECT count(*)::int FROM agent_webhooks WHERE project_id=ANY($1::uuid[])) AS webhooks,
    (SELECT count(*)::int FROM github_dispatch_rules WHERE project_id=ANY($1::uuid[])) AS github_rules,
    (SELECT count(*)::int FROM weekly_report_channels WHERE project_id=ANY($1::uuid[])) AS weekly_channels,
    (SELECT count(*)::int FROM services WHERE project_id=ANY($1::uuid[])) AS service_instances,
    (SELECT count(*)::int FROM analytics_flow_definitions WHERE project_id=ANY($1::uuid[])) AS flows,
    (SELECT count(*)::int FROM analytics_flow_definitions WHERE project_id=ANY($1::uuid[]) AND archived_at IS NULL) AS active_flows`,
    [origins]
  );
  for (const [table, key] of [
    ["analytics_funnel_definitions", "funnel_key"],
    ["analytics_flow_definitions", "flow_key"]
  ] as const) {
    const collisions = await db.query(
      `SELECT ${key} FROM ${table} WHERE project_id=ANY($1::uuid[]) GROUP BY ${key} HAVING count(*)>1 LIMIT 1`,
      [origins]
    );
    if (collisions.rows.length)
      inventoryBlockers.push({
        code: "definition_key_conflict",
        project_id: null,
        resource: table
      });
  }
  const target = rows.rows.find((p) => p.project_id === request.target_project_id);
  // Upper-bound the ordinary directive arrays used by installed SDKs. Include
  // every retained spelling and planned new name; never return a partial list.
  const wire = await db.query<{
    name_count: string;
    name_bytes: string;
    probe_count: string;
    probe_bytes: string;
  }>(
    `WITH names AS MATERIALIZED (
    SELECT name FROM service_project_aliases WHERE project_id=ANY($1::uuid[])
    UNION ALL SELECT input_name FROM service_input_aliases WHERE origin_project_id=ANY($1::uuid[])
    UNION ALL SELECT unnest($2::text[])
  ), probes AS MATERIALIZED(SELECT id,label_pattern,environment,expires_at,trigger_expires_at FROM probe_activations
    WHERE project_id=ANY($1::uuid[]) AND deactivated_at IS NULL AND expires_at>now() LIMIT 5001)
  SELECT (SELECT count(*) FROM names)::text AS name_count,
    (SELECT COALESCE(sum(octet_length(to_json(name)::text)),0) FROM names)::text AS name_bytes,
    (SELECT count(*) FROM probes)::text AS probe_count,
    (SELECT COALESCE(sum(octet_length(to_jsonb(probes)::text)+96),0) FROM probes)::text AS probe_bytes`,
    [origins, request.service_mappings.map((m) => m.name)]
  );
  const probeWire = wire.rows[0],
    projectedProbeBytes =
      Number(probeWire?.probe_bytes ?? 0) * Number(probeWire?.name_count ?? 0) +
      Number(probeWire?.name_bytes ?? 0) * Number(probeWire?.probe_count ?? 0);
  const limits = getTierCapabilities(target?.organization_plan);
  const analyticsLimits = await analytics.getAnalyticsSettingsByProjectId(
    request.target_project_id
  );
  const savedLimit = Math.min(
    limits.max_analytics_saved_funnels,
    analyticsLimits?.max_saved_funnels ?? limits.max_analytics_saved_funnels
  );
  return {
    runtime_contract: "project-services-v1",
    inventory_complete:
      inventory.complete &&
      inventoryBlockers.length === 0 &&
      unknownJobs.rows.every((job) => WorkerJobNameSchema.safeParse(job.job_name).success),
    inventory_blockers: inventoryBlockers,
    projects,
    resource_limits: [
      {
        resource: "projected_probe_directive_bytes",
        count: projectedProbeBytes,
        limit: SDK_PROBE_DIRECTIVES_MAX_BYTES
      },
      {
        resource: "projected_probe_directives",
        count: Number(probeWire?.name_count ?? 0) * Number(probeWire?.probe_count ?? 0),
        limit: 5000
      },
      { resource: "capture_rules", count: resources.rows[0]?.capture_rules ?? 0, limit: 5000 },
      { resource: "alert_rules", count: resources.rows[0]?.alert_rules ?? 0, limit: 5000 },
      { resource: "webhooks", count: resources.rows[0]?.webhooks ?? 0, limit: 5000 },
      { resource: "github_rules", count: resources.rows[0]?.github_rules ?? 0, limit: 5000 },
      { resource: "weekly_channels", count: resources.rows[0]?.weekly_channels ?? 0, limit: 5000 },
      // The installed service-instance reader has a fixed 1,000-row contract.
      // Reject a consolidation it cannot enumerate completely.
      {
        resource: "service_instances",
        count: resources.rows[0]?.service_instances ?? 0,
        limit: 1000
      },
      { resource: "saved_flows", count: resources.rows[0]?.active_flows ?? 0, limit: savedLimit },
      { resource: "total_saved_flows", count: resources.rows[0]?.flows ?? 0, limit: 100 },
      { resource: "active_probes", count: resources.rows[0]?.probes ?? 0, limit: 5 },
      {
        resource: "health_checks",
        count: resources.rows[0]?.checks ?? 0,
        limit: limits.availability_checks_per_project
      },
      {
        resource: "saved_funnels",
        count: resources.rows[0]?.funnels ?? 0,
        limit: savedLimit
      }
    ]
  };
}
