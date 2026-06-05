import { randomUUID } from "node:crypto";

import { getTierCapabilities } from "../../shared-types/src/index.js";

import type {
  DeliverGitHubDispatchJob,
  GitHubDispatchDeliveryIntent,
  GitHubDispatchDeliveryRecord,
  GitHubDispatchRuleRecord,
  GitHubInstallationRecord,
  GitHubStore,
  MarkGitHubDispatchDeliveryAttemptResult,
  MatchingGitHubDispatchRule,
  ProjectGitHubRepoRecord,
  Queryable
} from "./types.js";

const GITHUB_DISPATCH_RETRY_DELAYS_SECONDS = [1, 5, 30, 120, 600] as const;

const SEVERITY_RANK: Record<"low" | "medium" | "high" | "critical", number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function mapGitHubInstallationRow(row: GitHubInstallationRecord & Record<string, unknown>): GitHubInstallationRecord {
  return {
    id: row.id,
    installation_id: Number(row.installation_id),
    account_login: row.account_login,
    account_type: row.account_type,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapProjectGitHubRepoRow(row: ProjectGitHubRepoRecord & Record<string, unknown>): ProjectGitHubRepoRecord {
  return {
    id: row.id,
    project_id: row.project_id,
    installation_id: row.installation_id,
    repo_owner: row.repo_owner,
    repo_name: row.repo_name,
    default_branch: row.default_branch,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapGitHubDispatchRuleRow(row: GitHubDispatchRuleRecord & Record<string, unknown>): GitHubDispatchRuleRecord {
  return {
    rule_id: row.rule_id,
    project_id: row.project_id,
    created_by_user_id: row.created_by_user_id,
    name: row.name,
    enabled: row.enabled,
    event_types: Array.isArray(row.event_types) ? row.event_types.map((value) => String(value)) : [],
    environments: Array.isArray(row.environments) ? row.environments.map((value) => String(value)) : [],
    services: Array.isArray(row.services) ? row.services.map((value) => String(value)) : [],
    severity_min: row.severity_min,
    bundle_type: row.bundle_type,
    incident_status: row.incident_status,
    cooldown_seconds: Number(row.cooldown_seconds),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapGitHubDispatchDeliveryRow(
  row: GitHubDispatchDeliveryRecord & Record<string, unknown>
): GitHubDispatchDeliveryRecord {
  return {
    delivery_id: row.delivery_id,
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    incident_id: row.incident_id,
    improvement_id: row.improvement_id,
    target_title: row.target_title,
    status: row.status,
    attempt_count: Number(row.attempt_count),
    last_attempt_at: row.last_attempt_at,
    last_error: row.last_error,
    github_status_code: row.github_status_code === null ? null : Number(row.github_status_code),
    created_at: row.created_at
  };
}

function mapMatchingGitHubDispatchRule(row: MatchingGitHubDispatchRule & Record<string, unknown>): MatchingGitHubDispatchRule {
  return {
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    installation_id: Number(row.installation_id),
    repo_owner: row.repo_owner,
    repo_name: row.repo_name,
    default_branch: row.default_branch,
    cooldown_seconds: Number(row.cooldown_seconds)
  };
}

function mapGitHubDispatchDeliveryIntent(
  row: GitHubDispatchDeliveryIntent & Record<string, unknown>
): GitHubDispatchDeliveryIntent {
  return {
    delivery_id: row.delivery_id,
    rule_id: row.rule_id,
    project_id: row.project_id,
    incident_id: row.incident_id,
    improvement_id: row.improvement_id,
    installation_id: Number(row.installation_id),
    repo_owner: row.repo_owner,
    repo_name: row.repo_name,
    status: row.status,
    attempt_count: Number(row.attempt_count),
    next_attempt_at: row.next_attempt_at,
    last_attempt_at: row.last_attempt_at,
    last_error: row.last_error,
    github_status_code: row.github_status_code === null ? null : Number(row.github_status_code),
    dispatch_payload:
      typeof row.dispatch_payload === "object" && row.dispatch_payload !== null
        ? Object.fromEntries(Object.entries(row.dispatch_payload))
        : {}
  };
}

export function createPostgresGitHubStore(db: Queryable): GitHubStore {
  return {
    async getGitHubInstallationForOrganization(input) {
      const result = await db.query<GitHubInstallationRecord & Record<string, unknown>>(
        `
          SELECT
            id,
            installation_id,
            account_login,
            account_type,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM github_installations
          WHERE organization_id = $1
          LIMIT 1
        `,
        [input.organization_id]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubInstallationRow(row);
    },

    async upsertGitHubInstallationForOrganization(input) {
      const recordIdResult = await db.query<{ id: string }>(
        `
          SELECT id
          FROM github_installations
          WHERE organization_id = $1 OR installation_id = $2
          LIMIT 1
        `,
        [input.organization_id, input.installation_id]
      );
      const recordId = recordIdResult.rows[0]?.id ?? randomUUID();

      const result = await db.query<GitHubInstallationRecord & Record<string, unknown>>(
        `
          INSERT INTO github_installations (
            id,
            organization_id,
            installation_id,
            account_login,
            account_type,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, now(), now())
          ON CONFLICT (organization_id)
          DO UPDATE SET
            installation_id = EXCLUDED.installation_id,
            account_login = EXCLUDED.account_login,
            account_type = EXCLUDED.account_type,
            status = EXCLUDED.status,
            updated_at = now()
          RETURNING
            id,
            installation_id,
            account_login,
            account_type,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          recordId,
          input.organization_id,
          input.installation_id,
          input.account_login,
          input.account_type,
          input.status
        ]
      );

      return mapGitHubInstallationRow(result.rows[0]!);
    },

    async updateGitHubInstallationStatus(input) {
      const result = await db.query<GitHubInstallationRecord & Record<string, unknown>>(
        `
          UPDATE github_installations
          SET
            status = $2,
            account_login = COALESCE($3, account_login),
            account_type = COALESCE($4, account_type),
            updated_at = now()
          WHERE installation_id = $1
          RETURNING
            id,
            installation_id,
            account_login,
            account_type,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [input.installation_id, input.status, input.account_login ?? null, input.account_type ?? null]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubInstallationRow(row);
    },

    async deleteGitHubInstallationForOrganization(input) {
      const result = await db.query<{ id: string }>(
        `
          DELETE FROM github_installations
          WHERE organization_id = $1
          RETURNING id
        `,
        [input.organization_id]
      );

      return result.rows[0] !== undefined;
    },

    async getProjectGitHubRepoForOrganization(input) {
      const result = await db.query<ProjectGitHubRepoRecord & Record<string, unknown>>(
        `
          SELECT
            pgr.id,
            pgr.project_id,
            pgr.installation_id,
            pgr.repo_owner,
            pgr.repo_name,
            pgr.default_branch,
            pgr.created_at::text AS created_at,
            pgr.updated_at::text AS updated_at
          FROM project_github_repos pgr
          JOIN projects p ON p.id = pgr.project_id
          JOIN github_installations gi ON gi.id = pgr.installation_id
          WHERE p.organization_id = $1
            AND pgr.project_id = $2
          LIMIT 1
        `,
        [input.organization_id, input.project_id]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapProjectGitHubRepoRow(row);
    },

    async upsertProjectGitHubRepoForOrganization(input) {
      const projectResult = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = $1 AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (projectResult.rows[0] === undefined) {
        return null;
      }

      const existingResult = await db.query<{ id: string }>(
        `
          SELECT id
          FROM project_github_repos
          WHERE project_id = $1
          LIMIT 1
        `,
        [input.project_id]
      );
      const recordId = existingResult.rows[0]?.id ?? randomUUID();

      const result = await db.query<ProjectGitHubRepoRecord & Record<string, unknown>>(
        `
          INSERT INTO project_github_repos (
            id,
            project_id,
            installation_id,
            repo_owner,
            repo_name,
            default_branch,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, now(), now())
          ON CONFLICT (project_id)
          DO UPDATE SET
            installation_id = EXCLUDED.installation_id,
            repo_owner = EXCLUDED.repo_owner,
            repo_name = EXCLUDED.repo_name,
            default_branch = EXCLUDED.default_branch,
            updated_at = now()
          RETURNING
            id,
            project_id,
            installation_id,
            repo_owner,
            repo_name,
            default_branch,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          recordId,
          input.project_id,
          input.installation_id,
          input.repo_owner,
          input.repo_name,
          input.default_branch
        ]
      );

      return mapProjectGitHubRepoRow(result.rows[0]!);
    },

    async deleteProjectGitHubRepoForOrganization(input) {
      await db.query(
        `
          DELETE FROM github_dispatch_rules gdr
          USING projects p
          WHERE gdr.project_id = p.id
            AND p.organization_id = $1
            AND gdr.project_id = $2
        `,
        [input.organization_id, input.project_id]
      );

      const result = await db.query<{ id: string }>(
        `
          DELETE FROM project_github_repos pgr
          USING projects p
          WHERE pgr.project_id = p.id
            AND p.organization_id = $1
            AND pgr.project_id = $2
          RETURNING pgr.id
        `,
        [input.organization_id, input.project_id]
      );

      return result.rows[0] !== undefined;
    },

    async listProjectGitHubRulesForOrganization(input) {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = $1 AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<GitHubDispatchRuleRecord & Record<string, unknown>>(
        `
          SELECT
            id AS rule_id,
            project_id,
            created_by_user_id,
            name,
            enabled,
            event_types,
            COALESCE(environments, ARRAY[]::text[]) AS environments,
            COALESCE(services, ARRAY[]::text[]) AS services,
            severity_min,
            bundle_type,
            incident_status,
            cooldown_seconds,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM github_dispatch_rules
          WHERE project_id = $1
          ORDER BY created_at DESC, id DESC
        `,
        [input.project_id]
      );

      return result.rows.map(mapGitHubDispatchRuleRow);
    },

    async getProjectGitHubRuleForOrganization(input) {
      const result = await db.query<GitHubDispatchRuleRecord & Record<string, unknown>>(
        `
          SELECT
            gdr.id AS rule_id,
            gdr.project_id,
            gdr.created_by_user_id,
            gdr.name,
            gdr.enabled,
            gdr.event_types,
            COALESCE(gdr.environments, ARRAY[]::text[]) AS environments,
            COALESCE(gdr.services, ARRAY[]::text[]) AS services,
            gdr.severity_min,
            gdr.bundle_type,
            gdr.incident_status,
            gdr.cooldown_seconds,
            gdr.created_at::text AS created_at,
            gdr.updated_at::text AS updated_at
          FROM github_dispatch_rules gdr
          JOIN projects p ON p.id = gdr.project_id
          WHERE p.organization_id = $1
            AND gdr.project_id = $2
            AND gdr.id = $3
          LIMIT 1
        `,
        [input.organization_id, input.project_id, input.rule_id]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubDispatchRuleRow(row);
    },

    async createProjectGitHubRuleForOrganization(input) {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = $1 AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<GitHubDispatchRuleRecord & Record<string, unknown>>(
        `
          INSERT INTO github_dispatch_rules (
            id,
            project_id,
            created_by_user_id,
            name,
            enabled,
            event_types,
            environments,
            services,
            severity_min,
            bundle_type,
            incident_status,
            cooldown_seconds,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3::uuid, $4, $5, $6::text[], $7::text[], $8::text[], $9, $10, $11, $12, now(), now())
          RETURNING
            id AS rule_id,
            project_id,
            created_by_user_id,
            name,
            enabled,
            event_types,
            COALESCE(environments, ARRAY[]::text[]) AS environments,
            COALESCE(services, ARRAY[]::text[]) AS services,
            severity_min,
            bundle_type,
            incident_status,
            cooldown_seconds,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          randomUUID(),
          input.project_id,
          input.created_by_user_id,
          input.name,
          input.enabled,
          input.event_types,
          input.environments,
          input.services,
          input.severity_min,
          input.bundle_type,
          input.incident_status,
          input.cooldown_seconds
        ]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubDispatchRuleRow(row);
    },

    async updateProjectGitHubRuleForOrganization(input) {
      const hasName = Object.prototype.hasOwnProperty.call(input, "name");
      const hasEnabled = Object.prototype.hasOwnProperty.call(input, "enabled");
      const hasEventTypes = Object.prototype.hasOwnProperty.call(input, "event_types");
      const hasEnvironments = Object.prototype.hasOwnProperty.call(input, "environments");
      const hasServices = Object.prototype.hasOwnProperty.call(input, "services");
      const hasSeverityMin = Object.prototype.hasOwnProperty.call(input, "severity_min");
      const hasBundleType = Object.prototype.hasOwnProperty.call(input, "bundle_type");
      const hasIncidentStatus = Object.prototype.hasOwnProperty.call(input, "incident_status");
      const hasCooldown = Object.prototype.hasOwnProperty.call(input, "cooldown_seconds");

      const result = await db.query<GitHubDispatchRuleRecord & Record<string, unknown>>(
        `
          UPDATE github_dispatch_rules gdr
          SET
            name = CASE WHEN $4::boolean THEN $5 ELSE gdr.name END,
            enabled = CASE WHEN $6::boolean THEN $7 ELSE gdr.enabled END,
            event_types = CASE WHEN $8::boolean THEN $9::text[] ELSE gdr.event_types END,
            environments = CASE WHEN $10::boolean THEN $11::text[] ELSE gdr.environments END,
            services = CASE WHEN $12::boolean THEN $13::text[] ELSE gdr.services END,
            severity_min = CASE WHEN $14::boolean THEN $15 ELSE gdr.severity_min END,
            bundle_type = CASE WHEN $16::boolean THEN $17 ELSE gdr.bundle_type END,
            incident_status = CASE WHEN $18::boolean THEN $19 ELSE gdr.incident_status END,
            cooldown_seconds = CASE WHEN $20::boolean THEN $21 ELSE gdr.cooldown_seconds END,
            updated_at = now()
          FROM projects p
          WHERE gdr.id = $1
            AND gdr.project_id = $2
            AND p.id = gdr.project_id
            AND p.organization_id = $3
            AND (
              $22::uuid IS NULL
              OR $23::text IN ('owner', 'admin')
              OR gdr.created_by_user_id = $22::uuid
            )
          RETURNING
            gdr.id AS rule_id,
            gdr.project_id,
            gdr.created_by_user_id,
            gdr.name,
            gdr.enabled,
            gdr.event_types,
            COALESCE(gdr.environments, ARRAY[]::text[]) AS environments,
            COALESCE(gdr.services, ARRAY[]::text[]) AS services,
            gdr.severity_min,
            gdr.bundle_type,
            gdr.incident_status,
            gdr.cooldown_seconds,
            gdr.created_at::text AS created_at,
            gdr.updated_at::text AS updated_at
        `,
        [
          input.rule_id,
          input.project_id,
          input.organization_id,
          hasName,
          hasName ? input.name ?? null : null,
          hasEnabled,
          hasEnabled ? input.enabled ?? null : null,
          hasEventTypes,
          hasEventTypes ? input.event_types ?? [] : [],
          hasEnvironments,
          hasEnvironments ? input.environments ?? [] : [],
          hasServices,
          hasServices ? input.services ?? [] : [],
          hasSeverityMin,
          hasSeverityMin ? input.severity_min ?? null : null,
          hasBundleType,
          hasBundleType ? input.bundle_type ?? null : null,
          hasIncidentStatus,
          hasIncidentStatus ? input.incident_status ?? null : null,
          hasCooldown,
          hasCooldown ? input.cooldown_seconds ?? null : null,
          input.actor_user_id ?? null,
          input.actor_role ?? null
        ]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubDispatchRuleRow(row);
    },

    async deleteProjectGitHubRuleForOrganization(input) {
      const result = await db.query<{ rule_id: string }>(
        `
          DELETE FROM github_dispatch_rules gdr
          USING projects p
          WHERE gdr.project_id = p.id
            AND p.organization_id = $1
            AND gdr.project_id = $2
            AND gdr.id = $3
            AND (
              $4::uuid IS NULL
              OR $5::text IN ('owner', 'admin')
              OR gdr.created_by_user_id = $4::uuid
            )
          RETURNING gdr.id AS rule_id
        `,
        [
          input.organization_id,
          input.project_id,
          input.rule_id,
          input.actor_user_id ?? null,
          input.actor_role ?? null
        ]
      );

      return result.rows[0] !== undefined;
    },

    async listProjectGitHubDeliveriesForOrganization(input) {
      const result = await db.query<GitHubDispatchDeliveryRecord & Record<string, unknown>>(
        `
          SELECT
            gdd.id AS delivery_id,
            gdd.rule_id,
            gdd.rule_name,
            gdd.incident_id,
            gdd.improvement_opportunity_id AS improvement_id,
            COALESCE(i.title, io.title) AS target_title,
            gdd.status,
            gdd.attempt_count,
            gdd.last_attempt_at::text AS last_attempt_at,
            gdd.last_error,
            gdd.github_status_code,
            gdd.created_at::text AS created_at
          FROM github_dispatch_deliveries gdd
          JOIN projects p ON p.id = gdd.project_id
          LEFT JOIN incidents i ON i.id = gdd.incident_id
          LEFT JOIN improvement_opportunities io ON io.id = gdd.improvement_opportunity_id
          WHERE p.organization_id = $1
            AND gdd.project_id = $2
            AND ($3::text IS NULL OR gdd.status = $3)
          ORDER BY gdd.created_at DESC, gdd.id DESC
          LIMIT $4
        `,
        [input.organization_id, input.project_id, input.status ?? null, input.limit]
      );

      return result.rows.map(mapGitHubDispatchDeliveryRow);
    },

    async retryProjectGitHubDeliveryForOrganization(input) {
      const result = await db.query<GitHubDispatchDeliveryRecord & Record<string, unknown>>(
        `
          UPDATE github_dispatch_deliveries gdd
          SET
            status = 'retrying',
            next_attempt_at = now(),
            last_error = NULL,
            github_status_code = NULL,
            updated_at = now()
          FROM github_dispatch_rules gdr
          JOIN projects p ON p.id = gdr.project_id
          WHERE gdd.rule_id = gdr.id
            AND p.id = gdd.project_id
            AND p.organization_id = $1
            AND gdd.project_id = $2
            AND gdd.id = $3
            AND gdd.status = 'failed'
            AND (
              $4::uuid IS NULL
              OR $5::text IN ('owner', 'admin')
              OR gdr.created_by_user_id = $4::uuid
            )
          RETURNING
            gdd.id AS delivery_id,
            gdd.rule_id,
            gdd.rule_name,
            gdd.incident_id,
            gdd.improvement_opportunity_id AS improvement_id,
            COALESCE(
              (SELECT incidents.title FROM incidents WHERE incidents.id = gdd.incident_id),
              (SELECT improvement_opportunities.title FROM improvement_opportunities WHERE improvement_opportunities.id = gdd.improvement_opportunity_id)
            ) AS target_title,
            gdd.status,
            gdd.attempt_count,
            gdd.last_attempt_at::text AS last_attempt_at,
            gdd.last_error,
            gdd.github_status_code,
            gdd.created_at::text AS created_at
        `,
        [
          input.organization_id,
          input.project_id,
          input.delivery_id,
          input.actor_user_id ?? null,
          input.actor_role ?? null
        ]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubDispatchDeliveryRow(row);
    },

    async listMatchingGitHubDispatchRules(input) {
      const result = await db.query<MatchingGitHubDispatchRule & Record<string, unknown> & {
        organization_plan: string;
        environments: string[] | null;
        services: string[] | null;
        severity_min: GitHubDispatchRuleRecord["severity_min"];
        bundle_type: GitHubDispatchRuleRecord["bundle_type"];
        incident_status: GitHubDispatchRuleRecord["incident_status"];
      }>(
        `
          SELECT
            gdr.id AS rule_id,
            gdr.name AS rule_name,
            COALESCE(o.plan, 'free') AS organization_plan,
            gi.installation_id,
            pgr.repo_owner,
            pgr.repo_name,
            pgr.default_branch,
            gdr.cooldown_seconds,
            gdr.environments,
            gdr.services,
            gdr.severity_min,
            gdr.bundle_type,
            gdr.incident_status
          FROM github_dispatch_rules gdr
          JOIN projects p ON p.id = gdr.project_id
          JOIN organizations o ON o.id = p.organization_id
          JOIN project_github_repos pgr ON pgr.project_id = gdr.project_id
          JOIN github_installations gi ON gi.id = pgr.installation_id
          WHERE gdr.project_id = $1
            AND gdr.enabled = true
            AND gi.status = 'active'
            AND ($2 = ANY(gdr.event_types))
          ORDER BY gdr.created_at DESC, gdr.id DESC
        `,
        [input.project_id, input.event_type]
      );

      return result.rows
        .filter((row) => {
          if (!getTierCapabilities(row.organization_plan).github_automation) {
            return false;
          }

          if (Array.isArray(row.environments) && row.environments.length > 0 && !row.environments.includes(input.environment)) {
            return false;
          }

          if (Array.isArray(row.services) && row.services.length > 0 && !row.services.includes(input.service_name)) {
            return false;
          }

          if (typeof row.severity_min === "string" && SEVERITY_RANK[input.severity] < SEVERITY_RANK[row.severity_min]) {
            return false;
          }

          if (typeof row.bundle_type === "string" && row.bundle_type !== input.bundle_type) {
            return false;
          }

          if (input.event_type === "bundle.created" && row.incident_status === "reopened_only") {
            return false;
          }

          if (input.event_type === "bundle.reopened" && row.incident_status === "new_only") {
            return false;
          }

          return true;
        })
        .map(mapMatchingGitHubDispatchRule);
    },

    async hasRecentGitHubDispatch(input) {
      const result = await db.query<{ id: string }>(
        `
          SELECT id
          FROM github_dispatch_deliveries
          WHERE rule_id = $1
            AND target_fingerprint = $2
            AND created_at >= now() - ($3::text || ' seconds')::interval
          LIMIT 1
        `,
        [input.rule_id, input.incident_fingerprint, input.cooldown_seconds]
      );

      return result.rows[0] !== undefined;
    },

    async countProjectGitHubDispatchesSince(input) {
      const result = await db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM github_dispatch_deliveries
          WHERE project_id = $1
            AND created_at >= $2::timestamptz
            AND status <> 'skipped'
        `,
        [input.project_id, input.since]
      );

      return Number(result.rows[0]?.count ?? "0");
    },

    async countInstallationGitHubDispatchesSince(input) {
      const result = await db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM github_dispatch_deliveries
          WHERE installation_id = $1
            AND created_at >= $2::timestamptz
            AND status <> 'skipped'
        `,
        [input.installation_id, input.since]
      );

      return Number(result.rows[0]?.count ?? "0");
    },

    async createGitHubDispatchDeliveryIntent(input) {
      const deliveryId = randomUUID();
      const result = await db.query<{ id: string }>(
        `
          INSERT INTO github_dispatch_deliveries (
            id,
            rule_id,
            rule_name,
            project_id,
            incident_id,
            improvement_opportunity_id,
            target_fingerprint,
            dedupe_key,
            installation_id,
            repo_owner,
            repo_name,
            status,
            attempt_count,
            dispatch_payload,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', 0, $12::jsonb, now(), now())
          ON CONFLICT (rule_id, target_fingerprint, dedupe_key) DO NOTHING
          RETURNING id
        `,
        [
          deliveryId,
          input.rule_id,
          input.rule_name,
          input.project_id,
          input.incident_id,
          input.improvement_id,
          input.target_fingerprint,
          input.dedupe_key,
          input.installation_id,
          input.repo_owner,
          input.repo_name,
          JSON.stringify(input.dispatch_payload)
        ]
      );

      return result.rows[0] === undefined ? { delivery_id: deliveryId, created: false } : { delivery_id: deliveryId, created: true };
    },

    async createSkippedGitHubDispatchDelivery(input) {
      const deliveryId = randomUUID();
      const result = await db.query<{ id: string }>(
        `
          INSERT INTO github_dispatch_deliveries (
            id,
            rule_id,
            rule_name,
            project_id,
            incident_id,
            improvement_opportunity_id,
            target_fingerprint,
            dedupe_key,
            installation_id,
            repo_owner,
            repo_name,
            status,
            attempt_count,
            last_error,
            dispatch_payload,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'skipped', 0, $12, $13::jsonb, now(), now())
          ON CONFLICT (rule_id, target_fingerprint, dedupe_key) DO NOTHING
          RETURNING id
        `,
        [
          deliveryId,
          input.rule_id,
          input.rule_name,
          input.project_id,
          input.incident_id,
          input.improvement_id,
          input.target_fingerprint,
          input.dedupe_key,
          input.installation_id,
          input.repo_owner,
          input.repo_name,
          input.reason,
          JSON.stringify(input.dispatch_payload)
        ]
      );

      return result.rows[0] === undefined ? { delivery_id: deliveryId, created: false } : { delivery_id: deliveryId, created: true };
    },

    async claimDueGitHubDispatchDeliveries(limit) {
      const result = await db.query<DeliverGitHubDispatchJob & Record<string, unknown>>(
        `
          WITH due AS (
            SELECT id, attempt_count
            FROM github_dispatch_deliveries
            WHERE status = 'pending'
              OR (status = 'retrying' AND next_attempt_at IS NOT NULL AND next_attempt_at <= now())
            ORDER BY created_at ASC, id ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE github_dispatch_deliveries deliveries
          SET
            status = 'retrying',
            next_attempt_at = now() + interval '30 seconds',
            updated_at = now()
          FROM due
          WHERE deliveries.id = due.id
          RETURNING deliveries.id AS delivery_id, due.attempt_count + 1 AS attempt
        `,
        [limit]
      );

      return result.rows.map((row) => ({ delivery_id: row.delivery_id, attempt: Number(row.attempt) }));
    },

    async getGitHubDispatchDeliveryIntent(deliveryId) {
      const result = await db.query<GitHubDispatchDeliveryIntent & Record<string, unknown> & { organization_plan: string }>(
        `
          SELECT
            gdd.id AS delivery_id,
            gdd.rule_id,
            gdd.project_id,
            gdd.incident_id,
            gdd.improvement_opportunity_id AS improvement_id,
            gdd.installation_id,
            gdd.repo_owner,
            gdd.repo_name,
            gdd.status,
            gdd.attempt_count,
            gdd.next_attempt_at::text AS next_attempt_at,
            gdd.last_attempt_at::text AS last_attempt_at,
            gdd.last_error,
            gdd.github_status_code,
            gdd.dispatch_payload,
            COALESCE(o.plan, 'free') AS organization_plan
          FROM github_dispatch_deliveries gdd
          JOIN projects p ON p.id = gdd.project_id
          JOIN organizations o ON o.id = p.organization_id
          WHERE gdd.id = $1
          LIMIT 1
        `,
        [deliveryId]
      );

      const row = result.rows[0];
      if (row === undefined || !getTierCapabilities(row.organization_plan).github_automation) {
        return null;
      }

      return mapGitHubDispatchDeliveryIntent(row);
    },

    async markGitHubDispatchDeliveryAttempt(input) {
      if (input.delivered) {
        const result = await db.query<MarkGitHubDispatchDeliveryAttemptResult & Record<string, unknown>>(
          `
            UPDATE github_dispatch_deliveries
            SET
              status = 'delivered',
              attempt_count = $2,
              next_attempt_at = NULL,
              last_attempt_at = now(),
              last_error = NULL,
              github_status_code = $3,
              updated_at = now()
            WHERE id = $1
            RETURNING status, NULL::integer AS next_attempt
          `,
          [input.delivery_id, input.attempt, input.github_status_code]
        );

        return result.rows[0] ?? { status: "delivered", next_attempt: null };
      }

      const nextAttempt = input.attempt + 1;
      const retryDelaySeconds = input.retry_after_seconds ?? GITHUB_DISPATCH_RETRY_DELAYS_SECONDS[input.attempt - 1] ?? null;

      if (retryDelaySeconds !== null) {
        const result = await db.query<MarkGitHubDispatchDeliveryAttemptResult & Record<string, unknown>>(
          `
            UPDATE github_dispatch_deliveries
            SET
              status = 'retrying',
              attempt_count = $2,
              next_attempt_at = now() + ($3::text || ' seconds')::interval,
              last_attempt_at = now(),
              last_error = $4,
              github_status_code = $5,
              updated_at = now()
            WHERE id = $1
            RETURNING status, ($2 + 1) AS next_attempt
          `,
          [input.delivery_id, input.attempt, retryDelaySeconds, input.error_message, input.github_status_code]
        );

        return result.rows[0] ?? { status: "retrying", next_attempt: nextAttempt };
      }

      const result = await db.query<MarkGitHubDispatchDeliveryAttemptResult & Record<string, unknown>>(
        `
          UPDATE github_dispatch_deliveries
          SET
            status = 'failed',
            attempt_count = $2,
            next_attempt_at = NULL,
            last_attempt_at = now(),
            last_error = $3,
            github_status_code = $4,
            updated_at = now()
          WHERE id = $1
          RETURNING status, NULL::integer AS next_attempt
        `,
        [input.delivery_id, input.attempt, input.error_message, input.github_status_code]
      );

      return result.rows[0] ?? { status: "failed", next_attempt: null };
    }
  };
}
