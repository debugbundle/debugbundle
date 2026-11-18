import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  getBillingCatalogPrice,
  type PaidTierName,
  type BillingInterval
} from "../../packages/shared-types/src/index.js";
import { createStripeCheckoutLink } from "../../packages/billing/src/stripe-checkout.js";
import type {
  StripeBillingProvider,
  StripePriceMapping
} from "../../packages/billing/src/stripe-subscription.js";
import { createPostgresBillingCheckoutStore } from "../../packages/storage/src/billing-checkout-store.js";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import { saveSignupOfferIntent } from "../../packages/storage/src/offer-signup-store.js";
import { createReferralLedgerStore } from "../../packages/storage/src/referral-ledger-store.js";
import { reconcileOfferInvoiceBenefits } from "../../packages/storage/src/offer-benefit-reconciliation.js";
import { readStripeOfferInvoice } from "../../packages/referrals/src/stripe-offer-invoice.js";
import { mapStripeReferralInvoiceLines } from "../../packages/referrals/src/stripe-invoice-lines.js";
import { runInTransaction } from "../../packages/storage/src/transaction.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestAccount,
  createOfferTestUser,
  createOfferTestProgramme
} from "../helpers/offer-integration.js";
import { mockedObject } from "../helpers/vitest.js";
runIntegration("all-plan offer purchase and invoice boundary", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    store = createOfferProgrammeStore(db, {
      identityHashSecret: "offer-purchase-secret-thirty-two-characters-long"
    });
  let operator: string, owner: string, org: string, creator: string;
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    operator = await createOfferTestUser(db);
    owner = await createOfferTestUser(db);
    creator = await createOfferTestUser(db);
    org = await createOfferTestAccount(db, owner);
    await db.query(
      "UPDATE organizations SET trial_plan='solo',trial_started_at=now()-interval '8 days',trial_ends_at=now()+interval '22 days' WHERE id=$1",
      [org]
    );
  });
  afterAll(async () => pool.end());
  it.each([
    ["solo", "month"],
    ["solo", "year"],
    ["team", "month"],
    ["team", "year"],
    ["business", "month"],
    ["business", "year"]
  ] as const)(
    "freezes and reconciles %s/%s through real domain and storage adapters",
    async (plan: PaidTierName, interval: BillingInterval) => {
      const version = await createOfferTestProgramme(store, operator);
      await store.creators.join({
        user_id: creator,
        version_id: version.version_id,
        terms_version: version.policy.terms_version
      });
      const profile = await store.creators.claimCode({ user_id: creator, code: "BUY20" });
      await saveSignupOfferIntent(db, {
        organization_id: org,
        user_id: owner,
        hint: { code: profile.code, expires_at: new Date(Date.now() + 86400000).toISOString() }
      });
      const checkout = createPostgresBillingCheckoutStore(db);
      expect(
        await checkout.claim({
          organization_id: org,
          target_plan: plan,
          expected_owner_user_id: owner,
          parameters: () => ({})
        })
      ).toBe("checkout_in_progress");
      const saved = await store.claims.apply({
        organization_id: org,
        actor_user_id: owner,
        code: profile.code,
        source: "manual",
        explicit_correction: false,
        provider_customer_id_checked: null,
        provider_previously_paid: false
      });
      // A lost intent-completion acknowledgement cannot block an already saved
      // promise when new enrolment stops. The unsigned hint alone still blocks.
      await store.setState({
        actor_user_id: operator,
        version_id: version.version_id,
        expected_state: "active",
        state: "paused",
        acknowledge_unlimited: true
      });
      const priceMap = new Map<string, StripePriceMapping>();
      for (const tier of ["solo", "team", "business"] as const)
        for (const term of ["month", "year"] as const)
          for (const type of ["plan", "extra_capacity"] as const)
            priceMap.set(`${tier}_${term}_${type}`, {
              plan: tier,
              interval: term,
              type,
              currency: "usd",
              amount_minor: getBillingCatalogPrice(tier, term, type).amount_minor
            });
      const session = {
          id: "cs_offer",
          client_reference_id: org,
          status: "open",
          url: "https://checkout.stripe.com/test"
        },
        create = vi.fn().mockResolvedValue(session),
        retrieve = vi.fn().mockResolvedValue(session);
      const provider = mockedObject<StripeBillingProvider>({
        businessSalesEnabled: true,
        priceMap,
        client: {
          customers: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
          coupons: {
            retrieve: vi.fn().mockResolvedValue({
              id: `coupon_${version.version_id}`,
              valid: true,
              livemode: false,
              percent_off: 20,
              max_redemptions: null,
              redeem_by: null,
              amount_off: null,
              duration: "once",
              applies_to: { products: ["prod_solo", "prod_team", "prod_business"] }
            })
          },
          prices: {
            retrieve: vi.fn(async (id: string) => {
              const mapping = priceMap.get(id)!;
              return {
                id,
                active: true,
                livemode: false,
                currency: "usd",
                unit_amount: mapping.amount_minor,
                tax_behavior: "exclusive",
                recurring: {
                  interval: mapping.interval,
                  interval_count: 1,
                  usage_type: "licensed"
                },
                product:
                  mapping.type === "plan" ? `prod_${mapping.plan}` : `prod_capacity_${mapping.plan}`
              };
            })
          },
          checkout: { sessions: { create, retrieve } }
        }
      });
      const input = {
          organization_id: org,
          billing_email: `${owner}@example.test`,
          target_plan: plan,
          interval,
          additional_capacity_units: 1,
          expected_owner_user_id: owner,
          expected_offer: {
            claim_id: saved.claim_id,
            version_id: version.version_id,
            expires_at: new Date(Date.now() + 300000).toISOString()
          }
        },
        purchase = () =>
          createStripeCheckoutLink({
            stripe: provider,
            store: checkout,
            appBaseUrl: "https://app.example.test",
            input
          });
      expect(await purchase()).toEqual({ url: session.url });
      expect(await purchase()).toEqual({ url: session.url });
      expect(create).toHaveBeenCalledOnce();
      const parameters = create.mock.calls[0]![0];
      expect(parameters).toMatchObject({
        line_items: [
          { price: `${plan}_${interval}_plan`, quantity: 1 },
          { price: `${plan}_${interval}_extra_capacity`, quantity: 1 }
        ],
        allow_promotion_codes: false,
        discounts: [{ coupon: `coupon_${version.version_id}` }],
        automatic_tax: { enabled: true },
        subscription_data: {
          metadata: { offer_claim_id: saved.claim_id, offer_version_id: version.version_id }
        }
      });
      const base = getBillingCatalogPrice(plan, interval, "plan").amount_minor,
        capacity = getBillingCatalogPrice(plan, interval, "extra_capacity").amount_minor,
        discount = base / 5,
        net = base - discount,
        tax = (net + capacity) / 10,
        start = Date.parse("2026-11-16T00:00:00.000Z") / 1000,
        end =
          Date.parse(
            interval === "year" ? "2027-11-16T00:00:00.000Z" : "2026-12-16T00:00:00.000Z"
          ) / 1000;
      const lines = [
        mockedObject<Stripe.InvoiceLineItem>({
          id: "base",
          invoice: "in_offer",
          currency: "usd",
          subtotal: base,
          discount_amounts: [{ discount: "di_offer", amount: discount }],
          period: { start, end },
          pricing: { price_details: { price: `${plan}_${interval}_plan` } },
          taxes: [{ amount: net / 10 }]
        }),
        mockedObject<Stripe.InvoiceLineItem>({
          id: "capacity",
          invoice: "in_offer",
          currency: "usd",
          subtotal: capacity,
          discount_amounts: [],
          period: { start, end },
          pricing: { price_details: { price: `${plan}_${interval}_extra_capacity` } },
          taxes: [{ amount: capacity / 10 }]
        })
      ];
      const invoice = mockedObject<Stripe.Invoice>({
        id: "in_offer",
        status: "open",
        created: start,
        status_transitions: { finalized_at: start },
        currency: "usd",
        amount_due: net + capacity + tax,
        total: net + capacity + tax,
        total_excluding_tax: net + capacity,
        parent: {
          subscription_details: {
            subscription: "sub_offer",
            metadata: { offer_claim_id: saved.claim_id, offer_version_id: version.version_id }
          }
        },
        discounts: [
          {
            id: "di_offer",
            promotion_code: null,
            source: { type: "coupon", coupon: `coupon_${version.version_id}` }
          }
        ]
      });
      const benefit = readStripeOfferInvoice(invoice, lines, priceMap, version.policy)!;
      expect(benefit).toMatchObject({
        base_net_minor: net,
        verified_base_coupon_ids: [`coupon_${version.version_id}`]
      });
      await db.query("UPDATE organizations SET stripe_customer_id='cus_offer' WHERE id=$1", [org]);
      const identity = String(
        (
          await db.query("SELECT owner_identity_hash FROM offer_claims WHERE id=$1", [
            saved.claim_id
          ])
        ).rows[0]!["owner_identity_hash"]
      );
      const facts = {
        organization_external_id: org,
        owner_identity_hash: identity,
        provider_customer_id: "cus_offer",
        observed_at: "2026-11-16T00:00:00.000Z",
        offer_benefit_invoices: [benefit],
        invoices: [
          {
            invoice_id: invoice.id,
            currency: "usd" as const,
            lines: mapStripeReferralInvoiceLines(invoice, lines, priceMap),
            payments: [] as {
              payment_id: string;
              cash_minor: number;
              collected_at: string;
              provider_available_at: string;
            }[],
            refunds: [],
            disputed: false
          }
        ]
      };
      // Finalisation consumes the benefit even when payment fails. No cash, no earning.
      await runInTransaction(db, (tx) => reconcileOfferInvoiceBenefits(tx, facts, false));
      expect(
        (await store.claims.read({ organization_id: org, actor_user_id: owner }))!.status
      ).toBe("used");
      const ledger = createReferralLedgerStore(db);
      expect(await ledger.reconcile(facts)).toMatchObject({ adjustment_minor: 0 });
      facts.observed_at = "2026-11-17T00:00:00.000Z";
      facts.invoices[0]!.payments = [
        {
          payment_id: "pay_offer",
          cash_minor: invoice.total,
          collected_at: "2026-11-17T00:00:00.000Z",
          provider_available_at: "2026-11-20T00:00:00.000Z"
        }
      ];
      expect(await ledger.reconcile(facts)).toMatchObject({ adjustment_minor: net / 2 });
      expect(await ledger.reconcile(facts)).toMatchObject({
        status: "duplicate",
        adjustment_minor: 0
      });
      // An old checkout representation cannot create a second introductory benefit.
      expect(
        await createStripeCheckoutLink({
          stripe: provider,
          store: checkout,
          appBaseUrl: "https://app.example.test",
          input: {
            organization_id: org,
            billing_email: input.billing_email,
            target_plan: plan,
            interval,
            additional_capacity_units: 1,
            expected_owner_user_id: owner
          }
        })
      ).toEqual({ url: session.url });
      expect(create).toHaveBeenCalledOnce();
    }
  );
});
