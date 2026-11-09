import { z } from "zod";
import {
  BillingOfferSelectionSchema,
  classifyBillingOfferChange,
  getBillingCatalogPrice,
  type BillingInterval,
  type BillingOfferQuote,
  type BillingOfferStatus,
  type PaidTierName,
  type TierName
} from "../../packages/shared-types/src/index.js";
import { getFirstPurchaseEligibility } from "../../packages/shared-types/src/first-purchase-eligibility.js";
import { canCheckoutToBillingPlan } from "../../packages/billing/src/billing-offer-admission.js";
import {
  BillingPreviewCommandSchema,
  type BillingPreviewScenario
} from "../../apps/web/src/dev/billing-preview-contract.js";
import type { BillingSummaryRecord } from "../../apps/web/src/lib/api-types.js";
import type { MockResponse } from "./api.js";

interface Context {
  plan(): TierName;
  setPlan(plan: TierName): void;
  capacity(): number;
  setCapacity(value: number): void;
  trial(): BillingSummaryRecord["trial"];
  setTrial(value: BillingSummaryRecord["trial"]): void;
  reduction(): BillingSummaryRecord["capacity_units"]["pending_reduction"];
  reset(): void;
}
const reply = (body: unknown, status = 200): MockResponse => ({ status, body });
const error = (code: string, status = 409) => reply({ error: code }, status);
const blankTrial = (): BillingSummaryRecord["trial"] => ({
  available: false,
  active: false,
  plan: null,
  started_at: null,
  ends_at: null,
  used_at: null,
  converted_at: null,
  expired_at: null,
  days_remaining: null
});
const localOrigin = (origin: string): boolean =>
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);

