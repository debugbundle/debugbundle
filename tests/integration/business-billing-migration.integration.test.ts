import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { restoreStoragePredecessor } from "../helpers/storage-predecessor.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { createPostgresBillingStore } from "../../packages/storage/src/billing-store.js";
import { BUSINESS_BILLING_MIGRATION } from "../../packages/storage/src/business-billing-schema.js";
import { createPostgresBillingSyncStore } from "../../packages/storage/src/billing-sync-store.js";
import { createPostgresBillingSubscriptionOperationStore } from "../../packages/storage/src/billing-subscription-operation-store.js";

runIntegration("Business billing forward migration", () => {
  const pool = createIntegrationPool();
  afterAll(async () => {
    await pool.end();
  });

  it("upgrades a populated immutable predecessor and preserves pending checkout", async () => {
    await restoreStoragePredecessor(pool);
    const user = randomUUID(),
      org = randomUUID(),
      attempt = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [user, `${user}@example.test`]);
    await pool.query("INSERT INTO organizations(id,name,slug,plan) VALUES($1,'Test',$2,'team')", [
      org,
      org
    ]);
    await pool.query(
      "INSERT INTO billing_checkout_attempts(organization_id,id,target_plan,parameters) VALUES($1,$2,'team',$3::jsonb)",
      [org, attempt, JSON.stringify({ immutable: "retained" })]
    );
    const db = createQueryable(pool);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    const migrated = await migrateStorageSchema(db);
    expect(migrated.applied).toContain(BUSINESS_BILLING_MIGRATION.id);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (
        await pool.query(
          "SELECT id,target_plan,parameters FROM billing_checkout_attempts WHERE organization_id=$1",
          [org]
        )
      ).rows[0]
    ).toEqual({ id: attempt, target_plan: "team", parameters: { immutable: "retained" } });
    const sync = createPostgresBillingSyncStore(db);
    await sync.updateEntitlements({
      organization_id: org,
      plan: "business",
      additional_capacity_units: 0,
      billing_state: "active",
      stripe_customer_id: "cus_business",
      stripe_subscription_id: "sub_business",
      billing_interval: "year",
      billing_allowance_anchor_at: "2026-01-31T00:00:00Z",
      billing_period_starts_at: "2026-01-31T00:00:00Z",
      billing_period_ends_at: "2027-01-31T00:00:00Z",
      last_billing_sync_at: "2026-01-31T00:00:00Z",
      last_billing_event_id: "evt_business"
    });
    await pool.query(
      "UPDATE billing_checkout_attempts SET target_plan='business' WHERE organization_id=$1",
      [org]
    );
    const summary = await createPostgresBillingStore(db).getBillingSummaryForOrganization({
      organization_id: org,
      now: "2026-02-28T00:00:00.000Z"
    });
    expect(summary).toMatchObject({
      plan: "business",
      capacity_units: { included: 30, total: 30 },
      usage_window: { starts_at: "2026-02-28T00:00:00.000Z", ends_at: "2026-03-31T00:00:00.000Z" }
    });
    const administrator = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [
      administrator,
      `${administrator}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), org, administrator]
    );
    const change = {
      organization_id: org,
      additional_capacity_units: 0,
      billing_state: "active",
      stripe_customer_id: "cus_business",
      stripe_subscription_id: "sub_business",
      billing_interval: "year" as const,
      billing_allowance_anchor_at: "2026-02-28T00:00:00Z",
      billing_period_starts_at: "2026-01-31T00:00:00Z",
      billing_period_ends_at: "2027-01-31T00:00:00Z",
      last_billing_sync_at: "2026-02-28T00:00:00Z"
    };
    await sync.updateEntitlements({
      ...change,
      plan: "team",
      last_billing_event_id: "evt_downgrade"
    });
    await sync.updateEntitlements({
      ...change,
      plan: "business",
      last_billing_event_id: "evt_reupgrade"
    });
    expect(
      (
        await pool.query(
          "SELECT grants_paused_at IS NOT NULL AS paused FROM organization_members WHERE organization_id=$1 AND user_id=$2",
          [org, administrator]
        )
      ).rows[0]
    ).toEqual({ paused: true });
    const preserved = await createPostgresBillingStore(db).getBillingSummaryForOrganization({
      organization_id: org,
      now: "2026-03-31T00:00:00.000Z"
    });
    expect(preserved?.usage_window).toEqual({
      starts_at: "2026-03-31T00:00:00.000Z",
      ends_at: "2026-04-30T00:00:00.000Z"
    });
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), org, user]
    );
    const operations = createPostgresBillingSubscriptionOperationStore(db);
    expect(
      await operations.claim({
        organization_id: org,
        kind: "upgrade",
        intent: { target: "business" },
        expected_owner_user_id: administrator
      })
    ).toBe("no_active_subscription");
    const operation = await operations.claim({
      organization_id: org,
      kind: "upgrade",
      intent: { target: "business" },
      expected_owner_user_id: user
    });
    if (typeof operation === "string") throw new Error("operation_missing");
    expect(
      await operations.prepare(org, operation.id, { immutable: true }, administrator)
    ).toBeNull();
    expect((await operations.get(org))?.parameters).toBeNull();
    expect(await operations.prepare(org, operation.id, { immutable: true }, user)).toMatchObject({
      parameters: { immutable: true }
    });
    const transfer = await pool.connect();
    let waitingClaim: ReturnType<typeof operations.claim> | undefined;
    try {
      await transfer.query("BEGIN");
      await transfer.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [org]);
      const pid = (await transfer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!
        .pid;
      waitingClaim = operations.claim({
        organization_id: org,
        kind: "upgrade",
        intent: { target: "business" },
        expected_owner_user_id: user
      });
      let blocked = false;
      const deadline = Date.now() + 3000;
      while (!blocked && Date.now() < deadline) {
        blocked = (
          await pool.query<{ blocked: boolean }>(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))) AS blocked",
            [pid]
          )
        ).rows[0]!.blocked;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await transfer.query(
        "UPDATE organization_members SET role='member' WHERE organization_id=$1 AND user_id=$2",
        [org, user]
      );
      await transfer.query(
        "UPDATE organization_members SET role='owner',grants_paused_at=NULL WHERE organization_id=$1 AND user_id=$2",
        [org, administrator]
      );
      await transfer.query("COMMIT");
      expect(await waitingClaim).toBe("no_active_subscription");
      expect((await operations.get(org))?.parameters).toEqual({ immutable: true });
    } finally {
      await transfer.query("ROLLBACK");
      transfer.release();
      await waitingClaim;
    }
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
  });
});
