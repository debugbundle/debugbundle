import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  OfferClaimSchema,
  publicOfferDefinition,
  ProgrammeError,
  PublicOfferCodeSchema,
  offerClaimDeadline,
  programmeAcceptsClaims,
  type OfferClaim
} from "../../referrals/src/programme-policy.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
import { resolveOfferCode } from "./offer-code-resolver.js";
import { lockOfferCodeForClaim } from "./offer-code-registry.js";
import { resolveOfferReferrer } from "./offer-referrer.js";
import { NewOfferClaimSchema } from "../../referrals/src/offer-claim-source.js";
import { readOfferCheckoutContext, readOfferPurchaseEligibility } from "./offer-benefit-store.js";
import {
  OfferActorSchema,
  lockOfferIdentity,
  lockOfferOwner,
  offerIdentityHash,
  readOfferVersion,
  type OfferActor,
  type OfferStorageOptions
} from "./offer-store-helpers.js";

const applySchema = OfferActorSchema.extend({
  code: PublicOfferCodeSchema,
  source: z.enum(["link", "manual"]),
  explicit_correction: z.boolean(),
  referral_code: PublicOfferCodeSchema.optional(),
  expected_version_id: z.uuid().optional(),
  preserve_referral: z.boolean().optional(),
  new_claim: NewOfferClaimSchema.optional(),
  provider_customer_id_checked: z.string().min(1).max(255).nullable(),
  provider_previously_paid: z.boolean()
}).strict();
export type ApplyOfferInput = z.infer<typeof applySchema>;
interface ClaimRow extends Record<string, unknown> {
  id: string;
  version_id: string;
  code_id: string;
  code: string;
  referral_code: string | null;
  claimed_at: string;
  redeem_by: string | null;
  revoked_at: string | null;
  checkout_attempt_id: string | null;
  eligible_invoice_id: string | null;
  attribution_id: string | null;
  referral_version_id: string | null;
  referral_code_id: string | null;
  organization_external_id: string;
  revoked_reason: string | null;
  slot_released: boolean;
}
const claimSql = `SELECT c.*,code.code,refcode.code AS referral_code FROM offer_claims c
  JOIN offer_codes code ON code.id=c.code_id LEFT JOIN offer_codes refcode ON refcode.id=c.referral_code_id`;
async function mapClaim(tx: Queryable, row: ClaimRow): Promise<OfferClaim> {
  const version = publicOfferDefinition(await readOfferVersion(tx, row.version_id));
  return OfferClaimSchema.parse({
    claim_id: row.id,
    code: row.code,
    referral_code: row.referral_code,
    version,
    claimed_at: new Date(row.claimed_at).toISOString(),
    redeem_by: row.redeem_by === null ? null : new Date(row.redeem_by).toISOString(),
    checkout_reserved: row.checkout_attempt_id !== null,
    eligible_invoice_id: row.eligible_invoice_id,
    status: row.eligible_invoice_id
      ? "used"
      : row.revoked_at
        ? "revoked"
        : row.checkout_attempt_id
          ? "reserved"
          : row.redeem_by && Date.parse(row.redeem_by) <= Date.now()
            ? "expired"
            : "saved"
  });
}
async function claimRow(tx: Queryable, organizationId: string): Promise<ClaimRow | undefined> {
  return (await tx.query<ClaimRow>(`${claimSql} WHERE c.organization_id=$1`, [organizationId]))
    .rows[0];
}

