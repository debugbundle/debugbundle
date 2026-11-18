import { randomUUID } from "node:crypto";
import { defaultPromotionCode } from "../../packages/referrals/src/programme-lifecycle.js";
import {
  preferOffer,
  OfferPriceSelectionSchema,
  type OfferPriceSelection
} from "../../packages/referrals/src/offer-choice.js";
import { z } from "zod";
import {
  OFFER_OPERATIONS,
  type OfferOperation
} from "../../packages/referral-client/src/offer-api.js";
import {
  ProgrammeVersionSchema,
  programmeAcceptsClaims,
  publicOfferDefinition,
  previewOfferPrice,
  PublicOfferCodeSchema,
  type ProgrammeVersion,
  type CreatorProgramme
} from "../../packages/referrals/src/programme-policy.js";
import { getBillingCatalogPrice } from "../../packages/shared-types/src/index.js";
import type { MockResponse } from "./api.js";
import { createPayoutPreferenceMocks } from "./payout-preferences.js";

const reply = (body: unknown, status = 200): MockResponse => ({ status, body });
const error = (code: string, status = 409): MockResponse => reply({ error: code }, status);
const transitions = {
  draft: ["scheduled", "active", "ended"],
  scheduled: ["active", "paused", "ended"],
  active: ["paused", "ended"],
  paused: ["active", "ended"],
  ended: []
} as const;

/** Disposable UI simulation only. No storage, provider clients or network calls.
 * Inputs and outputs use the public operation contracts; real financial and
 * operator admission remain the responsibility of the production services. */
