import type { ImprovementOpportunityStore } from "./improvement-opportunity-store.js";
import type { PostgresMetadataStore, Queryable } from "./types.js";

type IncidentCountInput = Omit<
  Parameters<PostgresMetadataStore["listIncidentsForOrganization"]>[0],
  "cursor" | "limit"
>;
type ImprovementCountInput = Omit<
  Parameters<ImprovementOpportunityStore["listImprovementsForOrganization"]>[0],
  "cursor" | "limit"
>;

export async function countIncidentsForOrganization(
  db: Queryable,
  input: IncidentCountInput
): Promise<number> {
  const params: unknown[] = [input.organization_id, input.user_id ?? null];
  const conditions = [
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
    )`
  ];

  if (input.project_id !== undefined) {
    params.push(input.project_id);
    conditions.push(`i.project_id = $${params.length}`);
  }

  if (input.environment !== undefined) {
    params.push(input.environment);
    conditions.push(`i.environment = $${params.length}`);
  }

  if (input.service !== undefined) {
    params.push(input.service);
    conditions.push(`s.name = $${params.length}`);
  }

  if (input.status === "active") {
    conditions.push(`i.status IN ('open', 'regressed')`);
  } else if (input.status !== undefined) {
    params.push(input.status);
    conditions.push(`i.status = $${params.length}`);
  }

  if (input.severity !== undefined) {
    params.push(input.severity);
    conditions.push(`i.severity = $${params.length}`);
  }

  if (input.first_seen_after !== undefined) {
    params.push(input.first_seen_after);
    conditions.push(`i.first_seen_at >= $${params.length}::timestamptz`);
  }

  if (input.attention_after !== undefined) {
    params.push(input.attention_after);
    const attentionAfterIndex = params.length;
    conditions.push(
      `(
        i.first_seen_at >= $${attentionAfterIndex}::timestamptz
        OR (
          i.regressed_at IS NOT NULL
          AND i.regressed_at >= $${attentionAfterIndex}::timestamptz
        )
      )`
    );
  }

  const result = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total
     FROM incidents i
     JOIN projects p ON p.id = i.project_id
     LEFT JOIN services s ON s.id = i.service_id
     WHERE ${conditions.join("\n       AND ")}`,
    params
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function countImprovementsForOrganization(
  db: Queryable,
  input: ImprovementCountInput
): Promise<number> {
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
          '/containers/json',
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
    predicates.push(`${effectiveImprovementStatusSql()} = $${parameters.length}`);
  }
  if (input.severity !== undefined) {
    parameters.push(input.severity);
    predicates.push(`io.severity = $${parameters.length}`);
  }
  if (input.kind !== undefined) {
    parameters.push(input.kind);
    predicates.push(`io.kind = $${parameters.length}`);
  }
  const result = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total
     FROM improvement_opportunities io
     JOIN projects p ON p.id = io.project_id
     LEFT JOIN services s ON s.id = io.service_id
     WHERE ${predicates.join("\n       AND ")}`,
    parameters
  );
  return Number(result.rows[0]?.total ?? 0);
}

function effectiveImprovementStatusSql(): string {
  return `
    CASE
      WHEN io.status = 'snoozed'
        AND io.snoozed_until IS NOT NULL
        AND io.snoozed_until <= now()
        THEN 'open'
      ELSE io.status
    END
  `;
}
