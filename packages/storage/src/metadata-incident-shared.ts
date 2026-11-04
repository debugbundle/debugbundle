import { randomUUID } from "node:crypto";
import { deriveIncidentReasonFromSignal } from "./incident-reason.js";
import type {
  DemotedIncidentEventReference,
  IncidentRetrievalRecord,
  Queryable,
  RecordIncidentEventRetentionInput,
  RegressionDeployCorrelation
} from "./types.js";

export function severityToRank(severity: RecordIncidentEventRetentionInput["severity"]): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

export function collectDemotedIncidentEvents(
  target: Map<string, DemotedIncidentEventReference>,
  rows: Array<{ event_id: string; occurred_at: string; is_sampled: boolean }>
): void {
  for (const row of rows) {
    if (!row.is_sampled) {
      target.set(row.event_id, {
        event_id: row.event_id,
        occurred_at: row.occurred_at
      });
    }
  }
}

async function getOrCreateServiceRow(
  db: Queryable,
  projectId: string,
  serviceName: string,
  environment: string,
  includeInputName = false
): Promise<{ id: string; name?: string }> {
  const existing = await db.query<{ id: string; name?: string }>(
    `
      SELECT ${includeInputName ? "id,name" : "id"}
      FROM services
      WHERE project_id = $1 AND environment = $3
        AND (name = $2 OR service_definition_id IN (
          SELECT service_definition_id FROM service_input_aliases
          WHERE origin_project_id=$1 AND input_name=$2
        ))
      LIMIT 1
    `,
    [projectId, serviceName, environment]
  );

  const existingId = existing.rows[0]?.id;
  if (existingId !== undefined) {
    return existing.rows[0]!;
  }

  const inserted = await db.query<{ id: string; name?: string }>(
    `
      INSERT INTO services (id, project_id, name, environment, created_at, updated_at)
      VALUES ($1, $2, $3, $4, now(), now())
      ON CONFLICT (project_id, name, environment)
      DO UPDATE SET updated_at = now()
      RETURNING ${includeInputName ? "id,name" : "id"}
    `,
    [randomUUID(), projectId, serviceName, environment]
  );

  const insertedId = inserted.rows[0]?.id;
  if (insertedId === undefined) {
    throw new Error("service_insert_failed");
  }

  return inserted.rows[0]!;
}

export async function getOrCreateServiceId(
  db: Queryable,
  projectId: string,
  serviceName: string,
  environment: string
): Promise<string> {
  return (await getOrCreateServiceRow(db, projectId, serviceName, environment)).id;
}

/** Grouping uses immutable input lineage. The existing database writer fence
 * resolves unknown names after cutover or raises a retryable ownership conflict. */
export async function getOrCreateServiceIdentity(
  db: Queryable,
  projectId: string,
  serviceName: string,
  environment: string
): Promise<{ service_id: string; input_name: string }> {
  const row = await getOrCreateServiceRow(db, projectId, serviceName, environment, true);
  if (typeof row.name !== "string") throw new Error("service_lineage_missing");
  return { service_id: row.id, input_name: row.name };
}

export async function upsertDeploymentFromEvent(input: {
  db: Queryable;
  event_id: string;
  project_id: string;
  service_id: string;
  environment: string;
  commit_sha: string;
  version: string;
  branch: string;
  deployed_at: string;
}): Promise<void> {
  await input.db.query(
    `
      INSERT INTO deployments (
        id,
        project_id,
        service_id,
        environment,
        source_event_id,
        commit_sha,
        version,
        branch,
        deployed_at,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::uuid,
        $6,
        $7,
        $8,
        $9::timestamptz,
        '{}'::jsonb,
        now(),
        now()
      )
      ON CONFLICT (source_event_id)
      DO UPDATE SET
        commit_sha = EXCLUDED.commit_sha,
        version = EXCLUDED.version,
        branch = EXCLUDED.branch,
        deployed_at = EXCLUDED.deployed_at,
        updated_at = now()
    `,
    [
      randomUUID(),
      input.project_id,
      input.service_id,
      input.environment,
      input.event_id,
      input.commit_sha,
      input.version,
      input.branch,
      input.deployed_at
    ]
  );
}

export async function getRegressionDeployCorrelation(input: {
  db: Queryable;
  project_id: string;
  service_id: string;
  environment: string;
  occurred_at: string;
}): Promise<RegressionDeployCorrelation | null> {
  const result = await input.db.query<RegressionDeployCorrelation & Record<string, unknown>>(
    `
      SELECT
        d.id AS deployment_id,
        d.commit_sha,
        d.version,
        d.branch,
        d.deployed_at::text AS deployed_at,
        FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - d.deployed_at)) / 60)::integer AS minutes_since_deploy
      FROM deployments d
      WHERE d.project_id = $2
        AND d.service_id = $3
        AND d.environment = $4
        AND d.deployed_at <= $1::timestamptz
        AND d.deployed_at >= ($1::timestamptz - INTERVAL '24 hours')
      ORDER BY d.deployed_at DESC
      LIMIT 1
    `,
    [input.occurred_at, input.project_id, input.service_id, input.environment]
  );

  const correlation = result.rows[0];
  if (correlation === undefined) {
    return null;
  }

  return {
    deployment_id: correlation.deployment_id,
    commit_sha: correlation.commit_sha,
    version: correlation.version,
    branch: correlation.branch,
    deployed_at: correlation.deployed_at,
    minutes_since_deploy: correlation.minutes_since_deploy
  };
}

export type IncidentRetrievalRow = IncidentRetrievalRecord & {
  incident_reason_event_type: string | null;
  incident_reason_event_class: string | null;
  incident_reason_level: string | null;
};

export function mapIncidentRetrievalRow(row: IncidentRetrievalRow): IncidentRetrievalRecord {
  const requestAnomaly = row.matched_fields.includes("request_anomaly");
  const incidentReason =
    row.incident_reason_event_type === null
      ? requestAnomaly
        ? deriveIncidentReasonFromSignal({
            event_type: "request_event",
            event_class: "incident_signal",
            request_anomaly: true
          })
        : null
      : deriveIncidentReasonFromSignal({
          event_type: row.incident_reason_event_type,
          event_class: row.incident_reason_event_class,
          level: row.incident_reason_level,
          request_anomaly: requestAnomaly && row.incident_reason_event_type === "request_event"
        });

  return {
    incident_id: row.incident_id,
    project_id: row.project_id,
    ...(row.canonical_project_id == null ? {} : { canonical_project_id: row.canonical_project_id }),
    ...(row.service_definition_id === undefined
      ? {}
      : { service_definition_id: row.service_definition_id }),
    ...(row.canonical_service_name === undefined
      ? {}
      : { canonical_service_name: row.canonical_service_name }),
    ...(row.project_view_service_name === undefined
      ? {}
      : { project_view_service_name: row.project_view_service_name }),
    project_name: row.project_name,
    project_color_tag: row.project_color_tag ?? null,
    service_id: row.service_id,
    service_name: row.service_name,
    latest_deployment_id: row.latest_deployment_id,
    environment: row.environment,
    fingerprint: row.fingerprint,
    fingerprint_version: row.fingerprint_version,
    title: row.title,
    severity: row.severity,
    status: row.status,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    occurrence_count: row.occurrence_count,
    spike_detected_at: row.spike_detected_at,
    ...(row.resolved_at === undefined ? {} : { resolved_at: row.resolved_at }),
    regressed_at: row.regressed_at,
    matched_fields: row.matched_fields,
    ...(incidentReason === null ? {} : { incident_reason: incidentReason })
  };
}
