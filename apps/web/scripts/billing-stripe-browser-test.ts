import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import Stripe from "stripe";
import { createServer as createViteServer } from "vite";
import { createApiServer } from "../../api/src/server.js";
import { createBillingManagement } from "../../api/src/billing-management.js";
import { createStripeConfig } from "../../api/src/stripe-config.js";
import { createBillingWebhookTransaction } from "../../../packages/billing/src/stripe-webhook-transaction.js";
import { createPostgresBillingSubscriptionOperationStore } from "../../../packages/storage/src/billing-subscription-operation-store.js";
import { hashToken, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import {
  createPostgresAuthStore,
  createPostgresBillingStore,
  createPostgresBillingSyncStore,
  type Queryable
} from "../../../packages/storage/src/index.js";
import { bootstrapStorageSchema } from "../../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../../packages/storage/src/schema-migrations.js";

// Explicitly invoked, isolated provider/browser proof. Billing routes, domain,
// stores, migrations, CSRF and the dashboard are real; unrelated services fail
// closed. Only the synthetic session is issued by this test fixture.
assert.equal(process.env["RUN_STRIPE_TEST"], "1");
assert.equal(process.env["DB_HOST"], "postgres");
const key = process.env["STRIPE_TEST_KEY"] ?? "";
assert.match(key, /^(sk|rk)_test_/);
const webhookSecret = process.env["STRIPE_TEST_WEBHOOK_SECRET"] ?? "";
assert.match(webhookSecret, /^whsec_/);
const client = new Stripe(key, { apiVersion: "2026-02-25.clover", timeout: 15000 });
const run = randomUUID();
const receipt = {
  run,
  organization_id: null as string | null,
  started_at: new Date().toISOString(),
  checks: [] as string[],
  objects: [] as { type: string; id: string }[],
  cleanup_errors: [] as string[],
  error: null as string | null
};
const save = (): void =>
  writeFileSync(
    `.local-notes/stripe-browser-${run}.json`,
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 }
  );
