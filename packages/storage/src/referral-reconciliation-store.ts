import { createHmac } from "node:crypto";
import { z } from "zod";
import {
  ReferralCustomerBindingSchema,
  ReferralReconciliationEventSchema,
  ReferralReconciliationRecordSchema,
  type ReferralCustomerBinding,
  type ReferralReconciliationEvent,
  type ReferralReconciliationRecord
} from "../../referrals/src/referral-reconciliation.js";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
import { createSavepointQueryable } from "./savepoint-queryable.js";
import { createWorkerJobStore } from "./worker-job-store.js";

const eventId = z.string().min(1).max(255);
const columns = `event_id,event_type,resource_type,resource_id,provider_customer_id,organization_external_id,owner_identity_hash,livemode,provider_created_at::text,status`;
function record(row: Record<string, unknown>): ReferralReconciliationRecord {
  return ReferralReconciliationRecordSchema.parse({
    ...row,
    provider_created_at: new Date(String(row["provider_created_at"])).toISOString()
  });
}
export interface ReferralReconciliationStore {
  capture(event: ReferralReconciliationEvent): Promise<void>;
  get(id: string): Promise<ReferralReconciliationRecord | null>;
  resolveCustomer(
    customerId: string,
    verifiedOrganizationId?: string
  ): Promise<ReferralCustomerBinding | null>;
  bind(id: string, customer: ReferralCustomerBinding): Promise<void>;
  complete(id: string): Promise<void>;
  dispatchNext(): Promise<boolean>;
}

export async function bindReferralReconciliationCustomer(
  tx: Queryable,
  id: string,
  customer: ReferralCustomerBinding
): Promise<void> {
  eventId.parse(id);
  customer = ReferralCustomerBindingSchema.parse(customer);
  const result = await tx.query(
    `UPDATE referral_reconciliation_events SET provider_customer_id=$2,organization_external_id=$3,owner_identity_hash=$4
      WHERE event_id=$1 AND status='pending' AND (provider_customer_id IS NULL OR provider_customer_id=$2)
        AND (organization_external_id IS NULL OR (organization_external_id=$3 AND owner_identity_hash=$4)) RETURNING event_id`,
    [
      id,
      customer.provider_customer_id,
      customer.organization_external_id,
      customer.owner_identity_hash
    ]
  );
  if (result.rows.length !== 1) throw new Error("referral_customer_binding_conflict");
}
export async function completeReferralReconciliationEvent(
  db: Queryable,
  id: string
): Promise<void> {
  eventId.parse(id);
  await db.query(
    `UPDATE referral_reconciliation_events SET status='completed',completed_at=now() WHERE event_id=$1 AND status='pending'`,
    [id]
  );
}

/** The outbox is the retained financial source; worker_jobs only supplies its
 * existing execution leases/retries. No raw webhook or plaintext email is saved.
 * Capture, identity freezing and the first job insert commit together. */