export interface OfferClaimStore {
  remove(raw: OfferActor): Promise<void>;
  revoke(raw: { claim_id: string; operator_user_id: string; reason: string }): Promise<void>;
  read(raw: OfferActor): Promise<OfferClaim | null>;
  apply(raw: ApplyOfferInput): Promise<OfferClaim>;
}
export function createOfferClaimStore(
  db: Queryable,
  options: OfferStorageOptions
): OfferClaimStore {
  return {
    async remove(raw: OfferActor): Promise<void> {
      const actor = OfferActorSchema.parse(raw);
      await runInTransaction(db, async (tx) => {
        await lockOfferOwner(tx, actor);
        await tx.query(
          "UPDATE offer_signup_intents SET status='rejected' WHERE organization_id=$1 AND user_id=$2 AND status='pending'",
          [actor.organization_id, actor.actor_user_id]
        );
        const current = await claimRow(tx, actor.organization_id);
        if (!current) return;
        if (
          current.checkout_attempt_id ||
          current.eligible_invoice_id ||
          (
            await tx.query("SELECT id FROM billing_checkout_attempts WHERE organization_id=$1", [
              actor.organization_id
            ])
          ).rows.length
        )
          throw new ProgrammeError("offer_frozen");
        if (current.revoked_at && current.revoked_reason !== "customer_removed_offer")
          throw new ProgrammeError("offer_frozen");
        await readOfferVersion(tx, current.version_id, true);
        if (!current.slot_released)
          await tx.query(
            "UPDATE offer_programme_versions SET claims_count=claims_count-1 WHERE id=$1 AND claims_count>0",
            [current.version_id]
          );
        await tx.query(
          "UPDATE offer_claims SET revoked_at=COALESCE(revoked_at,now()),revoked_reason='customer_removed_offer',slot_released=true,updated_at=now() WHERE id=$1",
          [current.id]
        );
        if (!current.revoked_at)
          await tx.query(
            "INSERT INTO offer_claim_history(id,claim_id,actor_user_id,action,version_id,code_id,attribution_id) VALUES($1,$2,$3,'revoke',$4,$5,$6)",
            [
              randomUUID(),
              current.id,
              actor.actor_user_id,
              current.version_id,
              current.code_id,
              current.attribution_id
            ]
          );
      });
    },
    async revoke(raw: {
      claim_id: string;
      operator_user_id: string;
      reason: string;
    }): Promise<void> {
      const input = z
        .object({
          claim_id: z.uuid(),
          operator_user_id: z.uuid(),
          reason: z.string().trim().min(1).max(300)
        })
        .strict()
        .parse(raw);
      if (input.reason === "customer_removed_offer") throw new ProgrammeError("offer_ineligible");
      await runInTransaction(db, async (tx) => {
        const row = (
          await tx.query<{ organization_external_id: string }>(
            "SELECT organization_external_id FROM offer_claims WHERE id=$1",
            [input.claim_id]
          )
        ).rows[0];
        if (!row) throw new ProgrammeError("offer_ineligible");
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          row.organization_external_id
        ]);
        const current = (
          await tx.query<ClaimRow>(`${claimSql} WHERE c.id=$1 FOR UPDATE OF c`, [input.claim_id])
        ).rows[0]!;
        if (current.eligible_invoice_id) throw new ProgrammeError("offer_frozen");
        if (current.revoked_at) return;
        await tx.query(
          "UPDATE offer_claims SET revoked_at=now(),revoked_reason=$2,updated_at=now() WHERE id=$1",
          [input.claim_id, input.reason]
        );
        await tx.query(
          "INSERT INTO offer_claim_history(id,claim_id,actor_user_id,action,version_id,code_id,attribution_id) VALUES($1,$2,$3,'revoke',$4,$5,$6)",
          [
            randomUUID(),
            current.id,
            input.operator_user_id,
            current.version_id,
            current.code_id,
            current.attribution_id
          ]
        );
      });
    },
    async read(raw: OfferActor): Promise<OfferClaim | null> {
      const actor = OfferActorSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        await lockOfferOwner(tx, actor);
        const current = await claimRow(tx, actor.organization_id);
        return current ? mapClaim(tx, current) : null;
      });
    },
    async apply(raw: ApplyOfferInput): Promise<OfferClaim> {
      const input = applySchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        const owner = await lockOfferOwner(tx, input);
        if (owner.customer_id !== input.provider_customer_id_checked)
          throw new ProgrammeError("offer_context_changed");
        const current = await claimRow(tx, input.organization_id);
        if (
          input.new_claim &&
          current &&
          (current.id !== input.new_claim.claim_id ||
            current.code !== input.code ||
            current.revoked_at !== null)
        )
          throw new ProgrammeError("offer_context_changed");
        if (input.expected_version_id && current?.version_id !== input.expected_version_id)
          throw new ProgrammeError("offer_context_changed");
        if (
          current?.code === input.code &&
          current.revoked_at === null &&
          !input.expected_version_id &&
          (!input.referral_code || current.referral_code === input.referral_code)
        )
          return mapClaim(tx, current);
        if (
          current?.code === input.code &&
          current.revoked_reason === "customer_removed_offer" &&
          !input.explicit_correction
        )
          throw new ProgrammeError("offer_change_requires_confirmation");
        const attribution = (
          await tx.query<{
            id: string;
            partner_id: string;
            reserved_checkout_attempt_id: string | null;
            partner_code: string;
          }>(
            "SELECT id,partner_id,reserved_checkout_attempt_id,(SELECT code FROM referral_partners p WHERE p.id=referral_attributions.partner_id) AS partner_code FROM referral_attributions WHERE organization_id=$1 FOR UPDATE",
            [input.organization_id]
          )
        ).rows[0];
        if (input.new_claim) {
          if (
            (attribution?.id ?? null) !== input.new_claim.attribution_id ||
            (attribution?.partner_code ?? null) !== input.new_claim.partner_code
          )
            throw new ProgrammeError("offer_context_changed");
          const eligibility = await readOfferPurchaseEligibility(tx, input.organization_id);
          if (!eligibility.allowed || eligibility.previously_paid)
            throw new ProgrammeError("offer_ineligible");
          if (
            !attribution &&
            (
              await tx.query(
                "SELECT id FROM offer_signup_intents WHERE organization_id=$1 AND user_id=$2 AND status='pending' AND expires_at>clock_timestamp()",
                [input.organization_id, input.actor_user_id]
              )
            ).rows.length
          )
            throw new ProgrammeError("programme_unavailable");
        }
        if (
          current?.checkout_attempt_id ||
          current?.eligible_invoice_id ||
          (current?.revoked_at && current.revoked_reason !== "customer_removed_offer") ||
          attribution?.reserved_checkout_attempt_id ||
          (
            await tx.query("SELECT id FROM billing_checkout_attempts WHERE organization_id=$1", [
              input.organization_id
            ])
          ).rows.length
        )
          throw new ProgrammeError("offer_frozen");
        if ((current || attribution) && !input.explicit_correction)
          throw new ProgrammeError("offer_change_requires_confirmation");
        const hash = offerIdentityHash(options, owner.email);
        await lockOfferIdentity(tx, hash);
        const identityClaim = (
          await tx.query<{ organization_external_id: string }>(
            "SELECT organization_external_id FROM offer_claims WHERE owner_identity_hash=$1 FOR UPDATE",
            [hash]
          )
        ).rows[0];
        if (identityClaim && identityClaim.organization_external_id !== input.organization_id)
          throw new ProgrammeError("offer_ineligible");
        if (
          input.provider_previously_paid ||
          (
            await tx.query(
              "SELECT organization_external_id FROM billing_customer_history WHERE owner_identity_hash=$1 OR organization_external_id=$2 LIMIT 1",
              [hash, input.organization_id]
            )
          ).rows.length ||
          (
            await tx.query(
              "SELECT owner_identity_hash FROM referral_invoice_benefits WHERE owner_identity_hash=$1 AND (eligible_invoice_id IS NOT NULL OR checkout_attempt_id IS NOT NULL OR provider_customer_id IS NOT NULL OR provider_subscription_id IS NOT NULL OR recovery_requested_at IS NOT NULL)",
              [hash]
            )
          ).rows.length
        )
          throw new ProgrammeError("offer_ineligible");
        const resolved = await resolveOfferCode(tx, input.code);
        if (!resolved) throw new ProgrammeError("invalid_offer_code");
        if (input.new_claim && resolved.version.policy.kind !== "promotion")
          throw new ProgrammeError("offer_context_changed");
        if (resolved.partner_user_id === input.actor_user_id)
          throw new ProgrammeError("offer_ineligible");
        const referrer = input.referral_code
          ? await resolveOfferReferrer(tx, input.referral_code)
          : null;
        if (input.referral_code && !referrer) throw new ProgrammeError("invalid_offer_code");
        if (referrer?.partner_user_id === input.actor_user_id)
          throw new ProgrammeError("offer_ineligible");
        const versionIds = [
          ...new Set([
            resolved.version.version_id,
            ...(referrer?.version ? [referrer.version.version_id] : []),
            ...(current ? [current.version_id] : [])
          ])
        ].sort();
        const programmeIds = [
          ...new Set(
            (await Promise.all(versionIds.map((id) => readOfferVersion(tx, id)))).map(
              (v) => v.programme_id
            )
          )
        ].sort();
        await tx.query(
          "SELECT id FROM offer_programmes WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
          [programmeIds]
        );
        await tx.query(
          "SELECT id FROM offer_programme_versions WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [versionIds]
        );
        const version = await readOfferVersion(tx, resolved.version.version_id);
        const heldSlot =
          current?.version_id === version.version_id && !current.slot_released ? 1 : 0;
        if (
          !programmeAcceptsClaims(
            version.policy,
            version.state,
            version.claims_count - heldSlot,
            Date.now()
          )
        ) {
          if (
            version.policy.max_claims !== null &&
            version.claims_count >= version.policy.max_claims
          )
            throw new ProgrammeError("programme_claim_limit");
          throw new ProgrammeError("programme_unavailable");
        }
        // Revalidate the code after taking the version lock. A pause, membership
        // change or operator block must not be hidden by the preliminary read.
        await lockOfferCodeForClaim(tx, input.code);
        const fresh = await resolveOfferCode(tx, input.code);
        if (!fresh || fresh.version.version_id !== version.version_id)
          throw new ProgrammeError("programme_changed");
        if (input.referral_code) {
          await lockOfferCodeForClaim(tx, input.referral_code);
          const checked = await resolveOfferReferrer(tx, input.referral_code);
          if (
            !checked ||
            checked.partner_id !== referrer!.partner_id ||
            checked.version?.version_id !== referrer!.version?.version_id
          )
            throw new ProgrammeError("programme_changed");
        }
        if (input.expected_version_id) {
          // Provider reads and lock waits can outlive removal or the saved
          // deadline. Recheck eligibility under the owner/identity locks before
          // replacing any promise, attribution or claim-slot accounting.
          const context = await readOfferCheckoutContext(tx, {
            organization_id: input.organization_id,
            actor_user_id: input.actor_user_id
          });
          if (!context?.discount_eligible || context.version_id !== input.expected_version_id)
            throw new ProgrammeError("offer_context_changed");
        }
        let attributionId = current?.attribution_id ?? attribution?.id ?? null;
        let referralVersionId = current?.referral_version_id ?? null;
        let referralCodeId = current?.referral_code_id ?? null;
        const partnerId = referrer?.partner_id ?? resolved.partner_id;
        if (partnerId !== null) {
          attributionId ??= randomUUID();
          await tx.query(
            `INSERT INTO referral_attributions(id,partner_id,organization_id,organization_external_id,owner_identity_hash,source)
            VALUES($1,$2,$3,$3,$4,$5) ON CONFLICT(organization_external_id) DO UPDATE SET partner_id=EXCLUDED.partner_id,source=EXCLUDED.source,updated_at=now()`,
            [attributionId, partnerId, input.organization_id, hash, input.source]
          );
          // A promotion never substitutes its policy for the creator's agreement.
          // Existing same-partner commission terms stay frozen across discount changes.
          if (
            (!input.preserve_referral && resolved.partner_id !== null) ||
            !attribution ||
            attribution.partner_id !== partnerId
          ) {
            referralVersionId = referrer
              ? (referrer.version?.version_id ?? null)
              : version.version_id;
            referralCodeId = referrer?.code_id ?? resolved.code_id;
          }
        }
        if (attributionId && !referralCodeId) {
          // A promotion replaces only the discount. A null referral version is
          // the explicit preserved legacy Business-only commission agreement.
          await tx.query(
            "INSERT INTO offer_codes(id,code,kind,partner_id) SELECT id,code,'legacy',id FROM referral_partners WHERE id=$1 ON CONFLICT(code) DO NOTHING",
            [attribution!.partner_id]
          );
          const original = (
            await tx.query<{ id: string }>(
              "SELECT id FROM offer_codes WHERE partner_id=$1 AND kind='legacy'",
              [attribution!.partner_id]
            )
          ).rows[0];
          if (!original) throw new ProgrammeError("offer_context_changed");
          referralCodeId = original.id;
        }
        const id = current?.id ?? input.new_claim?.claim_id ?? randomUUID();
        const deadline = offerClaimDeadline(
          version.policy,
          Date.now(),
          owner.trial_ends_at === null ? null : new Date(owner.trial_ends_at).toISOString()
        );
        await tx.query(
          `INSERT INTO offer_claims(id,owner_user_id,owner_identity_hash,organization_id,organization_external_id,version_id,code_id,
          attribution_id,referral_version_id,referral_code_id,source,redeem_by)
          VALUES($1,$11,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT(organization_external_id) DO UPDATE SET version_id=EXCLUDED.version_id,code_id=EXCLUDED.code_id,
          attribution_id=EXCLUDED.attribution_id,referral_version_id=EXCLUDED.referral_version_id,referral_code_id=EXCLUDED.referral_code_id,
          source=EXCLUDED.source,redeem_by=EXCLUDED.redeem_by,claimed_at=now(),updated_at=now(),revoked_at=NULL,revoked_reason=NULL,slot_released=false`,
          [
            id,
            hash,
            input.organization_id,
            version.version_id,
            resolved.code_id,
            attributionId,
            referralVersionId,
            referralCodeId,
            input.source,
            deadline,
            input.actor_user_id
          ]
        );
        await tx.query(
          "UPDATE offer_programme_versions SET claims_count=claims_count+1 WHERE id=$1",
          [version.version_id]
        );
        // Explicit pre-checkout replacement relinquishes only that unused slot.
        if (current && !current.slot_released)
          await tx.query(
            "UPDATE offer_programme_versions SET claims_count=claims_count-1 WHERE id=$1 AND claims_count>0",
            [current.version_id]
          );
        await tx.query(
          "INSERT INTO offer_claim_history(id,claim_id,actor_user_id,action,version_id,code_id,attribution_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            id,
            input.actor_user_id,
            current ? "replace" : "claim",
            version.version_id,
            resolved.code_id,
            attributionId
          ]
        );
        return mapClaim(tx, (await claimRow(tx, input.organization_id))!);
      });
    }
  };
}
