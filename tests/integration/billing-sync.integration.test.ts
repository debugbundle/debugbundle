import { createHash, randomUUID } from "node:crypto";

import Stripe from "stripe";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { createApiDependencies, type BillingEmailService } from "../../apps/api/src/default-dependencies.ts";
import { createApiServer } from "../../apps/api/src/server.js";
import type { StripeConfig } from "../../apps/api/src/stripe-config.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../packages/auth/src/index.js";
import { createPostgresBillingSyncStore, type Queryable } from "../../packages/storage/src/index.js";
import {
  createIntegrationPool,
  createQueryable,
  createTestObjectStore,
  createTestQueue,
  createS3AdminClient,
  runIntegration,
  bootstrapStorageAndCreateBucket
} from "../helpers/integration-setup.ts";

type BillingEmailMessage = Parameters<BillingEmailService["send"]>[0];

runIntegration("billing integration – stripe sync", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("expands allowance capacity immediately after checkout webhook processing and keeps duplicate events harmless", async (): Promise<void> => {
    await resetBillingTables(pool);
    const csrfToken = buildCsrfToken("billing-session");

    const owner = await seedOrganization(pool, {
      plan: "free",
      additionalProjectSlots: 0,
      existingProjectCount: 1
    });
    const stripe = createStripeHarness();
    const emailSink = createBillingEmailSink({ recipientEmail: owner.email });
    const appContext = createBillingApp({
      db: createQueryable(pool),
      stripe,
      billingEmails: emailSink,
      owner
    });

    try {
      const beforeBilling = await appContext.app.inject({
        method: "GET",
        url: "/v1/billing",
        cookies: {
          [SESSION_COOKIE_NAME]: "billing-session"
        }
      });

      expect(beforeBilling.statusCode).toBe(200);
      expect(beforeBilling.json()).toMatchObject({
        billing: {
          plan: "free",
          capacity_units: {
            total: 1,
            additional_purchased: 0
          }
        }
      });

      const createdProjectAfterUpgrade = await appContext.app.inject({
        method: "POST",
        url: "/v1/projects",
        headers: {
          authorization: `Bearer ${owner.memberToken}`
        },
        payload: {
          name: "Blocked Project",
          slug: "blocked-project"
        }
      });

      expect(createdProjectAfterUpgrade.statusCode).toBe(201);
      expect(createdProjectAfterUpgrade.json()).toEqual(
        expect.objectContaining({
          project: expect.objectContaining({
            name: "Blocked Project",
            slug: "blocked-project"
          })
        })
      );

      stripe.checkoutCreate.mockResolvedValue({ url: "https://billing.stripe.test/checkout/team" });
      const checkout = await appContext.app.inject({
        method: "POST",
        url: "/v1/billing/checkout",
        cookies: {
          [SESSION_COOKIE_NAME]: "billing-session"
        },
        headers: {
          "x-csrf-token": csrfToken
        },
        payload: {
          target_plan: "team"
        }
      });

      expect(checkout.statusCode).toBe(200);
      expect(checkout.json()).toEqual({ url: "https://billing.stripe.test/checkout/team" });
      expect(stripe.checkoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          client_reference_id: owner.organizationId,
          metadata: { organization_id: owner.organizationId },
          line_items: [{ price: "price_team", quantity: 1 }]
        })
      );

      stripe.setNextWebhookEvent(
        buildStripeEvent("evt_checkout_complete", "checkout.session.completed", {
          client_reference_id: owner.organizationId,
          customer: "cus_checkout_123",
          subscription: "sub_checkout_123"
        })
      );
      stripe.subscriptionsRetrieve.mockResolvedValue({
        id: "sub_checkout_123",
        status: "active",
        customer: "cus_checkout_123",
        items: {
          data: [
            { price: { id: "price_team" }, quantity: 1 },
            { price: { id: "price_team_capacity" }, quantity: 2 }
          ]
        },
        latest_invoice: {
          period_end: Math.floor(new Date("2026-05-01T00:00:00.000Z").getTime() / 1000)
        },
        metadata: {}
      });

      const webhook = await appContext.app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_signature"
        },
        payload: Buffer.from("{}")
      });

      expect(webhook.statusCode).toBe(200);
      expect(webhook.json()).toEqual({ received: true });

      const duplicateWebhook = await appContext.app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_signature"
        },
        payload: Buffer.from("{}")
      });

      expect(duplicateWebhook.statusCode).toBe(200);
      expect(duplicateWebhook.json()).toEqual({ received: true, duplicate: true });

      const afterBilling = await appContext.app.inject({
        method: "GET",
        url: "/v1/billing",
        cookies: {
          [SESSION_COOKIE_NAME]: "billing-session"
        }
      });

      expect(afterBilling.statusCode).toBe(200);
      expect(afterBilling.json()).toMatchObject({
        billing: {
          plan: "team",
          stripe_customer_id: "cus_checkout_123",
          capacity_units: {
            total: 12,
            additional_purchased: 2
          }
        }
      });

      const createdProject = await appContext.app.inject({
        method: "POST",
        url: "/v1/projects",
        headers: {
          authorization: `Bearer ${owner.memberToken}`
        },
        payload: {
          name: "Unblocked Project",
          slug: "unblocked-project"
        }
      });

      expect(createdProject.statusCode).toBe(201);

      const organizationRow = await pool.query<{
        plan: string;
        additional_capacity_units: number;
        billing_state: string;
        stripe_customer_id: string;
        stripe_subscription_id: string;
      }>(
        `
          SELECT
            COALESCE(plan, 'free') AS plan,
            COALESCE(additional_capacity_units, 0)::int AS additional_capacity_units,
            COALESCE(billing_state, 'none') AS billing_state,
            stripe_customer_id,
            stripe_subscription_id
          FROM organizations
          WHERE id = $1
        `,
        [owner.organizationId]
      );

      expect(organizationRow.rows[0]).toMatchObject({
        plan: "team",
        additional_capacity_units: 2,
        billing_state: "active",
        stripe_customer_id: "cus_checkout_123",
        stripe_subscription_id: "sub_checkout_123"
      });

      const processedEvents = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM processed_billing_events WHERE event_id = $1`,
        ["evt_checkout_complete"]
      );
      expect(processedEvents.rows[0]?.count).toBe(1);

      expect(emailSink.messages).toHaveLength(1);
      expect(emailSink.messages[0]?.to).toEqual([owner.email]);
      expect(emailSink.messages[0]?.subject).toContain("activated");
    } finally {
      await appContext.close();
    }
  });

  it("reverts entitlements on subscription deletion and blocks new project creation again", async (): Promise<void> => {
    await resetBillingTables(pool);

    const owner = await seedOrganization(pool, {
      plan: "team",
      additionalProjectSlots: 2,
      existingProjectCount: 1,
      stripeCustomerId: "cus_cancel_123",
      stripeSubscriptionId: "sub_cancel_123",
      billingState: "active"
    });
    const stripe = createStripeHarness();
    const emailSink = createBillingEmailSink({ recipientEmail: owner.email });
    const appContext = createBillingApp({
      db: createQueryable(pool),
      stripe,
      billingEmails: emailSink,
      owner
    });

    try {
      const beforeBilling = await appContext.app.inject({
        method: "GET",
        url: "/v1/billing",
        cookies: {
          [SESSION_COOKIE_NAME]: "billing-session"
        }
      });

      expect(beforeBilling.statusCode).toBe(200);
      expect(beforeBilling.json()).toMatchObject({
        billing: {
          plan: "team",
          capacity_units: {
            total: 12,
            additional_purchased: 2
          }
        }
      });

      stripe.setNextWebhookEvent(
        buildStripeEvent("evt_subscription_deleted", "customer.subscription.deleted", {
          id: "sub_cancel_123",
          status: "canceled",
          customer: "cus_cancel_123",
          items: { data: [] },
          metadata: { organization_id: owner.organizationId }
        })
      );

      const webhook = await appContext.app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_signature"
        },
        payload: Buffer.from("{}")
      });

      expect(webhook.statusCode).toBe(200);

      const afterBilling = await appContext.app.inject({
        method: "GET",
        url: "/v1/billing",
        cookies: {
          [SESSION_COOKIE_NAME]: "billing-session"
        }
      });

      expect(afterBilling.statusCode).toBe(200);
      expect(afterBilling.json()).toMatchObject({
        billing: {
          plan: "free",
          capacity_units: {
            total: 1,
            additional_purchased: 0
          }
        }
      });

      const createdProject = await appContext.app.inject({
        method: "POST",
        url: "/v1/projects",
        headers: {
          authorization: `Bearer ${owner.memberToken}`
        },
        payload: {
          name: "Blocked Again",
          slug: "blocked-again"
        }
      });

      expect(createdProject.statusCode).toBe(201);
      expect(createdProject.json()).toEqual(
        expect.objectContaining({
          project: expect.objectContaining({
            name: "Blocked Again",
            slug: "blocked-again"
          })
        })
      );

      const organizationRow = await pool.query<{
        plan: string;
        additional_capacity_units: number;
        billing_state: string;
        stripe_subscription_id: string | null;
      }>(
        `
          SELECT
            COALESCE(plan, 'free') AS plan,
            COALESCE(additional_capacity_units, 0)::int AS additional_capacity_units,
            billing_state,
            stripe_subscription_id
          FROM organizations
          WHERE id = $1
        `,
        [owner.organizationId]
      );

      expect(organizationRow.rows[0]).toMatchObject({
        plan: "free",
        additional_capacity_units: 0,
        billing_state: "canceled",
        stripe_subscription_id: "sub_cancel_123"
      });

      expect(emailSink.messages).toHaveLength(1);
      expect(emailSink.messages[0]?.to).toEqual([owner.email]);
      expect(emailSink.messages[0]?.subject).toContain("reduced");
    } finally {
      await appContext.close();
    }
  });
});

async function resetBillingTables(pool: ReturnType<typeof createIntegrationPool>): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      processed_billing_events,
      member_tokens,
      organization_members,
      project_tokens,
      projects,
      users,
      organizations
    RESTART IDENTITY CASCADE
  `);
}

