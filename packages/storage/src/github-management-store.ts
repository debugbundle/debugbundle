import { runInTransaction } from "./transaction.js";
import { ruleActorAllowedSql } from "./project-rule-access.js";
import { randomUUID } from "node:crypto";
import type {
  GitHubDispatchDeliveryRecord,
  GitHubDispatchRuleRecord,
  GitHubInstallationRecord,
  GitHubStore,
  ProjectGitHubRepoRecord,
  Queryable
} from "./types.js";
import {
  mapGitHubInstallationRow,
  mapProjectGitHubRepoRow,
  mapGitHubDispatchRuleRow,
  mapGitHubDispatchDeliveryRow
} from "./github-records.js";

export function createGitHubManagementStore(
  db: Queryable
): Pick<
  GitHubStore,
  | "getGitHubInstallationForOrganization"
  | "upsertGitHubInstallationForOrganization"
  | "updateGitHubInstallationStatus"
  | "deleteGitHubInstallationForOrganization"
  | "getProjectGitHubRepoForOrganization"
  | "upsertProjectGitHubRepoForOrganization"
  | "deleteProjectGitHubRepoForOrganization"
  | "listProjectGitHubRulesForOrganization"
  | "getProjectGitHubRuleForOrganization"
  | "createProjectGitHubRuleForOrganization"
  | "updateProjectGitHubRuleForOrganization"
  | "deleteProjectGitHubRuleForOrganization"
  | "listProjectGitHubDeliveriesForOrganization"
  | "retryProjectGitHubDeliveryForOrganization"
