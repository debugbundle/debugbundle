import { lockOfferCodeForClaim, registerLegacyOfferCode } from "./offer-code-registry.js";
import { lockCreatorEmailEpoch, queueCreatorJoinEmail } from "./creator-email-events.js";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CreatorCodeSchema,
  PublicOfferCodeSchema,
  CreatorProgrammeSchema,
  ProgrammeError,
  programmeAcceptsClaims,
  type CreatorProgramme
} from "../../referrals/src/programme-policy.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
import {
  mapOfferVersion,
  offerIdentityHash,
  readOfferVersion,
  verifiedOfferUser,
  versionColumns,
  type OfferStorageOptions
} from "./offer-store-helpers.js";

export interface OfferCreatorStore {
  read(userId: string): Promise<CreatorProgramme | null>;
  canReplaceCode(userId: string): Promise<boolean>;
  correctCode(raw: {
    operator_user_id: string;
    partner_id: string;
    code: string;
    reason: string;
  }): Promise<{ code: string }>;
  setCodeBlocked(raw: {
    operator_user_id: string;
    code: string;
    blocked: boolean;
    reason: string;
  }): Promise<void>;
  join(raw: {
    user_id: string;
    version_id: string;
    terms_version: string;
  }): Promise<CreatorProgramme>;
  claimCode(raw: {
    user_id: string;
    code: string;
    expected_code?: string | undefined;
  }): Promise<CreatorProgramme>;
}
const claimCodeInput = z
  .object({
    user_id: z.uuid(),
    code: CreatorCodeSchema,
    expected_code: CreatorCodeSchema.optional()
  })
  .strict();