const record = <T extends { id: string; livemode?: boolean }>(type: string, value: T): T => {
  assert.notEqual(value.livemode, true);
  receipt.objects.push({ type, id: value.id });
  save();
  return value;
};
const check = (name: string): void => {
  receipt.checks.push(name);
  save();
  console.log(`PASS ${name}`);
};
const request = (label: string): { idempotencyKey: string } => ({
  idempotencyKey: `debugbundle-browser-test:${run}:${label}`
});
const pool = new Pool({
  host: "postgres",
  user: "debugbundle",
  password: "debugbundle",
  database: "debugbundle"
});
const db: Queryable = {
  query: (sql, params) => pool.query(sql, params),
  async transaction(callback) {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await callback({ query: (sql, params) => connection.query(sql, params) });
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
};
let app: ReturnType<typeof createApiServer> | undefined;
let web: Awaited<ReturnType<typeof createViteServer>> | undefined;
let customerId: string | undefined;
const appBaseUrl = "http://billing-test.localhost:5297";
process.env["APP_BASE_URL"] = appBaseUrl;
let interrupted = false;
process.once("SIGTERM", () => {
  interrupted = true;
});
process.once("SIGINT", () => {
  interrupted = true;
});
async function discoverCheckoutCustomer(): Promise<void> {
  if (!receipt.organization_id) return;
  const row = (
    await pool.query<{ stripe_session_id: string | null }>(
      "SELECT stripe_session_id FROM billing_checkout_attempts WHERE organization_id=$1",
      [receipt.organization_id]
    )
  ).rows[0];
  if (!row?.stripe_session_id) return;
  const session = await client.checkout.sessions.retrieve(row.stripe_session_id);
  assert.equal(session.livemode, false);
  assert.equal(session.client_reference_id, receipt.organization_id);
  if (!receipt.objects.some((object) => object.id === session.id))
    record("checkout_session", session);
  if (typeof session.customer === "string") {
    const customer = await client.customers.retrieve(session.customer);
    assert.equal(customer.deleted, undefined);
    if (customer.deleted) throw new Error("Synthetic Checkout customer unexpectedly deleted");
    assert.equal(customer.livemode, false);
    customerId = customer.id;
    if (!receipt.objects.some((object) => object.id === customer.id)) record("customer", customer);
  }
}
try {
  assert.equal((await client.accounts.retrieve(null)).id, process.env["STRIPE_TEST_ACCOUNT"]);
  assert.equal((await client.balance.retrieve()).livemode, false);
  assert.equal(
    (
      await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM pg_tables WHERE schemaname='public'"
      )
    ).rows[0]?.count,
    0
  );
  await bootstrapStorageSchema(db);
  await migrateStorageSchema(db);
  check("Test account and empty disposable database verified; all forward migrations applied");
  const auth = createPostgresAuthStore(db);
  const now = new Date().toISOString();
  const account = await auth.createUserAccount({
    email: "billing-browser@debugbundle.invalid",
    organization_name: "Synthetic billing test",
    organization_slug: run,
    accepted_terms_at: now,
    created_at: now
  });
  assert.ok(account);
  receipt.organization_id = account.organization_id;
  save();
  await auth.markUserEmailVerified({ user_id: account.user_id, verified_at: now });
  const token = randomUUID();
  await auth.createSession({
    user_id: account.user_id,
    organization_id: account.organization_id,
    session_token_hash: hashToken(token),
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    auth_method: "email_code"
  });
  const metadata = { debugbundle_billing_test: run, organization_id: account.organization_id };
  const product = record(
    "product",
    await client.products.create(
      { name: "DebugBundle local browser test", metadata },
      request("product")
    )
  );
  const prices: Record<string, string> = {};
  for (const [name, unit_amount] of [
    ["solo", 499],
    ["team", 1900],
    ["solo_extra", 99],
    ["team_extra", 199]
  ] as const)
    prices[name] = record(
      "price",
      await client.prices.create(
        {
          product: product.id,
          currency: "usd",
          unit_amount,
          recurring: { interval: "month" },
          tax_behavior: "exclusive",
          metadata
        },
        request(name)
      )
    ).id;
  const provider = createStripeConfig({
    STRIPE_SECRET_KEY: key,
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    STRIPE_SOLO_PRICE_ID: prices["solo"],
    STRIPE_TEAM_PRICE_ID: prices["team"],
    STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID: prices["solo_extra"],
    STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID: prices["team_extra"]
  });
  assert.ok(provider);
  const billingStore = createPostgresBillingStore(db);
  const billingSyncStore = createPostgresBillingSyncStore(db);
  const { billingManagement } = createBillingManagement({
    db,
    stripeConfig: provider,
    billingStore,
    billingSyncStore,
    billingLinks: { createCheckoutUrl: () => null, createPortalUrl: () => null },
    appBaseUrl
  });
  assert.equal(
    await billingManagement.createCheckoutLink({
      organization_id: account.organization_id,
      billing_email: "billing-browser@debugbundle.invalid",
      current_plan: "free",
      target_plan: "solo"
    }),
    "paid_purchase_locked"
  );
  // Only this disposable database is aged. Application admission has no test bypass.
  await billingStore.startTrialForOrganization({
    organization_id: account.organization_id,
    target_plan: "solo",
    started_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    ends_at: new Date(Date.now() + 22 * 86400000).toISOString()
  });
  check("First purchase is locked before trial; disposable trial fixture is aged eight days");
  const unavailable = (): Promise<never> =>
    Promise.reject(new Error("unrelated_test_service_unavailable"));
  let checkoutReturned = false;
  let teamSeen = false;
  app = createApiServer(
    {
      ingestionPersistence: { persistAndEnqueue: unavailable },
      ingestionMetadata: { resolveProjectByTokenHash: unavailable },
      memberAuth: { resolveMemberByTokenHash: () => Promise.resolve(null) },
      webAuth: {
        requestEmailCode: unavailable,
        verifyEmailCode: unavailable,
        beginGithubAuth: unavailable,
        completeGithubAuth: unavailable,
        acceptInviteForSession: unavailable,
        revokeSessionByToken: unavailable,
        resolveSessionByToken: (value) => auth.resolveSessionByTokenHash(hashToken(value))
      },
      tokenManagement: {
        listProjectTokensForOrganization: unavailable,
        createProjectTokenForOrganization: unavailable,
        revokeProjectTokenForOrganization: unavailable,
        listMemberTokensForOrganization: unavailable,
        createMemberTokenForOrganization: unavailable,
        revokeMemberTokenForOrganization: unavailable
      },
      incidentRetrieval: {
        listIncidentsForOrganization: unavailable,
        getIncidentForOrganization: unavailable,
        listIncidentLogsForOrganization: unavailable,
        listServicesForOrganization: unavailable
      },
      objectStoreReader: { getObject: unavailable },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: unavailable,
        retryDeliveryForOrganization: unavailable
      },
      billingManagement
    },
    {
      dogfoodingEnv: {},
      stripeWebhook: {
        stripeConfig: provider,
        billingSyncStore,
        billingSummaryReader: billingStore,
        eventTransaction: createBillingWebhookTransaction(db),
        subscriptionOperationStore: createPostgresBillingSubscriptionOperationStore(db)
      }
    }
  );
  app.get(`/v1/local-billing-fixture/${token}`, (_request, reply) =>
    reply
      .header(
        "set-cookie",
        `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`
      )
      .redirect("/billing")
  );
  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode === 200 && typeof payload === "string") {
      if (request.url.startsWith("/v1/billing/checkout/confirm")) checkoutReturned = true;
      const body = JSON.parse(payload) as { billing?: { plan: string } };
      if (request.url === "/v1/billing" && body.billing?.plan === "team") teamSeen = true;
    }
    return payload;
  });
  await app.listen({ port: 3297, host: "0.0.0.0" });
  process.env["VITE_DEV_API_PROXY_TARGET"] = "http://127.0.0.1:3297";
  process.env["VITE_API_URL"] = "";
  web = await createViteServer({
    root: "apps/web",
    configFile: "apps/web/vite.config.ts",
    define: {
      "import.meta.env.VITE_DEBUGBUNDLE_DOGFOOD_ENABLED": "false",
      "import.meta.env.VITE_DEBUGBUNDLE_DOGFOOD_ANALYTICS_ENABLED": "false"
    },
    server: { port: 5297, strictPort: true }
  });
  await web.listen();
  writeFileSync(
    ".local-notes/stripe-browser-entry.txt",
    `${appBaseUrl}/v1/local-billing-fixture/${token}\n`,
    { mode: 0o600 }
  );
  console.log(
    "READY local dashboard at billing-test.localhost:5297; private fixture entry saved. Complete Solo Checkout in the browser."
  );
  const waitUntil = async (predicate: () => Promise<boolean>, label: string): Promise<void> => {
    const deadline = Date.now() + 12 * 60_000;
    while (Date.now() < deadline) {
      if (interrupted) throw new Error("Browser test interrupted; cleaning its fixtures");
      if (await predicate()) return;
      await delay(1000);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  await waitUntil(async () => {
    const row = (
      await pool.query<{ plan: string; billing_state: string }>(
        "SELECT plan,billing_state,stripe_subscription_id FROM organizations WHERE id=$1",
        [account.organization_id]
      )
    ).rows[0];
    return row?.plan === "solo" && row?.billing_state === "active" && checkoutReturned;
  }, "paid Checkout and application return");
  await discoverCheckoutCustomer();
  assert.ok(customerId);
  const subs = (
    await client.subscriptions.list({ customer: customerId, status: "all", limit: 100 })
  ).data;
  assert.equal(subs.length, 1);
  const subscription = record("subscription", subs[0]!);
  assert.equal(subscription.metadata["organization_id"], account.organization_id);
  const sessions = (await client.checkout.sessions.list({ customer: customerId, limit: 100 })).data;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.payment_status, "paid");
  assert.equal(sessions[0]?.status, "complete");
  check(
    "One hosted Checkout paid; same application return confirmed and PostgreSQL Solo entitlement active"
  );
  const failureCard = await client.paymentMethods.attach(
    "pm_card_authenticationRequired",
    { customer: customerId },
    request("auth-card")
  );
  await client.subscriptions.update(
    subscription.id,
    { default_payment_method: failureCard.id },
    request("auth-method")
  );
  console.log(
    "READY upgrade authentication scenario. Upgrade to Team in the existing dashboard, then use the separate payment tab and return to Billing."
  );
  await waitUntil(() => Promise.resolve(teamSeen), "Team payment and billing focus refresh");
  const current = await client.subscriptions.retrieve(subscription.id, {
    expand: ["latest_invoice"]
  });
  assert.ok(current.items.data.some((item) => item.price.id === prices["team"]));
  assert.equal((current.latest_invoice as Stripe.Invoice).status, "paid");
  assert.equal(
    (await client.subscriptions.list({ customer: customerId, status: "all", limit: 100 })).data
      .length,
    1
  );
  await waitUntil(async () => {
    const events = (
      await pool.query<{ event_type: string }>(
        "SELECT event_type FROM processed_billing_events WHERE organization_id=$1",
        [account.organization_id]
      )
    ).rows;
    return (
      events.some((event) => event.event_type === "checkout.session.completed") &&
      events.some((event) => event.event_type === "invoice.paid")
    );
  }, "real signed Stripe webhook delivery");
  const stored = (
    await pool.query<{
      plan: string;
      billing_period_starts_at: Date;
      billing_period_ends_at: Date;
    }>(
      "SELECT plan,billing_period_starts_at,billing_period_ends_at FROM organizations WHERE id=$1",
      [account.organization_id]
    )
  ).rows[0];
  assert.ok(stored);
  assert.equal(stored.plan, "team");
  assert.ok(stored.billing_period_ends_at.getTime() > stored.billing_period_starts_at.getTime());
  check(
    "Same-subscription authenticated upgrade paid; actual dashboard focus refresh, signed CLI webhooks and valid PostgreSQL billing period verified"
  );
  await delay(15000);
} catch (error) {
  receipt.error = error instanceof Error ? error.message : "unknown_error";
  console.error(`FAIL ${receipt.error}`);
  process.exitCode = 1;
  save();
} finally {
  await web?.close();
  await app?.close();
  // The exact reserved Checkout may create its own customer (including after
  // a no-card trial). Reconcile only that synthetic organization's session.
  try {
    await discoverCheckoutCustomer();
  } catch {
    receipt.cleanup_errors.push("synthetic_checkout_discovery");
  }
  if (customerId) {
    try {
      for (const sub of (
        await client.subscriptions.list({ customer: customerId, status: "all", limit: 100 })
      ).data) {
        assert.equal(sub.livemode, false);
        assert.equal(sub.customer, customerId);
        assert.equal(sub.metadata["organization_id"], receipt.organization_id);
        if (sub.status !== "canceled")
          await client.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });
      }
    } catch {
      receipt.cleanup_errors.push("synthetic_customer_subscriptions");
    }
  }
  for (const object of [...receipt.objects].reverse()) {
    try {
      if (object.type === "customer") await client.customers.del(object.id);
      else if (object.type === "price") await client.prices.update(object.id, { active: false });
      else if (object.type === "product")
        await client.products.update(object.id, { active: false });
    } catch {
      receipt.cleanup_errors.push(`${object.type}:${object.id}`);
    }
  }
  await pool.end();
  save();
  if (receipt.cleanup_errors.length) process.exitCode = 1;
  console.log(
    `Browser test receipt saved; ${receipt.checks.length} checks, ${receipt.cleanup_errors.length} cleanup errors.`
  );
}