async function seedOrganization(
  pool: ReturnType<typeof createIntegrationPool>,
  input: {
    plan: "free" | "solo" | "team";
    additionalProjectSlots: number;
    existingProjectCount: number;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    billingState?: string;
  }
): Promise<{
  organizationId: string;
  userId: string;
  email: string;
  memberToken: string;
}> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberToken = `dbundle_mem_${randomUUID()}`;
  const memberTokenHash = createHash("sha256").update(memberToken, "utf8").digest("hex");
  const email = `owner-${organizationId.slice(0, 8)}@example.com`;

  await pool.query(
    `
      INSERT INTO organizations (
        id,
        name,
        slug,
        plan,
        additional_capacity_units,
        stripe_customer_id,
        stripe_subscription_id,
        billing_state
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      organizationId,
      "Billing Integration Org",
      `billing-integration-${organizationId.slice(0, 8)}`,
      input.plan,
      input.additionalProjectSlots,
      input.stripeCustomerId ?? null,
      input.stripeSubscriptionId ?? null,
      input.billingState ?? null
    ]
  );

  await pool.query(
    `INSERT INTO users (id, email) VALUES ($1, $2)`,
    [userId, email]
  );

  await pool.query(
    `
      INSERT INTO organization_members (id, organization_id, user_id, role)
      VALUES ($1, $2, $3, 'owner')
    `,
    [randomUUID(), organizationId, userId]
  );

  await pool.query(
    `
      INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [randomUUID(), userId, organizationId, memberTokenHash, "integration-owner-token"]
  );

  for (let index = 0; index < input.existingProjectCount; index += 1) {
    await pool.query(
      `
        INSERT INTO projects (id, organization_id, name, slug, environment_default)
        VALUES ($1, $2, $3, $4, 'production')
      `,
      [
        randomUUID(),
        organizationId,
        `Existing Project ${index + 1}`,
        `existing-project-${index + 1}-${organizationId.slice(0, 8)}`
      ]
    );
  }

  return {
    organizationId,
    userId,
    email,
    memberToken
  };
}

