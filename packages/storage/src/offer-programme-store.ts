import {
  assertProgrammeStateChange,
  defaultPromotionCode
} from "../../referrals/src/programme-lifecycle.js";
import { readOfferPerformance } from "./offer-performance-store.js";
import { createOfferInventoryStore, type OfferInventoryStore } from "./offer-inventory-store.js";
import { resolveOfferCode } from "./offer-code-resolver.js";
import { readPublicPromotion, type PromotionSelection } from "./offer-promotion-selection.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CreatorCodeSchema,
  ProgrammeDraftSchema,
  ProgrammeError,
  ProgrammeStateSchema,
  programmeAcceptsClaims,
  type ProgrammeVersion,
  type ProgrammeState
} from "../../referrals/src/programme-policy.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
import { createOfferCreatorStore } from "./offer-creator-store.js";
import { createOfferClaimStore } from "./offer-claim-store.js";
import {
  mapOfferVersion,
  readOfferVersion,
  verifiedOfferUser,
  versionColumns,
  type OfferStorageOptions
} from "./offer-store-helpers.js";

export interface OfferProgrammeStore {
  inventory: OfferInventoryStore;
  performance: (
    input: Parameters<typeof readOfferPerformance>[1]
  ) => ReturnType<typeof readOfferPerformance>;
  creators: ReturnType<typeof createOfferCreatorStore>;
  claims: ReturnType<typeof createOfferClaimStore>;
  getVersion(versionId: string): Promise<ProgrammeVersion>;
  publicPromotion(input?: PromotionSelection): Promise<{
    code: string;
    version: ProgrammeVersion;
    available: boolean;
  } | null>;
  list(input: {
    limit: number;
    before?: string | undefined;
    public_only?: boolean | undefined;
  }): Promise<ProgrammeVersion[]>;
  preview(
    code: string
  ): Promise<{ code: string; version: ProgrammeVersion; available: boolean } | null>;
  createDraft(
    raw: z.infer<typeof ProgrammeDraftSchema> & {
      actor_user_id: string;
      programme_id?: string | undefined;
    }
  ): Promise<ProgrammeVersion>;
  bindProvider(raw: {
    actor_user_id: string;
    version_id: string;
    coupon_id: string;
    livemode: boolean;
  }): Promise<void>;
  setState(raw: {
    actor_user_id: string;
    version_id: string;
    expected_state: ProgrammeState;
    state: ProgrammeState;
    acknowledge_unlimited: boolean;
  }): Promise<ProgrammeVersion>;
  createPromotionCode(raw: {
    actor_user_id: string;
    version_id: string;
    code: string;
  }): Promise<void>;
}
export function createOfferProgrammeStore(
  db: Queryable,
  options: OfferStorageOptions
): OfferProgrammeStore {
  z.string().min(32).parse(options.identityHashSecret);
  return {
    inventory: createOfferInventoryStore(db),
    performance: (input) => readOfferPerformance(db, input),
    creators: createOfferCreatorStore(db, options),
    claims: createOfferClaimStore(db, options),
    getVersion: (versionId: string) => readOfferVersion(db, versionId),
    async publicPromotion(input) {
      const resolved = await readPublicPromotion(db, input);
      return resolved ? this.preview(resolved.code) : null;
    },
    async list(input: {
      limit: number;
      before?: string | undefined;
      public_only?: boolean | undefined;
    }): Promise<ProgrammeVersion[]> {
      const parsed = z
        .object({
          limit: z.number().int().min(1).max(100),
          before: z.uuid().optional(),
          public_only: z.boolean().optional()
        })
        .strict()
        .parse(input);
      const rows = (
        await db.query(
          `SELECT ${versionColumns} FROM offer_programme_versions v JOIN offer_programmes p ON p.id=v.programme_id
        WHERE ($1::uuid IS NULL OR (v.created_at,v.id)<(SELECT created_at,id FROM offer_programme_versions WHERE id=$1))
        AND (NOT $3::boolean OR (p.current_version_id=v.id AND v.state IN ('active','scheduled')
          AND (v.policy->>'claims_start_at')::timestamptz<=clock_timestamp()
          AND (v.policy->>'claims_end_at' IS NULL OR (v.policy->>'claims_end_at')::timestamptz>clock_timestamp())
          AND (v.policy->>'max_claims' IS NULL OR v.claims_count<(v.policy->>'max_claims')::integer)))
        ORDER BY v.created_at DESC,v.id DESC LIMIT $2`,
          [parsed.before ?? null, parsed.limit, parsed.public_only === true]
        )
      ).rows;
      return rows.map(mapOfferVersion);
    },
    async preview(code: string) {
      const resolved = await resolveOfferCode(db, code);
      return resolved
        ? {
            code: resolved.code,
            version: resolved.version,
            available: programmeAcceptsClaims(
              resolved.version.policy,
              resolved.version.state,
              resolved.version.claims_count,
              Date.now()
            )
          }
        : null;
    },
    async createDraft(
      raw: z.infer<typeof ProgrammeDraftSchema> & {
        actor_user_id: string;
        programme_id?: string | undefined;
      }
    ): Promise<ProgrammeVersion> {
      const input = ProgrammeDraftSchema.extend({
        actor_user_id: z.uuid(),
        programme_id: z.uuid().optional()
      }).parse(raw);
      return runInTransaction(db, async (tx) => {
        await verifiedOfferUser(tx, input.actor_user_id);
        const programmeId = input.programme_id ?? randomUUID();
        if (input.programme_id) {
          if (
            !(
              await tx.query("SELECT id FROM offer_programmes WHERE id=$1 FOR UPDATE", [
                programmeId
              ])
            ).rows.length
          )
            throw new ProgrammeError("programme_not_found");
        } else await tx.query("INSERT INTO offer_programmes(id) VALUES($1)", [programmeId]);
        const revision = Number(
          (
            await tx.query<{ next: number }>(
              "SELECT COALESCE(max(revision),0)+1 AS next FROM offer_programme_versions WHERE programme_id=$1",
              [programmeId]
            )
          ).rows[0]!.next
        );
        const id = randomUUID();
        await tx.query(
          "INSERT INTO offer_programme_versions(id,programme_id,revision,name,public_description,policy,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",
          [
            id,
            programmeId,
            revision,
            input.name,
            input.public_description,
            JSON.stringify(input.policy),
            input.actor_user_id
          ]
        );
        return readOfferVersion(tx, id);
      });
    },
    async bindProvider(raw: {
      actor_user_id: string;
      version_id: string;
      coupon_id: string;
      livemode: boolean;
    }): Promise<void> {
      const input = z
        .object({
          actor_user_id: z.uuid(),
          version_id: z.uuid(),
          coupon_id: z.string().min(1).max(255),
          livemode: z.boolean()
        })
        .strict()
        .parse(raw);
      await runInTransaction(db, async (tx) => {
        await verifiedOfferUser(tx, input.actor_user_id);
        const version = await readOfferVersion(tx, input.version_id, true);
        if (version.state !== "draft") throw new ProgrammeError("programme_not_draft");
        const old = (
          await tx.query<{ coupon_id: string; livemode: boolean }>(
            "SELECT coupon_id,livemode FROM offer_provider_bindings WHERE version_id=$1",
            [version.version_id]
          )
        ).rows[0];
        if (old) {
          if (old.coupon_id !== input.coupon_id || old.livemode !== input.livemode)
            throw new ProgrammeError("programme_changed");
          return;
        }
        await tx.query(
          "INSERT INTO offer_provider_bindings(version_id,coupon_id,livemode,configured_by) VALUES($1,$2,$3,$4)",
          [version.version_id, input.coupon_id, input.livemode, input.actor_user_id]
        );
      });
    },
    async setState(raw: {
      actor_user_id: string;
      version_id: string;
      expected_state: ProgrammeState;
      state: ProgrammeState;
      acknowledge_unlimited: boolean;
    }): Promise<ProgrammeVersion> {
      const input = z
        .object({
          actor_user_id: z.uuid(),
          version_id: z.uuid(),
          expected_state: ProgrammeStateSchema,
          state: ProgrammeStateSchema,
          acknowledge_unlimited: z.boolean()
        })
        .strict()
        .parse(raw);
      return runInTransaction(db, async (tx) => {
        await verifiedOfferUser(tx, input.actor_user_id);
        // Programme then version is the same order used for revision/activation.
        const initial = await readOfferVersion(tx, input.version_id);
        await tx.query("SELECT id FROM offer_programmes WHERE id=$1 FOR UPDATE", [
          initial.programme_id
        ]);
        const version = await readOfferVersion(tx, input.version_id, true);
        assertProgrammeStateChange(version, input);
        if (input.state === "active" || input.state === "scheduled") {
          if (
            !(
              await tx.query("SELECT version_id FROM offer_provider_bindings WHERE version_id=$1", [
                version.version_id
              ])
            ).rows.length
          )
            throw new ProgrammeError("programme_unavailable");
          if (version.policy.kind === "promotion") {
            // A blocked code is intentional: never generate a replacement to bypass it.
            await tx.query(
              `INSERT INTO offer_codes(id,code,kind,version_id)
              SELECT $1,$2,'promotion',$3 WHERE NOT EXISTS(SELECT 1 FROM offer_codes WHERE version_id=$3)`,
              [randomUUID(), defaultPromotionCode(version.version_id), version.version_id]
            );
          }
          await tx.query(
            "UPDATE offer_programme_versions SET state='ended' WHERE programme_id=$1 AND id<>$2 AND state IN ('active','scheduled','paused')",
            [version.programme_id, version.version_id]
          );
          await tx.query("UPDATE offer_programmes SET current_version_id=$2 WHERE id=$1", [
            version.programme_id,
            version.version_id
          ]);
        }
        await tx.query("UPDATE offer_programme_versions SET state=$2 WHERE id=$1", [
          version.version_id,
          input.state
        ]);
        return readOfferVersion(tx, version.version_id);
      });
    },
    async createPromotionCode(raw: {
      actor_user_id: string;
      version_id: string;
      code: string;
    }): Promise<void> {
      const input = z
        .object({ actor_user_id: z.uuid(), version_id: z.uuid(), code: CreatorCodeSchema })
        .strict()
        .parse(raw);
      await runInTransaction(db, async (tx) => {
        await verifiedOfferUser(tx, input.actor_user_id);
        const version = await readOfferVersion(tx, input.version_id, true);
        if (version.policy.kind !== "promotion" || version.state === "ended")
          throw new ProgrammeError("programme_unavailable");
        const old = (
          await tx.query<{ version_id: string }>(
            "SELECT version_id FROM offer_codes WHERE code=$1",
            [input.code]
          )
        ).rows[0];
        if (old?.version_id === version.version_id) return;
        const result = await tx.query(
          "INSERT INTO offer_codes(id,code,kind,version_id) VALUES($1,$2,'promotion',$3) ON CONFLICT(code) DO NOTHING RETURNING id",
          [randomUUID(), input.code, version.version_id]
        );
        if (!result.rows.length) throw new ProgrammeError("creator_code_unavailable");
      });
    }
  };
}