/** In-memory UI fixtures. Shared catalogue/admission rules; no provider or storage client. */
export function createBillingOfferMocks(context: Context) {
  let interval: BillingInterval = "month",
    internal = false,
    sequence = 1;
  let clock = Date.now(),
    cancellation = false;
  let pending: BillingOfferStatus["pending_change"] = null;
  let quote: { value: BillingOfferQuote; source: string } | null = null;
  const checkouts = new Map<
    string,
    { plan: PaidTierName; interval: BillingInterval; source: string; completed: boolean }
  >();
  const anchor = () => {
    const value = new Date(clock);
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1);
  };
  const end = () => {
    const start = new Date(anchor());
    return Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + (interval === "year" ? 12 : 1),
      1
    );
  };
  const paid = () => context.plan() !== "free" && !context.trial().active && !internal;
  const source = () =>
    JSON.stringify([
      context.plan(),
      interval,
      internal,
      context.capacity(),
      context.trial(),
      context.reduction(),
      anchor(),
      cancellation
    ]);
  const scenario = (): BillingPreviewScenario => ({
    plan: context.plan(),
    interval,
    mode: internal
      ? "complimentary"
      : context.trial().active
        ? getFirstPurchaseEligibility(
            { trial_started_at: context.trial().started_at, previously_paid: false },
            Date.now()
          ).allowed
          ? "trial"
          : "trial_locked"
        : "paid",
    additional_capacity_units: context.capacity()
  });
  const previewState = () => ({ scenario: scenario(), cancellation_scheduled: cancellation });
  const subscription = (): BillingOfferStatus => ({
    pending_change: pending,
    subscription: paid()
      ? {
          plan: context.plan() as PaidTierName,
          interval,
          currency: "usd",
          additional_capacity_units: context.capacity(),
          base_amount_minor: getBillingCatalogPrice(
            context.plan() as PaidTierName,
            interval,
            "plan"
          ).amount_minor,
          capacity_unit_amount_minor: getBillingCatalogPrice(
            context.plan() as PaidTierName,
            interval,
            "extra_capacity"
          ).amount_minor,
          term_starts_at: new Date(anchor()).toISOString(),
          term_ends_at: new Date(end()).toISOString()
        }
      : null
  });
  function validQuote(token: string, action: "upgrade" | "renewal"): BillingOfferQuote | null {
    return quote &&
      quote.value.confirmation_token === token &&
      quote.value.action === action &&
      Date.parse(quote.value.expires_at) > Date.now() &&
      quote.source === source() &&
      paid() &&
      !context.reduction() &&
      !pending &&
      !cancellation
      ? quote.value
      : null;
  }
  function handle(
    method: string,
    path: string,
    payload: unknown,
    origin: string
  ): MockResponse | undefined {
    if (path === "/v1/__dev/billing") {
      if (method === "GET") return reply(previewState());
      const command = BillingPreviewCommandSchema.safeParse(payload);
      if (method !== "POST" || !command.success) return error("invalid_mock_payload", 400);
      if (command.data.action === "configure") {
        const next = command.data.scenario;
        context.reset();
        quote = null;
        pending = null;
        checkouts.clear();
        cancellation = false;
        clock = Date.now();
        interval = next.interval;
        internal = next.plan !== "free" && next.mode === "complimentary";
        context.setPlan(next.plan);
        context.setCapacity(
          next.plan === "free" || next.mode.startsWith("trial") ? 0 : next.additional_capacity_units
        );
        const trial = blankTrial();
        trial.available = next.plan === "free";
        if (next.plan !== "free" && next.mode.startsWith("trial")) {
          const days = next.mode === "trial" ? 8 : 0;
          Object.assign(trial, {
            active: true,
            plan: next.plan,
            started_at: new Date(Date.now() - days * 86400000).toISOString(),
            used_at: new Date(Date.now() - days * 86400000).toISOString(),
            ends_at: new Date(Date.now() + (30 - days) * 86400000).toISOString(),
            days_remaining: 30 - days
          });
        } else if (next.plan !== "free" && !internal)
          trial.converted_at = new Date(clock).toISOString();
        context.setTrial(trial);
      } else if (command.data.action === "renew") {
        if (!paid()) return error("checkout_not_allowed");
        clock = end();
        if (cancellation) {
          context.setPlan("free");
          context.setCapacity(0);
        } else {
          if (pending) {
            context.setPlan(pending.target_plan);
            interval = pending.interval;
          }
          const reduction = context.reduction();
          if (reduction) context.setCapacity(reduction.additional_purchased);
        }
        context.reset();
        pending = null;
        quote = null;
        cancellation = false;
        checkouts.clear();
      } else {
        if (!paid() || pending) return error("checkout_not_allowed");
        cancellation = command.data.action === "cancel";
        quote = null;
      }
      return reply(previewState());
    }
    if (path === "/v1/billing/offers/change" && method === "GET") return reply(subscription());
    if (
      path === "/v1/billing/offers/change/preview" ||
      path === "/v1/billing/offers/upgrade-preview"
    ) {
      const selection = BillingOfferSelectionSchema.safeParse(payload);
      if (method !== "POST" || !selection.success) return error("invalid_mock_payload", 400);
      if (!paid() || pending || context.reduction() || cancellation)
        return error("checkout_not_allowed");
      const current = subscription().subscription!;
      const action = classifyBillingOfferChange(current, selection.data);
      if (!action || path.endsWith("upgrade-preview") !== (action === "upgrade"))
        return error("checkout_not_allowed");
      const total =
        getBillingCatalogPrice(selection.data.target_plan, selection.data.interval, "plan")
          .amount_minor +
        context.capacity() *
          getBillingCatalogPrice(
            selection.data.target_plan,
            selection.data.interval,
            "extra_capacity"
          ).amount_minor;
      const oldTotal =
        current.base_amount_minor! + context.capacity() * current.capacity_unit_amount_minor!;
      quote = {
        source: source(),
        value: {
          ...selection.data,
          action,
          currency: "usd",
          tax: 0,
          recurring_total: total,
          // Bounded synthetic proration exercises the UI; it is not a Stripe quote.
          amount_due: action === "upgrade" ? Math.max(1, Math.round((total - oldTotal) / 2)) : 0,
          additional_capacity_units: context.capacity(),
          confirmation_token: `mock_offer_${sequence++}`,
          expires_at: new Date(Date.now() + 600000).toISOString(),
          effective_at: new Date(action === "upgrade" ? Date.now() : end()).toISOString()
        }
      };
      return reply({ quote: quote.value });
    }
    if (path === "/v1/billing/offers/change") {
      if (method === "DELETE") {
        const input = z.object({ schedule_id: z.string() }).strict().safeParse(payload);
        if (!input.success) return error("invalid_mock_payload", 400);
        if (pending?.schedule_id !== input.data.schedule_id) return error("plan_change_not_found");
        pending = null;
        quote = null;
        return reply({ pending_change: null });
      }
      const input = z.object({ confirmation_token: z.string() }).strict().safeParse(payload);
      if (method !== "POST" || !input.success) return error("invalid_mock_payload", 400);
      if (pending && quote?.value.confirmation_token === input.data.confirmation_token)
        return reply({ pending_change: pending });
      const accepted = validQuote(input.data.confirmation_token, "renewal");
      if (!accepted) return error("plan_change_confirmation_required");
      pending = {
        target_plan: accepted.target_plan,
        interval: accepted.interval,
        schedule_id: `mock_schedule_${sequence++}`,
        effective_at: accepted.effective_at,
        additional_capacity_units: context.capacity()
      };
      return reply({ pending_change: pending });
    }
    if (
      path === "/v1/billing/checkout" &&
      method === "POST" &&
      typeof payload === "object" &&
      payload !== null &&
      "interval" in payload
    ) {
      const input = BillingOfferSelectionSchema.extend({
        confirmation_token: z.string().optional()
      })
        .strict()
        .safeParse(payload);
      if (!input.success || !localOrigin(origin)) return error("invalid_mock_payload", 400);
      if (internal || pending || context.reduction() || cancellation)
        return error("checkout_not_allowed");
      if (paid()) {
        const accepted = validQuote(input.data.confirmation_token ?? "", "upgrade");
        if (
          !accepted ||
          accepted.target_plan !== input.data.target_plan ||
          accepted.interval !== input.data.interval
        )
          return error("upgrade_confirmation_required");
      } else {
        if (
          !getFirstPurchaseEligibility(
            {
              trial_started_at: context.trial().started_at,
              previously_paid: context.trial().converted_at !== null
            },
            Date.now()
          ).allowed
        )
          return error("paid_purchase_locked");
        if (
          !canCheckoutToBillingPlan(
            { plan: context.plan(), trial: context.trial() },
            input.data.target_plan
          )
        )
          return error("checkout_not_allowed");
      }
      const match = [...checkouts.entries()].find(
        ([, item]) =>
          item.source === source() &&
          item.plan === input.data.target_plan &&
          item.interval === input.data.interval &&
          !item.completed
      );
      const id = match?.[0] ?? `mock_offer_checkout_${sequence++}`;
      if (!match)
        checkouts.set(id, {
          plan: input.data.target_plan,
          interval: input.data.interval,
          source: source(),
          completed: false
        });
      return reply({ url: `${origin}/billing?checkout=success&session_id=${id}` });
    }
    if (path === "/v1/billing/checkout/confirm" && method === "POST") {
      const input = z.object({ session_id: z.string() }).strict().safeParse(payload);
      const saved = input.success ? checkouts.get(input.data.session_id) : undefined;
      if (!saved) return undefined;
      if (!saved.completed) {
        if (saved.source !== source()) return error("checkout_not_allowed");
        context.setPlan(saved.plan);
        interval = saved.interval;
        context.setTrial({
          ...context.trial(),
          active: false,
          converted_at: new Date(Date.now()).toISOString()
        });
        saved.completed = true;
        quote = null;
      }
      // The outer simulator returns its complete billing summary after applying this receipt.
      return undefined;
    }
    if (pending && path.startsWith("/v1/billing/capacity/"))
      return error("billing_change_in_progress");
    return undefined;
  }
  return {
    handle,
    get interval() {
      return interval;
    },
    get internal() {
      return internal;
    },
    get now() {
      return clock;
    },
    hasCheckout: (id: string) => checkouts.get(id)?.completed === true
  };
}
