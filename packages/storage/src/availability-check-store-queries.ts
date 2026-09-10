import { buildPlanEligibilityCaseSql } from "./availability-check-store-helpers.js";

function buildEligibilityCtes(organizationPredicate: string): string {
  // Apply the saved-check limit before allocating organization execution slots.
  // Preserved per-project excess must not pause otherwise eligible projects.
  return `
    project_check_ranks AS (
      SELECT
        c.id AS check_id,
        ROW_NUMBER() OVER (
          PARTITION BY c.project_id
          ORDER BY c.created_at ASC, c.id ASC
        ) AS project_check_rank
      FROM availability_checks c
      JOIN projects p ON p.id = c.project_id
      WHERE c.deleted_at IS NULL
        ${organizationPredicate}
    ),
    monitored_project_first_checks AS (
      SELECT
        p.organization_id,
        c.project_id,
        MIN(c.created_at) AS first_enabled_check_at
      FROM availability_checks c
      JOIN projects p ON p.id = c.project_id
      WHERE c.deleted_at IS NULL
        AND c.enabled = true
        ${organizationPredicate}
      GROUP BY p.organization_id, c.project_id
    ),
    monitored_project_ranks AS (
      SELECT
        organization_id,
        project_id,
        ROW_NUMBER() OVER (
          PARTITION BY organization_id
          ORDER BY first_enabled_check_at ASC, project_id ASC
        ) AS monitored_project_rank
      FROM monitored_project_first_checks
    ),
    enabled_check_ranks AS (
      SELECT
        c.id AS check_id,
        p.organization_id,
        ROW_NUMBER() OVER (
          PARTITION BY p.organization_id
          ORDER BY c.created_at ASC, c.id ASC
        ) AS organization_check_rank
      FROM availability_checks c
      JOIN projects p ON p.id = c.project_id
      JOIN organizations o ON o.id = p.organization_id
      JOIN project_check_ranks project_ranks ON project_ranks.check_id = c.id
      JOIN monitored_project_ranks monitored_ranks
        ON monitored_ranks.organization_id = p.organization_id
        AND monitored_ranks.project_id = c.project_id
      WHERE c.deleted_at IS NULL
        AND c.enabled = true
        AND project_ranks.project_check_rank <= ${buildPlanEligibilityCaseSql("limit")}
        AND monitored_ranks.monitored_project_rank <= ${buildPlanEligibilityCaseSql("monitored_projects")}
        ${organizationPredicate}
    )
  `;
}

export const LIST_AVAILABILITY_CHECKS_QUERY = `
  WITH
  ${buildEligibilityCtes("AND p.organization_id = $2::uuid")},
  ranked AS (
    SELECT
      c.id::text AS check_id,
      c.project_id::text AS project_id,
      c.name,
      c.url,
      c.method,
      c.expected_status_min,
      c.expected_status_max,
      c.timeout_ms,
      c.interval_seconds,
      c.failure_threshold,
      c.recovery_threshold,
      c.environment,
      c.service_name,
      c.enabled,
      c.status AS base_status,
      c.consecutive_failures,
      c.consecutive_successes,
      c.linked_incident_id::text AS linked_incident_id,
      i.status AS linked_incident_status,
      c.last_checked_at::text AS last_checked_at,
      c.next_check_at::text AS next_check_at,
      c.last_result_status,
      c.last_result_http_status,
      c.last_result_error_kind,
      c.last_result_error_message,
      c.last_result_duration_ms,
      c.created_at::text AS created_at,
      c.updated_at::text AS updated_at,
      COALESCE(o.plan, 'free') AS organization_plan,
      project_ranks.project_check_rank,
      enabled_ranks.organization_check_rank,
      monitored_ranks.monitored_project_rank,
      ${buildPlanEligibilityCaseSql("limit")} AS plan_limit,
      ${buildPlanEligibilityCaseSql("monitored_projects")} AS plan_monitored_project_limit,
      ${buildPlanEligibilityCaseSql("active_checks")} AS plan_organization_check_limit
    FROM availability_checks c
    JOIN projects p ON p.id = c.project_id
    JOIN organizations o ON o.id = p.organization_id
    LEFT JOIN incidents i ON i.id = c.linked_incident_id
    JOIN project_check_ranks project_ranks ON project_ranks.check_id = c.id
    LEFT JOIN enabled_check_ranks enabled_ranks ON enabled_ranks.check_id = c.id
    LEFT JOIN monitored_project_ranks monitored_ranks
      ON monitored_ranks.organization_id = p.organization_id
      AND monitored_ranks.project_id = c.project_id
    WHERE c.project_id = $1::uuid
      AND p.organization_id = $2::uuid
      AND c.deleted_at IS NULL
  )
  SELECT
    ranked.*,
    NOT ranked.enabled OR ranked.project_check_rank <= ranked.plan_limit AS within_plan_limit,
    NOT ranked.enabled OR ranked.monitored_project_rank <= ranked.plan_monitored_project_limit
      AS within_monitored_project_limit,
    NOT ranked.enabled OR ranked.organization_check_rank <= ranked.plan_organization_check_limit
      AS within_organization_active_limit
  FROM ranked
  WHERE ($4::text IS NULL OR ranked.check_id = $4)
  ORDER BY ranked.created_at DESC
  LIMIT $3
`;