function createStripeHarness(): {
  stripeConfig: StripeConfig;
  checkoutCreate: ReturnType<typeof vi.fn>;
  subscriptionsRetrieve: ReturnType<typeof vi.fn>;
  setNextWebhookEvent(event: Stripe.Event): void;
} {
  let nextWebhookEvent: Stripe.Event | null = null;
  const checkoutCreate = vi.fn();
  const subscriptionsRetrieve = vi.fn();
  const constructEvent = vi.fn(() => {
    if (nextWebhookEvent === null) {
      throw new Error("missing_test_webhook_event");
    }

    return nextWebhookEvent;
  });

  return {
    stripeConfig: {
      client: {
        webhooks: { constructEvent },
        subscriptions: { retrieve: subscriptionsRetrieve },
        checkout: { sessions: { create: checkoutCreate } },
        billingPortal: { sessions: { create: vi.fn() } }
      } as unknown as StripeConfigClient,
      webhookSecret: "whsec_test",
      priceMap: new Map([
        ["price_solo", { plan: "solo", type: "plan" }],
        ["price_team", { plan: "team", type: "plan" }],
        ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
        ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
      ]),
      soloPriceId: "price_solo",
      teamPriceId: "price_team",
      soloExtraCapacityPriceId: "price_solo_capacity",
      teamExtraCapacityPriceId: "price_team_capacity"
    } as unknown as StripeConfig,
    checkoutCreate,
    subscriptionsRetrieve,
    setNextWebhookEvent(event: Stripe.Event): void {
      nextWebhookEvent = event;
    }
  };
}