> {
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
        [
          input.installation_id,
          input.status,
          input.account_login ?? null,
          input.account_type ?? null
        ]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubInstallationRow(row);
    },

    async deleteGitHubInstallationForOrganization(input) {
      try {
        return await runInTransaction(db, async (tx) => {
          await tx.query(
            "SELECT set_config('lock_timeout',CASE WHEN current_setting('lock_timeout')::interval=interval '0' OR current_setting('lock_timeout')::interval>interval '1 second' THEN '1s' ELSE current_setting('lock_timeout') END,true)",
            []
          );
          // A parent installation cascade spans every project in this account.
          // The same organization fence used by merge keeps its snapshot atomic.
          const account = await tx.query<{ id: string }>(
            `SELECT o.id FROM organizations o WHERE o.id=$1::uuid AND ($2::uuid IS NULL OR (o.suspended_at IS NULL AND EXISTS(SELECT 1 FROM organization_members om WHERE om.organization_id=o.id AND om.user_id=$2::uuid AND om.role='owner' AND om.suspended_at IS NULL))) FOR UPDATE`,
            [input.organization_id, input.actor_user_id ?? null]
          );
          if (!account.rows[0]) return false;
          const result = await tx.query<{ id: string }>(
            "DELETE FROM github_installations WHERE organization_id=$1 RETURNING id",
            [input.organization_id]
          );
          return result.rows.length > 0;
        });
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "55P03")
          throw Object.assign(new Error("project_configuration_busy"), { code: "40001" });
        throw error;
      }
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
      return runInTransaction(db, async (db) => {
        // A retained binding belongs to exactly its original namespace. Fence
        // the canonical closure without turning this into a project-wide edit.
        await db.query(
          "SELECT debugbundle_begin_project_rule_write(debugbundle_canonical_project($1::uuid))",
          [input.project_id]
        );
        const projectResult = await db.query<{ id: string }>(
          `
          SELECT p.id FROM projects p
          JOIN github_installations gi ON gi.id=$3::uuid AND gi.organization_id=p.organization_id AND gi.status='active'
          WHERE p.id=$1::uuid AND p.organization_id=$2::uuid
            AND ${ruleActorAllowedSql("p.id", "$4::uuid", "p.owner_user_id")}
          LIMIT 1 FOR SHARE OF gi
        `,
          [
            input.project_id,
            input.organization_id,
            input.installation_id,
            input.actor_user_id ?? null
          ]
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
      });
    },

    async deleteProjectGitHubRepoForOrganization(input) {
      return runInTransaction(db, async (tx) => {
        await tx.query(
          "SELECT debugbundle_begin_project_rule_write(debugbundle_canonical_project($1::uuid))",
          [input.project_id]
        );
        const allowed = await tx.query<{ id: string }>(
          `SELECT p.id FROM projects p WHERE p.id=$2::uuid AND p.organization_id=$1::uuid AND ${ruleActorAllowedSql("p.id", "$3::uuid", "p.owner_user_id")}`,
          [input.organization_id, input.project_id, input.actor_user_id ?? null]
        );
        if (!allowed.rows[0]) return false;
        await tx.query("DELETE FROM github_dispatch_rules WHERE project_id=$1", [input.project_id]);
        const result = await tx.query<{ id: string }>(
          "DELETE FROM project_github_repos WHERE project_id=$1 RETURNING id",
          [input.project_id]
        );
        return result.rows.length > 0;
      });
    },

    async listProjectGitHubRulesForOrganization(input) {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = debugbundle_canonical_project($1::uuid) AND organization_id = $2
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
            debugbundle_rule_view_names($1,COALESCE(filter_project_id,project_id),to_jsonb(services)) AS services,
            severity_min,
            bundle_type,
            incident_status,
            cooldown_seconds,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM github_dispatch_rules
          WHERE project_id=ANY(debugbundle_project_origins($1::uuid))
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
            debugbundle_rule_view_names($2,COALESCE(gdr.filter_project_id,gdr.project_id),to_jsonb(gdr.services)) AS services,
            gdr.severity_min,
            gdr.bundle_type,
            gdr.incident_status,
            gdr.cooldown_seconds,
            gdr.created_at::text AS created_at,
            gdr.updated_at::text AS updated_at
          FROM github_dispatch_rules gdr
          JOIN projects p ON p.id = debugbundle_canonical_project(gdr.project_id)
          WHERE p.organization_id = $1
            AND gdr.project_id=ANY(debugbundle_project_origins($2::uuid))
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
          WHERE id = debugbundle_canonical_project($1::uuid) AND organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<GitHubDispatchRuleRecord & Record<string, unknown>>(
        `
          WITH management_scope AS MATERIALIZED (SELECT debugbundle_begin_project_rule_write($2::uuid))
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
          SELECT $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::text[], $7::text[], $8::text[], $9, $10, $11, $12, now(), now()
          FROM management_scope WHERE ${ruleActorAllowedSql("$2::uuid", "$3::uuid", "$3::uuid")}
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
          WITH management_scope AS MATERIALIZED (SELECT debugbundle_begin_project_rule_write($2::uuid))
          UPDATE github_dispatch_rules gdr
          SET
            name = CASE WHEN $4::boolean THEN $5 ELSE gdr.name END,
            scope_origin_ids=CASE WHEN $23::boolean THEN debugbundle_project_origins(p.id) ELSE gdr.scope_origin_ids END,
            filter_project_id=CASE WHEN $12::boolean THEN $2::uuid ELSE gdr.filter_project_id END,
            enabled = CASE WHEN $6::boolean THEN $7 ELSE gdr.enabled END,
            event_types = CASE WHEN $8::boolean THEN $9::text[] ELSE gdr.event_types END,
            environments = CASE WHEN $10::boolean THEN $11::text[] ELSE gdr.environments END,
            services = CASE WHEN $12::boolean THEN $13::text[] ELSE gdr.services END,
            severity_min = CASE WHEN $14::boolean THEN $15 ELSE gdr.severity_min END,
            bundle_type = CASE WHEN $16::boolean THEN $17 ELSE gdr.bundle_type END,
            incident_status = CASE WHEN $18::boolean THEN $19 ELSE gdr.incident_status END,
            cooldown_seconds = CASE WHEN $20::boolean THEN $21 ELSE gdr.cooldown_seconds END,
            updated_at = now()
          FROM management_scope CROSS JOIN projects p
          WHERE gdr.id = $1
            AND gdr.project_id=ANY(debugbundle_project_origins($2::uuid))
            AND p.id = debugbundle_canonical_project(gdr.project_id)
            AND p.organization_id = $3
            AND ${ruleActorAllowedSql("p.id", "$22::uuid", "gdr.created_by_user_id")}
          RETURNING
            gdr.id AS rule_id,
            gdr.project_id,
            gdr.created_by_user_id,
            gdr.name,
            gdr.enabled,
            gdr.event_types,
            COALESCE(gdr.environments, ARRAY[]::text[]) AS environments,
            debugbundle_rule_view_names($2,COALESCE(gdr.filter_project_id,gdr.project_id),to_jsonb(gdr.services)) AS services,
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
          hasName ? (input.name ?? null) : null,
          hasEnabled,
          hasEnabled ? (input.enabled ?? null) : null,
          hasEventTypes,
          hasEventTypes ? (input.event_types ?? []) : [],
          hasEnvironments,
          hasEnvironments ? (input.environments ?? []) : [],
          hasServices,
          hasServices ? (input.services ?? []) : [],
          hasSeverityMin,
          hasSeverityMin ? (input.severity_min ?? null) : null,
          hasBundleType,
          hasBundleType ? (input.bundle_type ?? null) : null,
          hasIncidentStatus,
          hasIncidentStatus ? (input.incident_status ?? null) : null,
          hasCooldown,
          hasCooldown ? (input.cooldown_seconds ?? null) : null,
          input.actor_user_id ?? null,
          input.project_scope === "current_project"
        ]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubDispatchRuleRow(row);
    },

    async deleteProjectGitHubRuleForOrganization(input) {
      const result = await db.query<{ rule_id: string }>(
        `
          WITH management_scope AS MATERIALIZED (SELECT debugbundle_begin_project_rule_write($2::uuid))
          WITH management_scope AS MATERIALIZED (SELECT debugbundle_begin_project_rule_write($2::uuid))
          DELETE FROM github_dispatch_rules gdr
          USING management_scope,projects p
          WHERE debugbundle_canonical_project(gdr.project_id) = p.id
            AND p.organization_id = $1
            AND gdr.project_id=ANY(debugbundle_project_origins($2::uuid))
            AND gdr.id = $3
            AND ${ruleActorAllowedSql("p.id", "$4::uuid", "gdr.created_by_user_id")}
          RETURNING gdr.id AS rule_id
        `,
        [input.organization_id, input.project_id, input.rule_id, input.actor_user_id ?? null]
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
          JOIN projects p ON p.id = debugbundle_canonical_project(gdd.project_id)
          LEFT JOIN incidents i ON i.id = gdd.incident_id
          LEFT JOIN improvement_opportunities io ON io.id = gdd.improvement_opportunity_id
          WHERE p.organization_id = $1
            AND gdd.project_id=ANY(debugbundle_project_origins($2::uuid))
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
          JOIN projects p ON p.id = debugbundle_canonical_project(gdr.project_id)
          WHERE gdd.rule_id = gdr.id
            AND p.id = debugbundle_canonical_project(gdd.project_id)
            AND p.organization_id = $1
            AND gdd.project_id=ANY(debugbundle_project_origins($2::uuid))
            AND gdd.id = $3
            AND gdd.status = 'failed'
            AND ${ruleActorAllowedSql("p.id", "$4::uuid", "gdr.created_by_user_id")}
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
        [input.organization_id, input.project_id, input.delivery_id, input.actor_user_id ?? null]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubDispatchDeliveryRow(row);
    }
  };
}
