import { deleteNotificationAccountData } from "./notification-account-data.js";
import type { AccountAnalyticsStore } from "./account-analytics-store.js";
import { runInTransaction } from "./transaction.js";
import { prepareOriginDeletion } from "./project-namespace-deletion.js";
import { prepareAccountUserProjectCleanup } from "./account-user-project-cleanup.js";
import type {
  AccountLifecycleStore,
  DeletedAccountRecord,
  AccountDeletionBlockedReason,
  Queryable
} from "./types.js";

class DeletionStopped extends Error {
  constructor(readonly result: AccountDeletionBlockedReason | null) {
    super("account_deletion_stopped");
  }
}

export function createAccountDeletionStore(
  db: Queryable,
  accountAnalyticsStore?: AccountAnalyticsStore
): Pick<AccountLifecycleStore, "deleteAccountForOrganization"> {
  return {
    async deleteAccountForOrganization(
      input
    ): Promise<DeletedAccountRecord | AccountDeletionBlockedReason | null> {
      const deleteAccount = async (
        queryable: Queryable
      ): Promise<DeletedAccountRecord | AccountDeletionBlockedReason | null> => {
        await queryable.query("SELECT id FROM organizations WHERE id=$1::uuid FOR UPDATE", [
          input.organization_id
        ]);
        const membership = await queryable.query<{ role: string }>(
          `
            SELECT role
            FROM organization_members
            WHERE organization_id = $1
              AND user_id = $2
              AND suspended_at IS NULL
            LIMIT 1 FOR UPDATE
          `,
          [input.organization_id, input.user_id]
        );

        if (membership.rows[0]?.role !== "owner") {
          return null;
        }

        const blockingOwnership = await queryable.query<{ organization_id: string }>(
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
          [input.organization_id, input.user_id]
        );

        if (blockingOwnership.rows[0] !== undefined) {
          return "other_owned_organizations_exist";
        }

        const blockingOwnedProject = await queryable.query<{ project_id: string }>(
          `
            SELECT p.id::text AS project_id
            FROM projects p
            WHERE p.owner_user_id = $2
              AND p.organization_id <> $1
            LIMIT 1
          `,
          [input.organization_id, input.user_id]
        );

        if (blockingOwnedProject.rows[0] !== undefined) {
          return "other_owned_projects_exist";
        }
        const projectIdRows = await queryable.query<{ project_id: string }>(
          `
            SELECT id::text AS project_id
            FROM projects
            WHERE organization_id = $1
            ORDER BY created_at ASC, id ASC
          `,
          [input.organization_id]
        );
        const deletedProjectIds = projectIdRows.rows.map((row) => row.project_id);

        const deletionSummary = await queryable.query<{
          project_count: number;
          open_incident_count: number;
          open_improvement_count: number;
        }>(
          `
              SELECT
                (
                  SELECT COUNT(*)::int
                  FROM projects
                  WHERE organization_id = $1::uuid
                ) AS project_count,
                (
                  SELECT COUNT(*)::int
                  FROM incidents i
                  JOIN projects p ON p.id = i.project_id
                  WHERE p.organization_id = $1::uuid
                    AND i.status <> 'resolved'
                ) AS open_incident_count,
                (
                  SELECT COUNT(*)::int
                  FROM improvement_opportunities io
                  JOIN projects p ON p.id = io.project_id
                  WHERE p.organization_id = $1::uuid
                    AND io.status <> 'resolved'
                ) AS open_improvement_count
            `,
          [input.organization_id]
        );
        const deletionSummaryRow = deletionSummary.rows[0] ?? {
          project_count: 0,
          open_incident_count: 0,
          open_improvement_count: 0
        };

        const deletedOrgMemberTokens = await queryable.query<{ token_id: string }>(
          `
            DELETE FROM member_tokens
            WHERE organization_id = $1
            RETURNING id::text AS token_id
          `,
          [input.organization_id]
        );

        if (accountAnalyticsStore !== undefined) {
          const analyticsTx = accountAnalyticsStore.withDb(queryable);
          await analyticsTx.preserveBillingRetentionForDeletedOrganization({
            organization_id: input.organization_id,
            deleted_at: input.deleted_at
          });
          await analyticsTx.recordMetricDeltas({
            organization_id: input.organization_id,
            occurred_at: input.deleted_at,
            source: "account_deleted",
            dedupe_key: `account_deleted:${input.organization_id}`,
            deltas: {
              account_deleted: 1,
              projects_existing_at_account_deletion: deletionSummaryRow.project_count,
              open_incidents_existing_at_account_deletion: deletionSummaryRow.open_incident_count,
              open_improvements_existing_at_account_deletion:
                deletionSummaryRow.open_improvement_count
            }
          });
          await analyticsTx.markAccountDeleted({
            organization_id: input.organization_id,
            deleted_at: input.deleted_at
          });
        }

        await queryable.query(
          `
            DELETE FROM processed_billing_events
            WHERE organization_id = $1
          `,
          [input.organization_id]
        );

        await queryable.query(
          `
            DELETE FROM audit_logs
            WHERE organization_id = $1
          `,
          [input.organization_id]
        );

        await prepareOriginDeletion(queryable, deletedProjectIds, input.organization_id);
        await queryable.query(
          `
            DELETE FROM projects
            WHERE organization_id = $1
          `,
          [input.organization_id]
        );

        const deletedOrganization = await queryable.query<{ organization_id: string }>(
          `
            DELETE FROM organizations
            WHERE id = $1
            RETURNING id::text AS organization_id
          `,
          [input.organization_id]
        );

        if (deletedOrganization.rows[0] === undefined) {
          return null;
        }

        let deletedMemberTokenCount = deletedOrgMemberTokens.rows.length;
        await queryable.query(
          `
            DELETE FROM organization_members
            WHERE user_id = $1
          `,
          [input.user_id]
        );

        const deletedUserMemberTokens = await queryable.query<{ token_id: string }>(
          `
            DELETE FROM member_tokens
            WHERE user_id = $1
            RETURNING id::text AS token_id
          `,
          [input.user_id]
        );

        deletedMemberTokenCount += deletedUserMemberTokens.rows.length;

        await queryable.query(
          `
            DELETE FROM audit_logs
            WHERE actor_user_id = $1
               OR target_id = $1::text
          `,
          [input.user_id]
        );

        await prepareAccountUserProjectCleanup(queryable, input.user_id);
        await deleteNotificationAccountData(queryable, input.user_id);

        await queryable.query(
          `
            DELETE FROM users
            WHERE id = $1
          `,
          [input.user_id]
        );

        return {
          deleted_at: input.deleted_at,
          organization_id: input.organization_id,
          deleted_project_ids: deletedProjectIds,
          user_deleted: true,
          deleted_member_token_count: deletedMemberTokenCount
        };
      };

      try {
        return await runInTransaction(db, async (tx) => {
          const result = await deleteAccount(tx);
          if (result === null || typeof result === "string") throw new DeletionStopped(result);
          return result;
        });
      } catch (error) {
        if (error instanceof DeletionStopped) return error.result;
        throw error;
      }
    }
  };
}
