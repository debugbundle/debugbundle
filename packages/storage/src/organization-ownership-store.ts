import { isSelfHostMode } from "../../shared-types/src/tier-capabilities.js";
import { createWorkerJobStore } from "./worker-job-store.js";
import { randomUUID } from "node:crypto";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
import {
  OrganizationManagementError,
  type OrganizationManagementStore
} from "./organization-management-types.js";
import {
  requireOrganizationAdministrator,
  requireVerifiedUser
} from "./organization-management-shared.js";

export function createOrganizationOwnershipStore(
  db: Queryable
): Pick<
  OrganizationManagementStore,
  | "requestOrganizationOwnershipTransfer"
  | "acceptOrganizationOwnershipTransfer"
  | "getOrganizationOwnershipTransfer"
  | "cancelOrganizationOwnershipTransfer"
> {
  return {
    async getOrganizationOwnershipTransfer(input) {
      if ((await requireOrganizationAdministrator(db, input, false)) !== "owner")
        throw new OrganizationManagementError("forbidden");
      const result = await db.query<{
        transfer_id: string;
        recipient_user_id: string;
        expires_at: string;
      }>(
        `SELECT id AS transfer_id,recipient_user_id,expires_at::text AS expires_at
        FROM organization_ownership_transfers WHERE organization_id=$1::uuid AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at>now()`,
        [input.organization_id]
      );
      return result.rows[0] ?? null;
    },
    async cancelOrganizationOwnershipTransfer(input) {
      return runInTransaction(db, async (tx) => {
        if ((await requireOrganizationAdministrator(tx, input, true)) !== "owner")
          throw new OrganizationManagementError("forbidden");
        await requireVerifiedUser(tx, input.actor_user_id);
        const result = await tx.query<{ id: string }>(
          `UPDATE organization_ownership_transfers SET canceled_at=now()
          WHERE organization_id=$1::uuid AND accepted_at IS NULL AND canceled_at IS NULL RETURNING id`,
          [input.organization_id]
        );
        return result.rows[0] !== undefined;
      });
    },
    async requestOrganizationOwnershipTransfer(input) {
      return runInTransaction(db, async (tx) => {
        if ((await requireOrganizationAdministrator(tx, input, true)) !== "owner")
          throw new OrganizationManagementError("forbidden");
        await requireVerifiedUser(tx, input.actor_user_id);
        if (input.recipient_user_id === input.actor_user_id)
          throw new OrganizationManagementError("ownership_transfer_unavailable");
        const recipient = await tx.query<{ user_id: string }>(
          `SELECT om.user_id FROM organization_members om JOIN users u ON u.id=om.user_id
          WHERE om.organization_id=$1::uuid AND om.user_id=$2::uuid AND om.suspended_at IS NULL AND u.email_verified_at IS NOT NULL`,
          [input.organization_id, input.recipient_user_id]
        );
        if (recipient.rows[0] === undefined)
          throw new OrganizationManagementError("ownership_transfer_unavailable");
        await tx.query(
          "UPDATE organization_ownership_transfers SET canceled_at=now() WHERE organization_id=$1::uuid AND accepted_at IS NULL AND canceled_at IS NULL",
          [input.organization_id]
        );
        const transferId = randomUUID();
        await tx.query(
          `INSERT INTO organization_ownership_transfers(id,organization_id,requested_by_user_id,recipient_user_id,accept_token_hash,expires_at)
          VALUES($1,$2,$3,$4,$5,$6::timestamptz)`,
          [
            transferId,
            input.organization_id,
            input.actor_user_id,
            input.recipient_user_id,
            input.accept_token_hash,
            input.expires_at
          ]
        );
        return { transfer_id: transferId };
      });
    },
    async acceptOrganizationOwnershipTransfer(input) {
      return runInTransaction(db, async (tx) => {
        await requireVerifiedUser(tx, input.user_id);
        const scope = await tx.query<{ organization_id: string }>(
          `SELECT o.id AS organization_id FROM organizations o
          JOIN organization_ownership_transfers t ON t.organization_id=o.id WHERE t.accept_token_hash=$1
            AND (o.plan='business' OR ${isSelfHostMode() ? "true" : "false"}) AND o.suspended_at IS NULL FOR UPDATE OF o`,
          [input.accept_token_hash]
        );
        const org = scope.rows[0]?.organization_id;
        if (org === undefined)
          throw new OrganizationManagementError("ownership_transfer_unavailable");
        const result = await tx.query<{ id: string; requested_by_user_id: string }>(
          `SELECT t.id,t.requested_by_user_id
          FROM organization_ownership_transfers t
          JOIN organization_members sender ON sender.organization_id=t.organization_id AND sender.user_id=t.requested_by_user_id
          JOIN organization_members recipient ON recipient.organization_id=t.organization_id AND recipient.user_id=t.recipient_user_id
          JOIN users requester ON requester.id=t.requested_by_user_id AND requester.email_verified_at IS NOT NULL
          WHERE t.accept_token_hash=$1 AND t.recipient_user_id=$2::uuid AND t.accepted_at IS NULL AND t.canceled_at IS NULL
            AND t.expires_at>$3::timestamptz AND sender.role='owner' AND sender.suspended_at IS NULL
            AND recipient.suspended_at IS NULL AND recipient.grants_paused_at IS NULL
            AND (SELECT COUNT(*) FROM organization_members WHERE organization_id=t.organization_id AND role='owner')=1
            AND NOT EXISTS(SELECT 1 FROM projects p WHERE p.organization_id=t.organization_id
              AND p.owner_user_id IS DISTINCT FROM t.requested_by_user_id)
          FOR UPDATE OF t`,
          [input.accept_token_hash, input.user_id, input.now]
        );
        const transfer = result.rows[0];
        if (transfer === undefined)
          throw new OrganizationManagementError("ownership_transfer_unavailable");
        await tx.query(
          `SELECT debugbundle_assert_project_scope_write(id) FROM projects
          WHERE organization_id=$1::uuid AND id=debugbundle_canonical_project(id) ORDER BY id`,
          [org]
        );
        await tx.query(
          "UPDATE organization_members SET role='member',project_access='selected',default_project_role='member',grants_paused_at=NULL WHERE organization_id=$1::uuid AND user_id=$2::uuid",
          [org, transfer.requested_by_user_id]
        );
        await tx.query(
          "UPDATE organization_members SET role='owner',project_access='all',grants_paused_at=NULL WHERE organization_id=$1::uuid AND user_id=$2::uuid",
          [org, input.user_id]
        );
        await tx.query(
          "UPDATE organization_ownership_transfers SET accepted_at=$2::timestamptz WHERE id=$1::uuid",
          [transfer.id, input.now]
        );
        await tx.query("SELECT set_config('debugbundle.organization_owner_transfer',$1,true)", [
          transfer.id
        ]);
        await tx.query(
          "UPDATE projects SET owner_user_id=$2::uuid,updated_at=now() WHERE organization_id=$1::uuid AND owner_user_id=$3::uuid",
          [org, input.user_id, transfer.requested_by_user_id]
        );
        // The intent commits with ownership; no provider call holds these locks.
        await createWorkerJobStore(tx).enqueue("sync-billing-contact", {
          organization_id: org,
          transfer_id: transfer.id
        });
        // Personal token/session ownership is unchanged. Every subsequent request
        // resolves the new membership and physical project owner from the DB.
        return { organization_id: org };
      });
    }
  };
}
