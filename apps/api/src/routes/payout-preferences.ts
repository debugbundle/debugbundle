import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PAYOUT_OPERATIONS } from "../../../../packages/referral-client/src/payout-operations.js";
import { PayoutPreferenceError } from "../../../../packages/referrals/src/payout-preferences.js";
import { ProgrammeError } from "../../../../packages/referrals/src/programme-policy.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth } from "../api-helpers.js";
import { recordAuditLog } from "../audit-logging.js";

export function registerPayoutPreferenceRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  for (const [name, operation] of Object.entries(PAYOUT_OPERATIONS))
    app.route({
      method: operation.method,
      url: operation.path,
      async handler(request, reply) {
        reply.header("Cache-Control", "private, no-store");
        const actor = await requireRateLimitedMemberAuth(
          request,
          reply,
          dependencies,
          operation.method === "GET" ? "management-read" : "management-write"
        );
        if (!actor) return;
        const service = dependencies.payoutPreferences;
        if (!service) return reply.status(503).send({ error: "payout_preferences_unavailable" });
        const raw =
          operation.method === "GET"
            ? { ...(request.query as object), ...(request.params as object) }
            : request.body;
        const parsed = operation.input.safeParse(raw);
        if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
        let success = false;
        try {
          const input = parsed.data as Record<string, unknown>;
          let result: unknown;
          switch (name) {
            case "payout_policy":
              result = service.policy();
              break;
            case "payout_preferences":
              result = {
                user_id: actor.member_id,
                programmes: await service.list(actor.member_id)
              };
              break;
            case "save_payout_preferences":
              result = { preference: await service.save(actor.member_id, parsed.data) };
              break;
            case "payout_balances":
              result = {
                programmes: await service.balances(actor.member_id, String(input["partner_id"]))
              };
              break;
            case "prepare_payout":
              result = { payout: await service.prepare(actor.member_id, parsed.data) };
              break;
            case "payout_instructions":
              result = {
                instructions: await service.instructions(actor.member_id, String(input["batch_id"]))
              };
              break;
            default:
              return reply.status(404).send({ error: "not_found" });
          }
          const response = operation.response.parse(result);
          success = true;
          return reply.send(response);
        } catch (error) {
          if (error instanceof ProgrammeError && error.code === "operator_authorization_required")
            return reply.status(403).send({ error: "verified_user_required" });
          if (error instanceof PayoutPreferenceError)
            return reply
              .status(
                error.code === "payout_operator_required"
                  ? 403
                  : ["payout_programme_not_owned", "payout_not_found"].includes(error.code)
                    ? 404
                    : error.code.endsWith("unavailable")
                      ? 503
                      : 409
              )
              .send({ error: error.code });
          if (error instanceof z.ZodError)
            return reply.status(503).send({ error: "payout_preferences_unavailable" });
          const code =
            error instanceof Error &&
            [
              "no_available_commission",
              "payout_already_claimed",
              "payout_claim_conflict",
              "payout_claim_too_large"
            ].includes(error.message)
              ? error.message
              : "payout_preferences_unavailable";
          return reply
            .status(code === "payout_preferences_unavailable" ? 503 : 409)
            .send({ error: code });
        } finally {
          if (
            name === "save_payout_preferences" ||
            name === "prepare_payout" ||
            name === "payout_instructions"
          )
            await recordAuditLog(dependencies.auditLogging, {
              organization_id: actor.organization_id,
              actor_user_id: actor.member_id,
              actor_type: request.headers.authorization ? "member_token" : "browser_session",
              action: `referral.${name}`,
              target_type: "referral_payout",
              target_id: null,
              status: success ? "success" : "failure",
              ip_address: request.ip,
              metadata: {}
            });
        }
      }
    });
}