function createBillingEmailSink(input: { recipientEmail: string }): BillingEmailService & { messages: BillingEmailMessage[] } {
  const messages: BillingEmailMessage[] = [];

  return {
    managementUrl: "https://app.debugbundle.test/billing",
    async getBillingContactForOrganization(): Promise<{ organizationName: string; recipientEmail: string }> {
      return {
        organizationName: "Billing Integration Org",
        recipientEmail: input.recipientEmail
      };
    },
    async send(message: BillingEmailMessage): Promise<void> {
      messages.push(message);
    },
    messages
  };
}

function createBillingApp(input: {
  db: Queryable;
  stripe: ReturnType<typeof createStripeHarness>;
  billingEmails: BillingEmailService;
  owner: { organizationId: string; email: string };
}): {
  app: ReturnType<typeof createApiServer>;
  close(): Promise<void>;
} {
  const queue = createTestQueue();
  const stripeConfig = input.stripe.stripeConfig;
  const dependencies = createApiDependencies({
    db: input.db,
    objectStore: createTestObjectStore(),
    queue,
    stripeConfig,
    billingEmails: input.billingEmails
  });
  const app = createApiServer(
    {
      ...dependencies,
      webAuth: {
        ...dependencies.webAuth,
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: randomUUID(),
          email: input.owner.email,
          organization_id: input.owner.organizationId,
          email_verified_at: "2026-03-19T00:00:00.000Z",
          role: "owner"
        })
      }
    },
    {
      stripeWebhook: {
        stripeConfig,
        billingSyncStore: createPostgresBillingSyncStore(input.db),
        billingSummaryReader: dependencies.billingManagement,
        billingEmails: input.billingEmails
      }
    }
  );

  return {
    app,
    async close(): Promise<void> {
      await app.close();
      await queue.close();
    }
  };
}

function buildStripeEvent(eventId: string, type: string, data: Record<string, unknown>): Stripe.Event {
  return {
    id: eventId,
    type,
    data: { object: data }
  } as unknown as Stripe.Event;
}

type StripeConfigClient = {
  webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  subscriptions: { retrieve: ReturnType<typeof vi.fn> };
  checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
  billingPortal: { sessions: { create: ReturnType<typeof vi.fn> } };
};