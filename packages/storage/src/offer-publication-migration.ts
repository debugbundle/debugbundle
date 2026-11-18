import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

/** Repair publication metadata only. Existing codes, claims, commercial terms,
 * provider bindings and financial records retain their original identities. */
export const OFFER_PUBLICATION_MIGRATION = defineStorageSchemaMigration({
  id: "202611180001_reconcile_offer_publication",
  description: "Reserve missing public promotion codes and retire superseded live revision labels.",
  statements: [
    `INSERT INTO offer_codes(id,code,kind,version_id)
      SELECT gen_random_uuid(),'PROMO-'||upper(left(replace(v.id::text,'-',''),18)),'promotion',v.id
      FROM offer_programme_versions v JOIN offer_programmes p ON p.current_version_id=v.id
      WHERE v.policy->>'kind'='promotion' AND v.state IN ('active','scheduled','paused')
        AND NOT EXISTS(SELECT 1 FROM offer_codes c WHERE c.version_id=v.id)`,
    `UPDATE offer_programme_versions v SET state='ended' FROM offer_programmes p
      WHERE v.programme_id=p.id AND p.current_version_id IS NOT NULL AND v.id<>p.current_version_id
        AND v.state IN ('active','scheduled','paused')`
  ]
});
