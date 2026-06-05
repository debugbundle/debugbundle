import type {
  AccountDataExportRecord,
  AccountLifecycleStore,
  DeletedAccountRecord,
  Queryable,
  UserAvatarRecord,
} from "./types.js";

type JsonRow = {
  data: Record<string, unknown> | null;
};

async function queryJsonRows(
  db: Queryable,
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  const result = await db.query<JsonRow>(sql, params);
  return result.rows.flatMap((row) => {
    if (row.data === null || typeof row.data !== "object") {
      return [];
    }
    return [row.data];
  });
}

async function queryJsonRow(
  db: Queryable,
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown> | null> {
  const rows = await queryJsonRows(db, sql, params);
  return rows[0] ?? null;
}

async function queryProjectScopedRows(
  db: Queryable,
  tableName: string,
  projectIds: string[],
  orderBySql: string,
  selectSql = "*",
): Promise<Record<string, unknown>[]> {
  if (projectIds.length === 0) {
    return [];
  }

  return queryJsonRows(
    db,
    `
      SELECT to_jsonb(t) AS data
      FROM (
        SELECT ${selectSql}
        FROM ${tableName}
        WHERE project_id = ANY($1::uuid[])
        ORDER BY ${orderBySql}
      ) t
    `,
    [projectIds],
  );
}

async function rollbackQuietly(db: Queryable): Promise<void> {
  await db.query("ROLLBACK", []).catch(() => undefined);
}

function mapUserAvatarRow(row: Record<string, unknown>): UserAvatarRecord {
  return {
    user_id: String(row["user_id"]),
    source: row["avatar_source"] === "github" ? "github" : "gravatar",
    object_key: String(row["avatar_object_key"]),
    content_type: String(row["avatar_content_type"]),
    updated_at: String(row["avatar_updated_at"]),
  };
}

export function createPostgresAccountStore(db: Queryable): AccountLifecycleStore {
  return {
    async exportAccountForOrganization(input): Promise<AccountDataExportRecord | null> {
      const user = await queryJsonRow(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT
              u.*, 
              u.id AS user_id,
              true AS has_email_auth,
              EXISTS (
                SELECT 1
                FROM oauth_identities oi
                WHERE oi.user_id = u.id
                  AND oi.provider = 'github'
              ) AS has_github_oauth
            FROM users u
            JOIN organization_members om
              ON om.user_id = u.id
            WHERE u.id = $1
              AND om.organization_id = $2
            LIMIT 1
          ) t
        `,
        [input.user_id, input.organization_id],
      );

      if (user === null) {
        return null;
      }

      const organization = await queryJsonRow(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT
              o.*, 
              o.id AS organization_id
            FROM organizations o
            WHERE o.id = $1
            LIMIT 1
          ) t
        `,
        [input.organization_id],
      );

      if (organization === null) {
        return null;
      }

      const members = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT
              om.*, 
              om.id AS organization_member_id,
              u.email,
              u.email_verified_at,
              u.accepted_terms_at
            FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = $1
            ORDER BY om.created_at ASC, om.user_id ASC
          ) t
        `,
        [input.organization_id],
      );

      const projectInvites = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT project_invites.*,
                   project_invites.id AS invite_id
            FROM project_invites
            JOIN projects p ON p.id = project_invites.project_id
            WHERE p.organization_id = $1
            ORDER BY created_at ASC, id ASC
          ) t
        `,
        [input.organization_id],
      );

      const memberTokens = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT member_tokens.*,
                   member_tokens.id AS token_id
            FROM member_tokens
            WHERE organization_id = $1
            ORDER BY created_at ASC, id ASC
          ) t
        `,
        [input.organization_id],
      );

      const projects = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT projects.*, projects.id AS project_id
            FROM projects
            WHERE organization_id = $1
            ORDER BY created_at ASC, id ASC
          ) t
        `,
        [input.organization_id],
      );

      const projectIds = projects.flatMap((project) => {
        const projectId = project["project_id"];
        return typeof projectId === "string" ? [projectId] : [];
      });

      const projectMembers = await queryProjectScopedRows(
        db,
        "project_members",
        projectIds,
        "created_at ASC, id ASC",
        "project_members.*, project_members.id AS project_member_id",
      );
      const projectTokens = await queryProjectScopedRows(
        db,
        "project_tokens",
        projectIds,
        "created_at ASC, id ASC",
        "project_tokens.*, project_tokens.id AS token_id",
      );
      const probeActivations = await queryProjectScopedRows(
        db,
        "probe_activations",
        projectIds,
        "created_at ASC, id ASC",
        "probe_activations.*, probe_activations.id AS activation_id",
      );
      const capturePolicies = await queryProjectScopedRows(
        db,
        "capture_policies",
        projectIds,
        "project_id ASC",
      );
      const services = await queryProjectScopedRows(
        db,
        "services",
        projectIds,
        "created_at ASC, id ASC",
        "services.*, services.id AS service_id",
      );
      const deployments = await queryProjectScopedRows(
        db,
        "deployments",
        projectIds,
        "created_at ASC, id ASC",
        "deployments.*, deployments.id AS deployment_id",
      );
      const processedEvents = await queryProjectScopedRows(
        db,
        "processed_events",
        projectIds,
        "processed_at ASC, event_id ASC",
      );
      const improvementOpportunities = await queryProjectScopedRows(
        db,
        "improvement_opportunities",
        projectIds,
        "created_at ASC, id ASC",
        "improvement_opportunities.*, improvement_opportunities.id AS improvement_opportunity_id",
      );
      const incidents = await queryProjectScopedRows(
        db,
        "incidents",
        projectIds,
        "created_at ASC, id ASC",
        "incidents.*, incidents.id AS incident_id",
      );
      const bundleGenerations = await queryProjectScopedRows(
        db,
        "bundle_generations",
        projectIds,
        "created_at ASC, id ASC",
        "bundle_generations.*, bundle_generations.id AS bundle_generation_id",
      );
      const alertRules = await queryProjectScopedRows(
        db,
        "alert_rules",
        projectIds,
        "created_at ASC, id ASC",
        "alert_rules.*, alert_rules.id AS alert_id",
      );
      const slackDestinations = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT slack_destinations.*, slack_destinations.id AS slack_destination_id
            FROM slack_destinations
            WHERE organization_id = $1
            ORDER BY created_at ASC, id ASC
          ) t
        `,
        [input.organization_id],
      );
      const alertDeliveries = await queryProjectScopedRows(
        db,
        "alert_deliveries",
        projectIds,
        "created_at ASC, id ASC",
        "alert_deliveries.*, alert_deliveries.id AS delivery_id",
      );
      const alertEmailDigests = await queryProjectScopedRows(
        db,
        "alert_email_digests",
        projectIds,
        "created_at ASC, id ASC",
        "alert_email_digests.*, alert_email_digests.id AS digest_id",
      );
      const alertEmailDigestItems = await queryProjectScopedRows(
        db,
        "alert_email_digest_items",
        projectIds,
        "created_at ASC, id ASC",
        "alert_email_digest_items.*, alert_email_digest_items.id AS digest_item_id",
      );
      const weeklyReportChannels = await queryProjectScopedRows(
        db,
        "weekly_report_channels",
        projectIds,
        "created_at ASC, id ASC",
        "weekly_report_channels.*, weekly_report_channels.id AS weekly_report_channel_id",
      );
      const weeklyReportDeliveries = await queryProjectScopedRows(
        db,
        "weekly_report_deliveries",
        projectIds,
        "created_at ASC, id ASC",
        "weekly_report_deliveries.*, weekly_report_deliveries.id AS delivery_id",
      );
      const agentWebhooks = await queryProjectScopedRows(
        db,
        "agent_webhooks",
        projectIds,
        "created_at ASC, id ASC",
        "agent_webhooks.*, agent_webhooks.id AS webhook_id",
      );
      const webhookDeliveries = await queryProjectScopedRows(
        db,
        "webhook_deliveries",
        projectIds,
        "created_at ASC, id ASC",
        "webhook_deliveries.*, webhook_deliveries.id AS delivery_id",
      );
      const projectGitHubRepos = await queryProjectScopedRows(
        db,
        "project_github_repos",
        projectIds,
        "created_at ASC, id ASC",
        "project_github_repos.*, project_github_repos.id AS project_github_repo_id",
      );
      const githubDispatchRules = await queryProjectScopedRows(
        db,
        "github_dispatch_rules",
        projectIds,
        "created_at ASC, id ASC",
        "github_dispatch_rules.*, github_dispatch_rules.id AS rule_id",
      );
      const githubDispatchDeliveries = await queryProjectScopedRows(
        db,
        "github_dispatch_deliveries",
        projectIds,
        "created_at ASC, id ASC",
        "github_dispatch_deliveries.*, github_dispatch_deliveries.id AS delivery_id",
      );

      const incidentEvents =
        projectIds.length === 0
          ? []
          : await queryJsonRows(
              db,
              `
                SELECT to_jsonb(t) AS data
                FROM (
                  SELECT
                    incident_events.*,
                    incidents.project_id
                  FROM incident_events
                  JOIN incidents ON incidents.id = incident_events.incident_id
                  WHERE incidents.project_id = ANY($1::uuid[])
                  ORDER BY incident_events.occurred_at ASC, incident_events.event_id ASC
                ) t
              `,
              [projectIds],
            );

      const improvementOpportunityEvents =
        projectIds.length === 0
          ? []
          : await queryJsonRows(
              db,
              `
                SELECT to_jsonb(t) AS data
                FROM (
                  SELECT
                    improvement_opportunity_events.*,
                    improvement_opportunities.project_id
                  FROM improvement_opportunity_events
                  JOIN improvement_opportunities
                    ON improvement_opportunities.id = improvement_opportunity_events.improvement_opportunity_id
                  WHERE improvement_opportunities.project_id = ANY($1::uuid[])
                  ORDER BY improvement_opportunity_events.occurred_at ASC, improvement_opportunity_events.event_id ASC
                ) t
              `,
              [projectIds],
            );

      const githubInstallations = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT github_installations.*, github_installations.id AS github_installation_id
            FROM github_installations
            WHERE organization_id = $1
            ORDER BY created_at ASC, id ASC
          ) t
        `,
        [input.organization_id],
      );

      const githubMarketplaceAccounts = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT github_marketplace_accounts.*
            FROM github_marketplace_accounts
            WHERE organization_id = $1
            ORDER BY updated_at ASC, created_at ASC, id ASC
          ) t
        `,
        [input.organization_id],
      );

      const orgUsageCounters = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT *
            FROM org_usage_counters
            WHERE organization_id = $1
            ORDER BY period_starts_at ASC
          ) t
        `,
        [input.organization_id],
      );

      const processedBillingEvents = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT processed_billing_events.*
            FROM processed_billing_events
            WHERE organization_id = $1
            ORDER BY processed_at ASC, event_id ASC
          ) t
        `,
        [input.organization_id],
      );

      const processedGitHubMarketplaceEvents = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT pgme.*
            FROM processed_github_marketplace_events pgme
            JOIN github_marketplace_accounts gma
              ON gma.marketplace_account_id = pgme.marketplace_account_id
            WHERE gma.organization_id = $1
            ORDER BY pgme.processed_at ASC, pgme.delivery_id ASC
          ) t
        `,
        [input.organization_id],
      );

      const planCleanupTasks = await queryProjectScopedRows(
        db,
        "plan_cleanup_tasks",
        projectIds,
        "created_at ASC, id ASC",
        "plan_cleanup_tasks.*, plan_cleanup_tasks.id AS task_id",
      );

      const operationalEmailDeliveries = await queryProjectScopedRows(
        db,
        "operational_email_deliveries",
        projectIds,
        "created_at ASC, id ASC",
        "operational_email_deliveries.*, operational_email_deliveries.id AS delivery_id",
      );

      const auditLogs = await queryJsonRows(
        db,
        `
          SELECT to_jsonb(t) AS data
          FROM (
            SELECT audit_logs.*, audit_logs.id AS audit_log_id
            FROM audit_logs
            WHERE organization_id = $1
            ORDER BY occurred_at ASC, created_at ASC, id ASC
          ) t
        `,
        [input.organization_id],
      );

      return {
        export_version: 1,
        exported_at: input.exported_at,
        user,
        organization,
        members,
        project_members: projectMembers,
        project_invites: projectInvites,
        member_tokens: memberTokens,
        projects,
        project_tokens: projectTokens,
        probe_activations: probeActivations,
        capture_policies: capturePolicies,
        services,
        deployments,
        processed_events: processedEvents,
        improvement_opportunities: improvementOpportunities,
        improvement_opportunity_events: improvementOpportunityEvents,
        incidents,
        incident_events: incidentEvents,
        bundle_generations: bundleGenerations,
        alert_rules: alertRules,
        slack_destinations: slackDestinations,
        alert_deliveries: alertDeliveries,
        alert_email_digests: alertEmailDigests,
        alert_email_digest_items: alertEmailDigestItems,
        weekly_report_channels: weeklyReportChannels,
        weekly_report_deliveries: weeklyReportDeliveries,
        agent_webhooks: agentWebhooks,
        webhook_deliveries: webhookDeliveries,
        github_installations: githubInstallations,
        github_marketplace_accounts: githubMarketplaceAccounts,
        project_github_repos: projectGitHubRepos,
        github_dispatch_rules: githubDispatchRules,
        github_dispatch_deliveries: githubDispatchDeliveries,
        org_usage_counters: orgUsageCounters,
        processed_billing_events: processedBillingEvents,
        processed_github_marketplace_events: processedGitHubMarketplaceEvents,
        plan_cleanup_tasks: planCleanupTasks,
        operational_email_deliveries: operationalEmailDeliveries,
        audit_logs: auditLogs,
        artifacts: {
          raw_events: [],
          bundles: [],
          reproductions: [],
        },
      };
    },

    async deleteAccountForOrganization(input): Promise<DeletedAccountRecord | "other_owned_organizations_exist" | null> {
      await db.query("BEGIN", []);

      try {
        const membership = await db.query<{ role: string }>(
          `
            SELECT role
            FROM organization_members
            WHERE organization_id = $1
              AND user_id = $2
            LIMIT 1
          `,
          [input.organization_id, input.user_id],
        );

        if (membership.rows[0] === undefined) {
          await rollbackQuietly(db);
          return null;
        }

        const blockingOwnership = await db.query<{ organization_id: string }>(
          `
            SELECT om.organization_id::text AS organization_id
            FROM organization_members om
            WHERE om.user_id = $2
              AND om.organization_id <> $1
              AND om.role = 'owner'
              AND NOT EXISTS (
                SELECT 1
                FROM organization_members other
                WHERE other.organization_id = om.organization_id
                  AND other.user_id <> $2
                  AND other.role = 'owner'
              )
            LIMIT 1
          `,
          [input.organization_id, input.user_id],
        );

        if (blockingOwnership.rows[0] !== undefined) {
          await rollbackQuietly(db);
          return "other_owned_organizations_exist";
        }

        const projectIdRows = await db.query<{ project_id: string }>(
          `
            SELECT id::text AS project_id
            FROM projects
            WHERE organization_id = $1
            ORDER BY created_at ASC, id ASC
          `,
          [input.organization_id],
        );
        const deletedProjectIds = projectIdRows.rows.map((row) => row.project_id);

        const deletedOrgMemberTokens = await db.query<{ token_id: string }>(
          `
            DELETE FROM member_tokens
            WHERE organization_id = $1
            RETURNING id::text AS token_id
          `,
          [input.organization_id],
        );

        await db.query(
          `
            DELETE FROM processed_billing_events
            WHERE organization_id = $1
          `,
          [input.organization_id],
        );

        await db.query(
          `
            DELETE FROM audit_logs
            WHERE organization_id = $1
          `,
          [input.organization_id],
        );

        await db.query(
          `
            DELETE FROM projects
            WHERE organization_id = $1
          `,
          [input.organization_id],
        );

        const deletedOrganization = await db.query<{ organization_id: string }>(
          `
            DELETE FROM organizations
            WHERE id = $1
            RETURNING id::text AS organization_id
          `,
          [input.organization_id],
        );

        if (deletedOrganization.rows[0] === undefined) {
          await rollbackQuietly(db);
          return null;
        }

        const remainingMemberships = await db.query<{ membership_count: string }>(
          `
            SELECT COUNT(*)::text AS membership_count
            FROM organization_members
            WHERE user_id = $1
          `,
          [input.user_id],
        );

        let deletedMemberTokenCount = deletedOrgMemberTokens.rows.length;
        let userDeleted = false;

        if (Number(remainingMemberships.rows[0]?.membership_count ?? "0") === 0) {
          const deletedUserMemberTokens = await db.query<{ token_id: string }>(
            `
              DELETE FROM member_tokens
              WHERE user_id = $1
              RETURNING id::text AS token_id
            `,
            [input.user_id],
          );

          deletedMemberTokenCount += deletedUserMemberTokens.rows.length;

          await db.query(
            `
              DELETE FROM audit_logs
              WHERE actor_user_id = $1
                 OR target_id = $1::text
            `,
            [input.user_id],
          );

          await db.query(
            `
              DELETE FROM users
              WHERE id = $1
            `,
            [input.user_id],
          );

          userDeleted = true;
        }

        await db.query("COMMIT", []);

        return {
          deleted_at: input.deleted_at,
          organization_id: input.organization_id,
          deleted_project_ids: deletedProjectIds,
          user_deleted: userDeleted,
          deleted_member_token_count: deletedMemberTokenCount,
        };
      } catch (error) {
        await rollbackQuietly(db);
        throw error;
      }
    },
    async getUserAvatar(input): Promise<UserAvatarRecord | null> {
      const result = await db.query<Record<string, unknown>>(
        `
          SELECT
            id AS user_id,
            avatar_source,
            avatar_object_key,
            avatar_content_type,
            avatar_updated_at::text AS avatar_updated_at
          FROM users
          WHERE id = $1
            AND avatar_source IS NOT NULL
            AND avatar_object_key IS NOT NULL
            AND avatar_content_type IS NOT NULL
            AND avatar_updated_at IS NOT NULL
          LIMIT 1
        `,
        [input.user_id],
      );

      const row = result.rows[0];
      return row === undefined ? null : mapUserAvatarRow(row);
    },
    async saveUserAvatar(input): Promise<UserAvatarRecord | null> {
      const result = await db.query<Record<string, unknown>>(
        `
          UPDATE users
          SET avatar_source = $2,
              avatar_object_key = $3,
              avatar_content_type = $4,
              avatar_updated_at = $5::timestamptz,
              updated_at = $5::timestamptz
          WHERE id = $1
          RETURNING
            id AS user_id,
            avatar_source,
            avatar_object_key,
            avatar_content_type,
            avatar_updated_at::text AS avatar_updated_at
        `,
        [input.user_id, input.source, input.object_key, input.content_type, input.updated_at],
      );

      const row = result.rows[0];
      return row === undefined ? null : mapUserAvatarRow(row);
    },
  };
}