async function hasSingleBrandedAlias(tx: Queryable, partnerId: string): Promise<boolean> {
  const result = await tx.query<{ single_alias: boolean }>(
    "SELECT count(*)=1 AS single_alias FROM offer_codes WHERE partner_id=$1 AND kind='creator'",
    [partnerId]
  );
  return result.rows[0]?.single_alias === true;
}
export function createOfferCreatorStore(
  db: Queryable,
  options: OfferStorageOptions
): OfferCreatorStore {
  const read = async (tx: Queryable, userId: string): Promise<CreatorProgramme | null> => {
    await verifiedOfferUser(tx, userId);
    const row = (
      await tx.query(
        `SELECT ${versionColumns},p.id AS partner_id,p.code AS legacy_code,
      COALESCE(c.code,p.code) AS code,m.accepted_at::text AS accepted_at,p.status AS partner_status,COALESCE(c.blocked,lc.blocked,true) AS code_blocked,programme.current_version_id
      FROM referral_partners p JOIN offer_creator_memberships m ON m.partner_id=p.id AND m.preferred
      JOIN offer_programme_versions v ON v.id=m.version_id
      JOIN offer_programmes programme ON programme.id=v.programme_id
      LEFT JOIN offer_codes lc ON lc.code=p.code
      LEFT JOIN offer_codes c ON c.partner_id=p.id AND c.kind='creator' AND c.preferred
      WHERE p.user_id=$1`,
        [userId]
      )
    ).rows[0];
    if (!row) return null;
    const {
      partner_id,
      code,
      legacy_code,
      accepted_at,
      partner_status,
      code_blocked,
      current_version_id,
      ...version
    } = row;
    const definition = mapOfferVersion(version);
    return CreatorProgrammeSchema.parse({
      partner_id,
      code,
      legacy_code,
      accepted_at: new Date(String(accepted_at)).toISOString(),
      version: definition,
      accepting_new_referrals:
        options.newClaimsEnabled !== false &&
        partner_status === "active" &&
        code_blocked === false &&
        current_version_id === definition.version_id &&
        programmeAcceptsClaims(
          definition.policy,
          definition.state,
          definition.claims_count,
          Date.now()
        )
    });
  };
  return {
    read: (userId: string) => read(db, userId),
    async canReplaceCode(userId) {
      const creator = await read(db, z.uuid().parse(userId));
      return (
        creator !== null &&
        creator.accepting_new_referrals &&
        creator.code !== creator.legacy_code &&
        (await hasSingleBrandedAlias(db, creator.partner_id))
      );
    },
    async correctCode(raw: {
      operator_user_id: string;
      partner_id: string;
      code: string;
      reason: string;
    }): Promise<{ code: string }> {
      const input = z
        .object({
          operator_user_id: z.uuid(),
          partner_id: z.uuid(),
          code: CreatorCodeSchema,
          reason: z.string().trim().min(1).max(300)
        })
        .strict()
        .parse(raw);
      return runInTransaction(db, async (tx) => {
        await verifiedOfferUser(tx, input.operator_user_id);
        const partner = (
          await tx.query<{ id: string }>(
            "SELECT id FROM referral_partners WHERE id=$1 FOR UPDATE",
            [input.partner_id]
          )
        ).rows[0];
        if (!partner) throw new ProgrammeError("creator_membership_required");
        const existing = (
          await tx.query<{ partner_id: string | null; blocked: boolean }>(
            "SELECT partner_id,blocked FROM offer_codes WHERE code=$1",
            [input.code]
          )
        ).rows[0];
        if (existing && (existing.partner_id !== partner.id || existing.blocked))
          throw new ProgrammeError("creator_code_unavailable");
        await tx.query(
          "UPDATE offer_codes SET preferred=false WHERE partner_id=$1 AND kind='creator' AND preferred",
          [partner.id]
        );
        if (existing)
          await tx.query("UPDATE offer_codes SET preferred=true WHERE code=$1 AND kind='creator'", [
            input.code
          ]);
        else {
          const created = await tx.query(
            "INSERT INTO offer_codes(id,code,kind,partner_id,preferred) VALUES($1,$2,'creator',$3,true) ON CONFLICT(code) DO NOTHING RETURNING id",
            [randomUUID(), input.code, partner.id]
          );
          if (!created.rows.length) throw new ProgrammeError("creator_code_unavailable");
        }
        await tx.query(
          "INSERT INTO offer_code_actions(id,code_id,operator_user_id,action,reason) SELECT $1,id,$3,'correct',$4 FROM offer_codes WHERE code=$2",
          [randomUUID(), input.code, input.operator_user_id, input.reason]
        );
        return { code: input.code };
      });
    },
    async setCodeBlocked(raw: {
      operator_user_id: string;
      code: string;
      blocked: boolean;
      reason: string;
    }): Promise<void> {
      const input = z
        .object({
          operator_user_id: z.uuid(),
          code: PublicOfferCodeSchema,
          blocked: z.boolean(),
          reason: z.string().trim().min(1).max(300)
        })
        .strict()
        .parse(raw);
      await runInTransaction(db, async (tx) => {
        await verifiedOfferUser(tx, input.operator_user_id);
        const code = (
          await tx.query<{ id: string; blocked: boolean }>(
            "SELECT id,blocked FROM offer_codes WHERE code=$1 FOR UPDATE",
            [input.code]
          )
        ).rows[0];
        if (!code) throw new ProgrammeError("invalid_offer_code");
        if (code.blocked === input.blocked) return;
        await tx.query("UPDATE offer_codes SET blocked=$2 WHERE id=$1", [code.id, input.blocked]);
        await tx.query(
          "INSERT INTO offer_code_actions(id,code_id,operator_user_id,action,reason) VALUES($1,$2,$3,$4,$5)",
          [
            randomUUID(),
            code.id,
            input.operator_user_id,
            input.blocked ? "block" : "unblock",
            input.reason
          ]
        );
      });
    },
    async join(raw: {
      user_id: string;
      version_id: string;
      terms_version: string;
    }): Promise<CreatorProgramme> {
      const input = z
        .object({
          user_id: z.uuid(),
          version_id: z.uuid(),
          terms_version: z.string().min(1).max(100)
        })
        .strict()
        .parse(raw);
      return runInTransaction(db, async (tx) => {
        await lockCreatorEmailEpoch(tx);
        const email = await verifiedOfferUser(tx, input.user_id, true);
        const version = await readOfferVersion(tx, input.version_id, true);
        if (version.policy.terms_version !== input.terms_version)
          throw new ProgrammeError("programme_terms_mismatch");
        if (
          version.policy.kind !== "referral" ||
          !programmeAcceptsClaims(version.policy, version.state, version.claims_count, Date.now())
        )
          throw new ProgrammeError("programme_unavailable");
        const current = (
          await tx.query<{ current_version_id: string }>(
            "SELECT current_version_id FROM offer_programmes WHERE id=$1",
            [version.programme_id]
          )
        ).rows[0];
        if (current?.current_version_id !== version.version_id)
          throw new ProgrammeError("programme_changed");
        let partner = (
          await tx.query<{ id: string; code: string; status: string }>(
            "SELECT id,code,status FROM referral_partners WHERE user_id=$1",
            [input.user_id]
          )
        ).rows[0];
        if (!partner) {
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
          for (let attempt = 0; attempt < 3 && !partner; attempt++) {
            const code = Array.from(randomBytes(10), (b) => alphabet[b & 31]).join("");
            partner = (
              await tx.query<{ id: string; code: string; status: string }>(
                `INSERT INTO referral_partners(id,user_id,code,terms_version,commission_basis_points,identity_hash)
              VALUES($1,$2,$3,$4,5000,$5) ON CONFLICT DO NOTHING RETURNING id,code,status`,
                [
                  randomUUID(),
                  input.user_id,
                  code,
                  input.terms_version,
                  offerIdentityHash(options, email, true)
                ]
              )
            ).rows[0];
          }
        }
        if (!partner || partner.status !== "active")
          throw new ProgrammeError("programme_unavailable");
        if (!(await registerLegacyOfferCode(tx, { partner_id: partner.id, code: partner.code })))
          throw new ProgrammeError("programme_unavailable");
        await tx.query(
          "UPDATE offer_creator_memberships SET preferred=false WHERE partner_id=$1 AND preferred",
          [partner.id]
        );
        await tx.query(
          `INSERT INTO offer_creator_memberships(partner_id,version_id,terms_version) VALUES($1,$2,$3)
          ON CONFLICT(partner_id,version_id) DO UPDATE SET preferred=true`,
          [partner.id, version.version_id, input.terms_version]
        );
        const creator = (await read(tx, input.user_id))!;
        await queueCreatorJoinEmail(tx, {
          partner_id: partner.id,
          user_id: input.user_id,
          code: creator.code,
          version
        });
        return creator;
      });
    },
    async claimCode(raw): Promise<CreatorProgramme> {
      const input = claimCodeInput.parse(raw);
      return runInTransaction(db, async (tx) => {
        await verifiedOfferUser(tx, input.user_id, true);
        const creator = await read(tx, input.user_id);
        if (!creator) throw new ProgrammeError("creator_membership_required");
        // Operator corrections take this same lock, including a first alias.
        await tx.query("SELECT id FROM referral_partners WHERE id=$1 FOR UPDATE", [
          creator.partner_id
        ]);
        const old = (
          await tx.query<{ code: string }>(
            "SELECT code FROM offer_codes WHERE partner_id=$1 AND kind='creator' AND preferred FOR UPDATE",
            [creator.partner_id]
          )
        ).rows[0];
        if (old?.code === input.code) return (await read(tx, input.user_id))!;
        if (input.expected_code !== undefined && old?.code !== input.expected_code)
          throw new ProgrammeError("creator_code_changed");
        if (
          old &&
          (input.expected_code === undefined ||
            !(await hasSingleBrandedAlias(tx, creator.partner_id)))
        )
          throw new ProgrammeError("creator_code_already_claimed");
        // On the first reservation, the generated code still controls admission.
        if (!old) await lockOfferCodeForClaim(tx, creator.legacy_code);
        const current = await read(tx, input.user_id);
        if (!current?.accepting_new_referrals) throw new ProgrammeError("programme_unavailable");
        if (old) {
          // The old code remains resolvable. A collision below rolls back
          // the preferred flag as part of the same partner-locked transaction.
          await tx.query("UPDATE offer_codes SET preferred=false WHERE code=$1", [old.code]);
        }
        const result = await tx.query(
          "INSERT INTO offer_codes(id,code,kind,partner_id,preferred) VALUES($1,$2,'creator',$3,true) ON CONFLICT(code) DO NOTHING RETURNING id",
          [randomUUID(), input.code, creator.partner_id]
        );
        if (!result.rows.length) throw new ProgrammeError("creator_code_unavailable");
        return (await read(tx, input.user_id))!;
      });
    }
  };
}
