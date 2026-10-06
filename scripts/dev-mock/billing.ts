import { z } from "zod";
import { getTierCapabilities } from "../../packages/shared-types/src/index.js";
import type { BillingSummaryRecord } from "../../apps/web/src/lib/api-types.js";
import type { createDevMockFixtures } from "./fixtures.js";
import type { MockResponse } from "./api.js";

const reply = (body: unknown, status = 200): MockResponse => ({ status, body });
const missing = (): MockResponse => reply({ error: "mock_record_not_found" }, 404);
const invalid = (): MockResponse => reply({ error: "invalid_mock_payload" }, 400);

/** Billing simulation never contacts Stripe and only returns local navigation URLs. */
export function createBillingMocks(data: ReturnType<typeof createDevMockFixtures>) {
  const now = new Date().toISOString();
  let sequence = 100;
  const checkouts = new Map<string, "solo" | "team">();
  let plan: "free" | "solo" | "team" = "team";
  let additionalCapacity = 1;
  let pendingReduction: BillingSummaryRecord["capacity_units"]["pending_reduction"] = null;
  let trial: BillingSummaryRecord["trial"] = {
    available: false,
    active: false,
    plan: null,
    started_at: null,
    ends_at: null,
    used_at: null,
    converted_at: null,
    expired_at: null,
    days_remaining: null
  };
  function billing(): BillingSummaryRecord {
    const caps = getTierCapabilities(plan);
    const total = caps.included_capacity_units + additionalCapacity;
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return {
      plan,
      billing_state: trial.active ? "trialing" : "active",
      stripe_customer_id: "mock_customer",
      active_projects: data.projects.length,
      capacity_units: {
        included: caps.included_capacity_units,
        total,
        additional_purchased: additionalCapacity,
        pending_reduction: pendingReduction
      },
      usage_window: { starts_at: start.toISOString(), ends_at: end.toISOString() },
      allowances: {
        monthly_bundle_requests: { used: 42, limit: caps.monthly_bundle_requests * total },
        monthly_raw_ingested_events: {
          used: 1420,
          limit: caps.monthly_raw_ingested_events * total
        },
        retained_bundle_cap: {
          used: data.incidents.length,
          limit: caps.retained_bundle_cap * total
        },
        monthly_remote_activations: { used: 1, limit: caps.monthly_remote_activations * total },
        monthly_alert_deliveries: { used: 12, limit: caps.monthly_alert_deliveries * total },
        monthly_webhook_deliveries: { used: 8, limit: caps.monthly_webhook_deliveries * total }
      },
      trial
    };
  }
  function setPlan(next: "solo" | "team") {
    plan = next;
    data.session.organization_plan = next;
    data.projects.forEach((project) => {
      project["organization_plan"] = next;
    });
  }
  function handle(method: string, path: string, payload: unknown): MockResponse | undefined {
    const read = method === "GET";
    if (path === "/v1/billing" && read) return reply({ billing: billing() });
    if (method === "POST" && ["/v1/billing/checkout", "/v1/billing/trial/start"].includes(path)) {
      const input = z.object({ target_plan: z.enum(["solo", "team"]) }).safeParse(payload);
      if (!input.success) return invalid();
      if (path.endsWith("/checkout")) {
        const id = `mock_checkout_${sequence++}`;
        checkouts.set(id, input.data.target_plan);
        return reply({ url: `/billing?checkout=success&session_id=${id}` });
      }
      setPlan(input.data.target_plan);
      trial = {
        available: false,
        active: true,
        plan: input.data.target_plan,
        started_at: now,
        ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        used_at: now,
        converted_at: null,
        expired_at: null,
        days_remaining: 30
      };
      return reply({ billing: billing() });
    }
    if (path === "/v1/billing/checkout/confirm" && method === "POST") {
      const input = z.object({ session_id: z.string() }).safeParse(payload);
      if (!input.success) return invalid();
      const next = checkouts.get(input.data.session_id);
      if (!next) return missing();
      setPlan(next);
      trial = { ...trial, active: false, converted_at: now };
      return reply({ billing: billing() });
    }
    if (path === "/v1/billing/portal" && method === "POST")
      return reply({ url: "/billing?mock_portal=1" });
    if (path.startsWith("/v1/billing/capacity/")) {
      if (method === "DELETE" && path.endsWith("/scheduled-reduction")) {
        pendingReduction = null;
        return reply({ billing: billing() });
      }
      const input = z
        .object({ target_additional_capacity_units: z.number().int().min(0).max(100) })
        .safeParse(payload);
      if (!input.success || method !== "POST") return invalid();
      if (path.endsWith("/increase")) {
        additionalCapacity = input.data.target_additional_capacity_units;
        pendingReduction = null;
      } else if (path.endsWith("/scheduled-reduction"))
        pendingReduction = {
          additional_purchased: input.data.target_additional_capacity_units,
          total:
            getTierCapabilities(plan).included_capacity_units +
            input.data.target_additional_capacity_units,
          effective_at: billing().usage_window.ends_at
        };
      else return undefined;
      return reply({ billing: billing() });
    }
    return undefined;
  }
  return { handle };
}
