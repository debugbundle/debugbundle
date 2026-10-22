import { randomUUID } from "node:crypto";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export type BillingSubscriptionOperationKind =
  | "upgrade"
  | "capacity_increase"
  | "capacity_schedule"
  | "capacity_cancel"
  | "plan_schedule"
  | "plan_cancel";
export interface BillingSubscriptionOperation {
  id: string;
  organization_id: string;
  subscription_id: string;
  customer_id: string;
  kind: BillingSubscriptionOperationKind;
  intent: Record<string, unknown>;
  parameters: Record<string, unknown> | null;
  resource_id: string | null;
  created_at: string;
  completed_at: string | null;
}
export interface BillingSubscriptionOperationStore {
  get(organizationId: string): Promise<BillingSubscriptionOperation | null>;
  claim(input: {
    organization_id: string;
    kind: BillingSubscriptionOperationKind;
    intent: Record<string, unknown>;
    expected_operation_id?: string | null;
  }): Promise<
    BillingSubscriptionOperation | "billing_change_in_progress" | "no_active_subscription"
  >;
  prepare(
    organizationId: string,
    attemptId: string,
    parameters: Record<string, unknown>
  ): Promise<BillingSubscriptionOperation | null>;
  saveResource(organizationId: string, attemptId: string, resourceId: string): Promise<boolean>;
  complete(organizationId: string, attemptId: string): Promise<boolean>;
  abandonUnprepared(organizationId: string, attemptId: string): Promise<boolean>;
  retireVoidedPayment(
    organizationId: string,
    attemptId: string,
    invoiceId: string
  ): Promise<boolean>;
}

const fields =
  "op.id, op.organization_id, op.subscription_id, op.customer_id, op.kind, op.intent, op.parameters, op.resource_id, op.created_at::text AS created_at, op.completed_at::text AS completed_at";

// One pending mutation per account, across API processes and restarts. A lost
// provider response never releases a prepared operation or changes its identity.
export function createPostgresBillingSubscriptionOperationStore(
  db: Queryable
): BillingSubscriptionOperationStore {
  return {
    async get(organizationId) {
      return (
        (
          await db.query<BillingSubscriptionOperation & Record<string, unknown>>(
            `SELECT ${fields} FROM billing_subscription_operations op WHERE organization_id=$1`,
            [organizationId]
          )
        ).rows[0] ?? null
      );
    },
    claim: (input) =>
      runInTransaction(db, async (tx) => {
        const org = (
          await tx.query<{
            stripe_customer_id: string | null;
            stripe_subscription_id: string | null;
            billing_state: string | null;
            suspended_at: string | null;
          }>(
            "SELECT stripe_customer_id,stripe_subscription_id,billing_state,suspended_at FROM organizations WHERE id=$1 FOR UPDATE",
            [input.organization_id]
          )
        ).rows[0];
        if (
          !org ||
          org.suspended_at !== null ||
          !org.stripe_customer_id ||
          !org.stripe_subscription_id ||
          org.billing_state === "canceled"
        )
          return "no_active_subscription";
        const current = (
          await tx.query<BillingSubscriptionOperation & Record<string, unknown>>(
            `SELECT ${fields} FROM billing_subscription_operations op WHERE organization_id=$1`,
            [input.organization_id]
          )
        ).rows[0];
        if (current) {
          const same =
            current.subscription_id === org.stripe_subscription_id &&
            current.kind === input.kind &&
            JSON.stringify(Object.entries(current.intent).sort()) ===
              JSON.stringify(Object.entries(input.intent).sort());
          if (same && current.completed_at === null) return current;
          if (current.completed_at === null) return "billing_change_in_progress";
        }
        // Bind new confirmations to the revision they previewed while holding
        // the account lock. Identical pending retries above retain their identity.
        if (
          input.expected_operation_id !== undefined &&
          input.expected_operation_id !== (current?.id ?? null)
        )
          return "billing_change_in_progress";
        if (current) {
          await tx.query(
            "DELETE FROM billing_subscription_operations WHERE organization_id=$1 AND id=$2",
            [input.organization_id, current.id]
          );
        }
        const id = randomUUID();
        return (
          await tx.query<BillingSubscriptionOperation & Record<string, unknown>>(
            `INSERT INTO billing_subscription_operations AS op (organization_id,id,subscription_id,customer_id,kind,intent) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING ${fields}`,
            [
              input.organization_id,
              id,
              org.stripe_subscription_id,
              org.stripe_customer_id,
              input.kind,
              JSON.stringify(input.intent)
            ]
          )
        ).rows[0]!;
      }),
    async prepare(organizationId, attemptId, parameters) {
      return (
        (
          await db.query<BillingSubscriptionOperation & Record<string, unknown>>(
            `UPDATE billing_subscription_operations AS op SET parameters=COALESCE(op.parameters,$3::jsonb)
         FROM organizations org WHERE op.organization_id=$1 AND op.id=$2 AND op.completed_at IS NULL
         AND org.id=op.organization_id AND org.suspended_at IS NULL AND org.stripe_subscription_id=op.subscription_id
         RETURNING ${fields}`,
            [organizationId, attemptId, JSON.stringify(parameters)]
          )
        ).rows[0] ?? null
      );
    },
    async saveResource(organizationId, attemptId, resourceId) {
      return (
        (
          await db.query(
            "UPDATE billing_subscription_operations SET resource_id=$3 WHERE organization_id=$1 AND id=$2 AND (resource_id IS NULL OR resource_id=$3) RETURNING id",
            [organizationId, attemptId, resourceId]
          )
        ).rows.length === 1
      );
    },
    async complete(organizationId, attemptId) {
      return (
        (
          await db.query(
            "UPDATE billing_subscription_operations SET completed_at=COALESCE(completed_at,now()) WHERE organization_id=$1 AND id=$2 RETURNING id",
            [organizationId, attemptId]
          )
        ).rows.length === 1
      );
    },
    async abandonUnprepared(organizationId, attemptId) {
      return (
        (
          await db.query(
            "UPDATE billing_subscription_operations SET completed_at=COALESCE(completed_at,now()) WHERE organization_id=$1 AND id=$2 AND parameters IS NULL AND resource_id IS NULL RETURNING id",
            [organizationId, attemptId]
          )
        ).rows.length === 1
      );
    },
    async retireVoidedPayment(organizationId, attemptId, invoiceId) {
      return (
        (
          await db.query(
            "UPDATE billing_subscription_operations SET completed_at=now() WHERE organization_id=$1 AND id=$2 AND kind IN ('upgrade','capacity_increase') AND resource_id=$3 AND completed_at IS NULL RETURNING id",
            [organizationId, attemptId, invoiceId]
          )
        ).rows.length === 1
      );
    }
  };
}