export function createReferralReconciliationStore(
  db: Queryable,
  options: { identityHashSecret?: string }
): ReferralReconciliationStore {
  const secret =
    options.identityHashSecret === undefined
      ? null
      : z.string().min(32).max(4096).parse(options.identityHashSecret);
  const hash = (email: string): string => {
    if (secret === null) throw new Error("referral_identity_configuration_missing");
    return createHmac("sha256", secret)
      .update(`referral-customer:v1:${email.trim().toLowerCase()}`)
      .digest("hex");
  };
  async function resolveCustomer(
    tx: Queryable,
    customerId: string,
    verifiedOrganizationId?: string
  ): Promise<ReferralCustomerBinding | null> {
    z.string().min(1).max(255).parse(customerId);
    if (verifiedOrganizationId !== undefined) z.uuid().parse(verifiedOrganizationId);
    const retained = (
      await tx.query<{ organization_external_id: string; owner_identity_hash: string }>(
        `SELECT DISTINCT organization_external_id,owner_identity_hash FROM referral_reconciliation_events WHERE provider_customer_id=$1 AND organization_external_id IS NOT NULL LIMIT 2`,
        [customerId]
      )
    ).rows;
    const live = (
      await tx.query<{
        organization_external_id: string;
        owner_identity_hash: string | null;
        email: string | null;
      }>(
        `SELECT o.id AS organization_external_id,a.owner_identity_hash,u.email FROM organizations o
       LEFT JOIN referral_attributions a ON a.organization_external_id=o.id
       LEFT JOIN organization_members m ON m.organization_id=o.id AND m.role='owner'
       LEFT JOIN users u ON u.id=m.user_id
       WHERE o.stripe_customer_id=$1 LIMIT 2`,
        [customerId]
      )
    ).rows;
    if (
      retained.length > 1 ||
      live.length > 1 ||
      (retained[0] &&
        live[0] &&
        retained[0].organization_external_id !== live[0].organization_external_id)
    )
      throw new Error("referral_customer_binding_conflict");
    const previous = retained[0],
      current = live[0];
    if (
      verifiedOrganizationId !== undefined &&
      ((previous && previous.organization_external_id !== verifiedOrganizationId) ||
        (current && current.organization_external_id !== verifiedOrganizationId))
    )
      throw new Error("referral_customer_binding_conflict");
    if (previous)
      return ReferralCustomerBindingSchema.parse({ provider_customer_id: customerId, ...previous });
    if (!current && verifiedOrganizationId !== undefined) {
      const fallback = (
        await tx.query<{
          organization_external_id: string;
          owner_identity_hash: string | null;
          email: string | null;
        }>(
          `SELECT $2::uuid AS organization_external_id,COALESCE(a.owner_identity_hash,h.owner_identity_hash) AS owner_identity_hash,u.email
        FROM (SELECT 1) seed LEFT JOIN organizations o ON o.id=$2::uuid
        LEFT JOIN referral_attributions a ON a.organization_external_id=$2::uuid
        LEFT JOIN billing_customer_history h ON h.organization_external_id=$2::uuid
        LEFT JOIN organization_members m ON m.organization_id=o.id AND m.role='owner'
        LEFT JOIN users u ON u.id=m.user_id
        WHERE (o.id IS NOT NULL OR a.id IS NOT NULL OR h.organization_external_id IS NOT NULL)
          AND (o.stripe_customer_id IS NULL OR o.stripe_customer_id=$1) LIMIT 2`,
          [customerId, verifiedOrganizationId]
        )
      ).rows;
      if (fallback.length > 1) throw new Error("referral_customer_binding_conflict");
      const candidate = fallback[0];
      if (candidate && (candidate.owner_identity_hash || (candidate.email && secret !== null)))
        return ReferralCustomerBindingSchema.parse({
          provider_customer_id: customerId,
          organization_external_id: candidate.organization_external_id,
          owner_identity_hash: candidate.owner_identity_hash ?? hash(candidate.email!)
        });
    }
    if (!current || (!current.owner_identity_hash && (!current.email || secret === null)))
      return null;
    return ReferralCustomerBindingSchema.parse({
      provider_customer_id: customerId,
      organization_external_id: current.organization_external_id,
      owner_identity_hash: current.owner_identity_hash ?? hash(current.email!)
    });
  }
  async function dispatch(tx: Queryable, id: string, generation: number): Promise<void> {
    const job = await createWorkerJobStore(tx).enqueue(
      "reconcile-referral-receipts",
      { event_id: id },
      { dedupeKey: `${id}:${generation}` }
    );
    await tx.query(
      `UPDATE referral_reconciliation_events SET worker_job_id=$2,dispatch_generation=$3,next_dispatch_at=now()+interval '15 minutes' WHERE event_id=$1`,
      [id, job, generation]
    );
  }
  return {
    async capture(raw) {
      const input = ReferralReconciliationEventSchema.parse(raw);
      await runInTransaction(db, async (connection) => {
        const tx = createSavepointQueryable(connection);
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('referral-financial-admission',0))",
          []
        );
        if (secret === null) {
          const history = await tx.query<{ retained: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM referral_attributions) OR EXISTS(SELECT 1 FROM referral_commission_ledger) AS retained`,
            []
          );
          if (history.rows[0]?.retained !== true) return;
        }
        const inserted = await tx.query(
          `INSERT INTO referral_reconciliation_events(event_id,event_type,resource_type,resource_id,provider_customer_id,livemode,provider_created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
          [
            input.event_id,
            input.event_type,
            input.resource_type,
            input.resource_id,
            input.provider_customer_id,
            input.livemode,
            input.provider_created_at
          ]
        );
        const row = (
          await tx.query<Record<string, unknown>>(
            `SELECT ${columns} FROM referral_reconciliation_events WHERE event_id=$1 FOR UPDATE`,
            [input.event_id]
          )
        ).rows[0]!;
        const previous = record(row);
        if (
          previous.event_type !== input.event_type ||
          previous.resource_type !== input.resource_type ||
          previous.resource_id !== input.resource_id ||
          previous.livemode !== input.livemode ||
          previous.provider_created_at !== input.provider_created_at ||
          (input.provider_customer_id !== null &&
            previous.provider_customer_id !== input.provider_customer_id)
        )
          throw new Error("referral_event_identity_conflict");
        if (previous.status === "completed") return;
        if (input.provider_customer_id) {
          const customer = await resolveCustomer(tx, input.provider_customer_id);
          if (customer) await bindReferralReconciliationCustomer(tx, input.event_id, customer);
        }
        if (inserted.rows.length) await dispatch(tx, input.event_id, 0);
      });
    },
    async get(id) {
      eventId.parse(id);
      const row = (
        await db.query<Record<string, unknown>>(
          `SELECT ${columns} FROM referral_reconciliation_events WHERE event_id=$1`,
          [id]
        )
      ).rows[0];
      return row ? record(row) : null;
    },
    resolveCustomer: (customerId, verifiedOrganizationId) =>
      resolveCustomer(db, customerId, verifiedOrganizationId),
    async bind(id, raw) {
      eventId.parse(id);
      await bindReferralReconciliationCustomer(db, id, raw);
    },
    complete: (id) => completeReferralReconciliationEvent(db, id),
    async dispatchNext() {
      return runInTransaction(db, async (connection) => {
        const tx = createSavepointQueryable(connection);
        const row = (
          await tx.query<{ event_id: string; dispatch_generation: number }>(
            `SELECT e.event_id,e.dispatch_generation FROM referral_reconciliation_events e
          LEFT JOIN worker_jobs j ON j.id=e.worker_job_id
          WHERE e.status='pending' AND (j.id IS NULL OR (e.next_dispatch_at<=now() AND (j.status IN ('completed','skipped','failed') OR j.expires_at<=now())))
          ORDER BY e.next_dispatch_at,e.event_id FOR UPDATE OF e SKIP LOCKED LIMIT 1`,
            []
          )
        ).rows[0];
        if (!row) return false;
        await dispatch(tx, row.event_id, row.dispatch_generation + 1);
        return true;
      });
    }
  };
}