export function createReferralOfferMocks(isSignedIn: () => boolean) {
  const now = () => new Date().toISOString();
  const initial = ProgrammeVersionSchema.parse({
    programme_id: "71000000-0000-4000-8000-000000000001",
    version_id: "72000000-0000-4000-8000-000000000001",
    revision: 1,
    name: "Local preview creator referrals",
    public_description:
      "Synthetic programme for reviewing the app. Restart the preview to reset edits.",
    state: "active",
    claims_count: 0,
    created_at: now(),
    policy: {
      kind: "referral",
      discount_basis_points: 2000,
      commission_basis_points: 5000,
      commission_months: 12,
      eligible_plans: ["solo", "team", "business"],
      eligible_intervals: ["month", "year"],
      claims_start_at: new Date(Date.now() - 86400000).toISOString(),
      claims_end_at: null,
      redeem_by: null,
      max_claims: 100,
      allow_early_purchase_grants: false,
      terms_version: "local-preview-only"
    }
  });
  const versions = [initial];
  const bindings = new Set([initial.version_id]);
  const codes = new Map([
    [
      "REVIEW20",
      { code_id: randomUUID(), version_id: initial.version_id, blocked: false, created_at: now() }
    ]
  ]);
  let creator: CreatorProgramme | null = null;
  const accepted = new Map<string, ProgrammeVersion>();
  const payoutPreferences = createPayoutPreferenceMocks(() => [...accepted.values()]);
  let pending: string | null = null;
  const find = (id: unknown) => versions.find((v) => v.version_id === id);
  const context = (code: string | null) => {
    const record = code ? codes.get(code) : undefined;
    const version = record ? find(record.version_id) : undefined;
    return version && record
      ? {
          code: code!,
          version: publicOfferDefinition(version),
          available:
            !record.blocked &&
            programmeAcceptsClaims(version.policy, version.state, version.claims_count, Date.now())
        }
      : null;
  };
  const creatorResult = () => ({
    creator,
    share_url: creator ? `http://localhost:5292/affiliates/?offer=${creator.code}` : null
  });
  const selectedContext = (
    code: string | null,
    selection?: OfferPriceSelection
  ): ReturnType<typeof context> => {
    const original = context(code);
    if (code && (!original || !original.available)) return original;
    const selected = [...codes.keys()]
      .map(context)
      .filter((offer) => offer?.version.policy.kind === "promotion")
      .reduce<ReturnType<typeof context>>(
        (current, offer) => preferOffer(current, offer, selection),
        original
      );
    return selected && original ? { ...selected, code: original.code } : selected;
  };

  return {
    handle(
      method: string,
      path: string,
      query: URLSearchParams,
      payload: unknown
    ): MockResponse | undefined {
      if (path.startsWith("/v1/referrals/")) {
        if (!isSignedIn()) return error("invalid_session", 401);
        if (method !== "GET") return error("local_preview_operation_unavailable", 503);
        if (path === "/v1/referrals/partner")
          return reply({
            partner: null,
            share_url: null,
            enrollment_enabled: false,
            terms_version: "business-referrals-2026-11"
          });
        if (path === "/v1/referrals/earnings")
          return reply({ balance: null, operator_access: false });
        if (path === "/v1/referrals/clients") return reply({ clients: [] });
        if (path === "/v1/referrals/payouts") return reply({ payouts: [] });
        if (path === "/v1/referrals/attribution")
          return reply({ attribution: null, pending_code: null });
        return error("local_preview_operation_unavailable", 503);
      }
      if (!path.startsWith("/v2/offers/") && !path.startsWith("/v2/referrals/")) return undefined;
      const publicPath = [
        "/v2/offers/capabilities",
        "/v2/offers/programmes",
        "/v2/offers/context",
        "/v2/offers/pending"
      ].includes(path);
      if (!publicPath && !isSignedIn()) return error("invalid_session", 401);
      if (path === "/v2/offers/operator/access-status" && method === "GET")
        return reply({ status: "ready" });
      if (path === "/v2/offers/pending") {
        if (method === "DELETE") {
          pending = null;
          return reply({ offer: null });
        }
        if (method !== "POST") return error("mock_operation_unavailable", 503);
        const input = z
          .object({ code: PublicOfferCodeSchema, explicit_correction: z.boolean().default(false) })
          .strict()
          .safeParse(payload);
        if (!input.success) return error("invalid_offer_request", 400);
        const next = context(input.data.code);
        if (!next?.available) return error("invalid_offer_code");
        if (
          pending &&
          pending !== input.data.code &&
          !input.data.explicit_correction &&
          !(
            context(pending)?.version.policy.kind === "promotion" &&
            next.version.policy.kind === "referral"
          )
        )
          return error("offer_change_requires_confirmation");
        pending = input.data.code;
        return reply({ offer: selectedContext(pending) });
      }
      for (const name of Object.keys(OFFER_OPERATIONS) as OfferOperation[]) {
        const operation = OFFER_OPERATIONS[name];
        if (operation.method !== method) continue;
        const keys: string[] = [];
        const pattern = operation.path.replace(/:([a-z_]+)/g, (_, key: string) => {
          keys.push(key);
          return "([^/]+)";
        });
        const match = new RegExp(`^${pattern}$`).exec(path);
        if (!match) continue;
        const raw: Record<string, unknown> =
          method === "GET"
            ? Object.fromEntries(query)
            : typeof payload === "object" && payload !== null && !Array.isArray(payload)
              ? { ...payload }
              : {};
        if (method === "GET" && raw["limit"] !== undefined) raw["limit"] = Number(raw["limit"]);
        keys.forEach((key, i) => {
          raw[key] = match[i + 1];
        });
        const parsed = operation.input.safeParse(raw);
        if (!parsed.success) return error("invalid_offer_request", 400);
        const input = parsed.data as Record<string, unknown>;
        const respond = (body: unknown) => {
          const output = operation.response.safeParse(body);
          return output.success ? reply(output.data) : error("invalid_mock_offer_response", 500);
        };
        const payout = payoutPreferences.handle(name, input);
        if (payout) return payout.status === 200 ? respond(payout.body) : payout;
        switch (name) {
          case "capabilities":
            return respond({ enabled: true });
          case "programmes":
            return respond({
              programmes: versions
                .filter((v) =>
                  programmeAcceptsClaims(v.policy, v.state, v.claims_count, Date.now())
                )
                .map(publicOfferDefinition)
            });
          case "context": {
            const selection = OfferPriceSelectionSchema.safeParse({
              target_plan: input["target_plan"],
              interval: input["interval"]
            });
            return respond({
              offer: selectedContext(
                typeof input["code"] === "string" ? input["code"] : pending,
                selection.success ? selection.data : undefined
              )
            });
          }
          case "creator":
            return respond(creatorResult());
          case "join": {
            const version = find(input["version_id"]);
            if (
              !version ||
              version.policy.kind !== "referral" ||
              !programmeAcceptsClaims(
                version.policy,
                version.state,
                version.claims_count,
                Date.now()
              )
            )
              return error("programme_unavailable");
            if (version.policy.terms_version !== input["terms_version"])
              return error("programme_terms_mismatch");
            creator = {
              partner_id: creator?.partner_id ?? randomUUID(),
              code: creator?.code ?? "REVIEWABCD",
              legacy_code: "REVIEWABCD",
              accepting_new_referrals: true,
              version: structuredClone(version),
              accepted_at: now()
            };
            accepted.set(version.programme_id, structuredClone(version));
            codes.set(creator.code, {
              code_id: randomUUID(),
              version_id: version.version_id,
              blocked: false,
              created_at: now()
            });
            return respond(creatorResult());
          }
          case "code": {
            if (!creator) return error("programme_unavailable");
            const code = String(input["code"]);
            if (codes.has(code)) return error("creator_code_unavailable");
            if (creator.code !== creator.legacy_code) return error("creator_code_already_claimed");
            codes.set(code, {
              code_id: randomUUID(),
              version_id: creator.version.version_id,
              blocked: false,
              created_at: now()
            });
            creator = { ...creator, code };
            return respond(creatorResult());
          }
          case "customer":
            return respond({
              claim: null,
              legacy_attribution: null,
              pending: context(pending),
              early_purchase_allowed: false
            });
          case "retry_signup":
            return respond({ intent: null });
          case "operator_programmes": {
            const start = input["before"]
              ? versions.findIndex((v) => v.version_id === input["before"]) + 1
              : 0;
            return respond({ programmes: versions.slice(start, start + Number(input["limit"])) });
          }
          case "draft": {
            const programmeId =
              typeof input["programme_id"] === "string" ? input["programme_id"] : randomUUID();
            const previous = versions.filter((v) => v.programme_id === programmeId);
            if (input["programme_id"] && !previous.length) return error("programme_unavailable");
            const version = ProgrammeVersionSchema.parse({
              ...input,
              programme_id: programmeId,
              version_id: randomUUID(),
              revision: Math.max(0, ...previous.map((v) => v.revision)) + 1,
              state: "draft",
              claims_count: 0,
              created_at: now()
            });
            versions.unshift(version);
            return respond({ programme: version });
          }
          case "provider": {
            const version = find(input["version_id"]);
            if (!version || version.state !== "draft") return error("programme_unavailable");
            if (input["livemode"]) return error("local_preview_live_provider_unavailable");
            bindings.add(version.version_id);
            return respond({ ok: true });
          }
          case "state": {
            const version = find(input["version_id"]);
            const next = String(input["state"]);
            if (
              !version ||
              version.state !== input["expected_state"] ||
              !(transitions[version.state] as readonly string[]).includes(next)
            )
              return error("programme_changed");
            if (["active", "scheduled"].includes(next)) {
              if (version.policy.max_claims === null && !input["acknowledge_unlimited"])
                return error("programme_unavailable");
              if (
                version.policy.eligible_plans.some((plan) =>
                  version.policy.eligible_intervals.some(
                    (interval) =>
                      previewOfferPrice(
                        getBillingCatalogPrice(plan, interval, "plan").amount_minor,
                        version.policy
                      ).payable_minor === 0
                  )
                )
              )
                return error("programme_discount_invalid");
            }
            if (["active", "scheduled"].includes(next)) {
              bindings.add(version.version_id);
              for (const previous of versions) {
                if (
                  previous.programme_id === version.programme_id &&
                  previous !== version &&
                  ["active", "scheduled", "paused"].includes(previous.state)
                )
                  previous.state = "ended";
              }
              if (
                version.policy.kind === "promotion" &&
                ![...codes.values()].some((c) => c.version_id === version.version_id)
              ) {
                codes.set(defaultPromotionCode(version.version_id), {
                  code_id: randomUUID(),
                  version_id: version.version_id,
                  blocked: false,
                  created_at: now()
                });
              }
            }
            version.state = input["state"] as ProgrammeVersion["state"];
            return respond({ programme: version });
          }
          case "promotion_code": {
            const version = find(input["version_id"]),
              code = String(input["code"]);
            if (!version || version.policy.kind !== "promotion")
              return error("programme_unavailable");
            if (codes.has(code)) return error("creator_code_unavailable");
            codes.set(code, {
              code_id: randomUUID(),
              version_id: version.version_id,
              blocked: false,
              created_at: now()
            });
            return respond({ ok: true });
          }
          case "operator_codes":
            return respond({
              codes: [...codes.entries()]
                .filter(([code]) => !input["code"] || code === input["code"])
                .map(([code, record]) => ({
                  ...record,
                  code,
                  kind:
                    find(record.version_id)?.policy.kind === "promotion" ? "promotion" : "creator",
                  partner_id: null,
                  preferred: true
                }))
                .slice(0, Number(input["limit"]))
            });
          case "operator_claims":
            return respond({ claims: [] });
          case "operator_grants":
            return respond({ grants: [] });
          case "operator_performance":
            return respond({
              performance: {
                ...input,
                version_id: input["version_id"] ?? null,
                as_of: now(),
                claims: 0,
                active_trials: 0,
                paid_conversions: 0,
                reconciled_claims: 0,
                unreconciled_claims: 0,
                oldest_observation: null,
                latest_observation: null,
                base_cash_collected_minor: 0,
                base_cash_retained_minor: 0,
                base_cash_reversed_minor: 0,
                base_discount_minor: 0,
                discount_coverage_complete: false,
                commission_net_minor: 0,
                commission_paid_minor: 0,
                commission_reversed_minor: 0,
                disputed_invoices: 0,
                held_invoices: 0,
                currency: "usd"
              }
            });
          default:
            return error("local_preview_operation_unavailable", 503);
        }
      }
      return error("mock_operation_unavailable", 503);
    }
  };
}