export const CLAIM_DUE_AVAILABILITY_CHECKS_QUERY = `
  WITH due_organizations AS (
    SELECT DISTINCT p.organization_id
    FROM availability_checks c
    JOIN projects p ON p.id = c.project_id
    WHERE c.deleted_at IS NULL
      AND c.enabled = true
      AND c.next_check_at <= $1::timestamptz
      AND (c.claimed_at IS NULL OR c.claimed_at < $2::timestamptz)
  ),
  ${buildEligibilityCtes(
    "AND p.organization_id IN (SELECT organization_id FROM due_organizations)"
  )},
  ranked AS (
    SELECT
      c.id,
      c.project_id,
      p.organization_id,
      p.owner_user_id,
      COALESCE(o.plan, 'free') AS organization_plan,
      c.name,
      c.url,
      c.method,
      c.expected_status_min,
      c.expected_status_max,
      c.timeout_ms,
      c.interval_seconds,
      c.failure_threshold,
      c.recovery_threshold,
      c.environment,
      c.service_name,
      c.status,
      c.consecutive_failures,
      c.consecutive_successes,
      c.linked_incident_id,
      c.next_check_at,
      project_ranks.project_check_rank,
      enabled_ranks.organization_check_rank,
      monitored_ranks.monitored_project_rank
    FROM availability_checks c
    JOIN projects p ON p.id = c.project_id
    JOIN organizations o ON o.id = p.organization_id
    JOIN project_check_ranks project_ranks ON project_ranks.check_id = c.id
    JOIN enabled_check_ranks enabled_ranks ON enabled_ranks.check_id = c.id
    JOIN monitored_project_ranks monitored_ranks
      ON monitored_ranks.organization_id = p.organization_id
      AND monitored_ranks.project_id = c.project_id
    WHERE c.deleted_at IS NULL
      AND c.enabled = true
      AND c.next_check_at <= $1::timestamptz
      AND (c.claimed_at IS NULL OR c.claimed_at < $2::timestamptz)
  ),
  candidate AS (
    SELECT ranked.id AS check_id
    FROM ranked
    WHERE project_check_rank <= ${buildPlanEligibilityCaseSql("limit").replace(/o\.plan/g, "organization_plan")}
      AND monitored_project_rank <= ${buildPlanEligibilityCaseSql("monitored_projects").replace(/o\.plan/g, "organization_plan")}
      AND organization_check_rank <= ${buildPlanEligibilityCaseSql("active_checks").replace(/o\.plan/g, "organization_plan")}
    ORDER BY ranked.next_check_at ASC, ranked.id ASC
    LIMIT $3
  )
  UPDATE availability_checks c
  SET claimed_at = $1::timestamptz,
      updated_at = now()
  FROM ranked
  JOIN candidate ON candidate.check_id = ranked.id
  WHERE c.id = ranked.id
    AND c.deleted_at IS NULL
    AND c.enabled = true
    AND c.next_check_at <= $1::timestamptz
    AND (c.claimed_at IS NULL OR c.claimed_at < $2::timestamptz)
  RETURNING
    c.id::text AS check_id,
    c.project_id::text AS project_id,
    ranked.organization_id::text AS organization_id,
    ranked.owner_user_id::text AS owner_user_id,
    ranked.organization_plan,
    c.name,
    c.url,
    c.method,
    c.expected_status_min,
    c.expected_status_max,
    c.timeout_ms,
    c.interval_seconds,
    c.failure_threshold,
    c.recovery_threshold,
    c.environment,
    c.service_name,
    c.next_check_at::text AS due_at,
    c.claimed_at::text AS claimed_at,
    c.linked_incident_id::text AS linked_incident_id,
    c.status AS prior_status,
    c.consecutive_failures,
    c.consecutive_successes
`;
