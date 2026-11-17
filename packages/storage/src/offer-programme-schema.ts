import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const OFFER_PROGRAMME_TABLES = [
  "offer_programmes",
  "offer_programme_versions",
  "offer_creator_memberships",
  "offer_codes",
  "offer_code_actions",
  "offer_claims",
  "offer_claim_history",
  "offer_signup_intents",
  "offer_early_purchase_grants",
  "offer_operator_delegations",
  "offer_provider_bindings",
  "referral_benefit_recovery_retirements"
] as const;

const statements = [
  `CREATE TABLE offer_programmes (
    id uuid PRIMARY KEY, current_version_id uuid, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE offer_programme_versions (
    id uuid PRIMARY KEY, programme_id uuid NOT NULL REFERENCES offer_programmes(id),
    revision integer NOT NULL CHECK(revision>0), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
    public_description text NOT NULL CHECK(length(public_description) BETWEEN 1 AND 1000),
    policy jsonb NOT NULL CHECK(jsonb_typeof(policy)='object'),
    state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','scheduled','active','paused','ended')),
    claims_count integer NOT NULL DEFAULT 0 CHECK(claims_count>=0),
    created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(programme_id,revision), UNIQUE(programme_id,id)
  )`,
  `CREATE INDEX offer_versions_listing_idx ON offer_programme_versions(created_at DESC,id DESC)`,
  `ALTER TABLE offer_programmes ADD CONSTRAINT offer_programme_current_version_fk
    FOREIGN KEY(id,current_version_id) REFERENCES offer_programme_versions(programme_id,id)`,
  `CREATE TABLE offer_creator_memberships (
    partner_id uuid NOT NULL REFERENCES referral_partners(id), version_id uuid NOT NULL REFERENCES offer_programme_versions(id),
    terms_version text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(),
    preferred boolean NOT NULL DEFAULT true, PRIMARY KEY(partner_id,version_id)
  )`,
  `CREATE UNIQUE INDEX offer_creator_preferred_idx ON offer_creator_memberships(partner_id) WHERE preferred`,
  `CREATE TABLE offer_codes (
    id uuid PRIMARY KEY, code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' AND length(code) BETWEEN 3 AND 24),
    kind text NOT NULL CHECK(kind IN ('legacy','creator','promotion')),
    partner_id uuid REFERENCES referral_partners(id), version_id uuid REFERENCES offer_programme_versions(id),
    blocked boolean NOT NULL DEFAULT false, preferred boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK((kind IN ('legacy','creator') AND partner_id IS NOT NULL AND version_id IS NULL) OR
      (kind='promotion' AND partner_id IS NULL AND version_id IS NOT NULL))
  )`,
  `CREATE TABLE offer_code_actions (
    id uuid PRIMARY KEY, code_id uuid NOT NULL REFERENCES offer_codes(id),
    operator_user_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('correct','block','unblock')),
    reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 300), recorded_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX offer_creator_primary_code_idx ON offer_codes(partner_id) WHERE kind='creator' AND preferred`,
  `INSERT INTO offer_codes(id,code,kind,partner_id) SELECT id,code,'legacy',id FROM referral_partners`,
  `CREATE TABLE offer_claims (
    id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, owner_identity_hash text NOT NULL UNIQUE CHECK(owner_identity_hash ~ '^[a-f0-9]{64}$'),
    organization_id uuid UNIQUE REFERENCES organizations(id) ON DELETE SET NULL,
    organization_external_id uuid NOT NULL UNIQUE,
    version_id uuid NOT NULL REFERENCES offer_programme_versions(id), code_id uuid NOT NULL REFERENCES offer_codes(id),
    attribution_id uuid UNIQUE REFERENCES referral_attributions(id),
    referral_version_id uuid REFERENCES offer_programme_versions(id), referral_code_id uuid REFERENCES offer_codes(id),
    source text NOT NULL CHECK(source IN ('link','manual')), claimed_at timestamptz NOT NULL DEFAULT now(),
    slot_released boolean NOT NULL DEFAULT false,
    redeem_by timestamptz, revoked_at timestamptz, revoked_reason text,
    checkout_attempt_id uuid, coupon_id text,
    provider_customer_id text, provider_subscription_id text,
    eligible_invoice_id text UNIQUE,
    recovery_invoice_id text, recovery_requested_at timestamptz, recovery_completed_at timestamptz,
    performance jsonb CHECK(performance IS NULL OR (jsonb_typeof(performance)='object' AND pg_column_size(performance)<=4096)),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK((attribution_id IS NULL AND referral_version_id IS NULL AND referral_code_id IS NULL) OR
      (attribution_id IS NOT NULL AND referral_code_id IS NOT NULL)),
    CHECK((revoked_at IS NULL AND revoked_reason IS NULL) OR (revoked_at IS NOT NULL AND length(revoked_reason) BETWEEN 1 AND 300))
  )`,
  `CREATE INDEX offer_claims_attribution_idx ON offer_claims(attribution_id)`,
  `CREATE INDEX offer_claims_listing_idx ON offer_claims(claimed_at DESC,id DESC)`,
  `CREATE INDEX offer_claims_cohort_idx ON offer_claims(version_id,claimed_at)`,
  `CREATE TABLE offer_claim_history (
    id uuid PRIMARY KEY, claim_id uuid NOT NULL REFERENCES offer_claims(id),
    actor_user_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('claim','replace','revoke')),
    version_id uuid NOT NULL REFERENCES offer_programme_versions(id), code_id uuid NOT NULL REFERENCES offer_codes(id),
    attribution_id uuid, recorded_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE referral_benefit_recovery_retirements (
    id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('offer','legacy')),
    claim_id uuid REFERENCES offer_claims(id),attribution_id uuid REFERENCES referral_attributions(id),
    organization_external_id uuid NOT NULL,owner_identity_hash text NOT NULL CHECK(owner_identity_hash ~ '^[a-f0-9]{64}$'),
    coupon_id text NOT NULL,provider_customer_id text NOT NULL,provider_subscription_id text NOT NULL,
    provider_invoice_id text NOT NULL UNIQUE CHECK(length(provider_invoice_id) BETWEEN 1 AND 255),
    amount_due_minor bigint NOT NULL CHECK(amount_due_minor>=0),base_net_minor bigint NOT NULL CHECK(base_net_minor>=0),
    observed_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
    CHECK(amount_due_minor=0 OR base_net_minor=0),
    CHECK((kind='offer' AND claim_id IS NOT NULL) OR (kind='legacy' AND claim_id IS NULL AND attribution_id IS NOT NULL))
  )`,
  `CREATE TABLE offer_signup_intents (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, code text NOT NULL CHECK(length(code) BETWEEN 3 AND 24),
    expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
    status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','rejected','expired')),
    next_attempt_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(organization_id,user_id)
  )`,
  `CREATE INDEX offer_signup_pending_idx ON offer_signup_intents(next_attempt_at,id) WHERE status='pending'`,
  `CREATE TABLE offer_early_purchase_grants (
    id uuid PRIMARY KEY, claim_id uuid NOT NULL REFERENCES offer_claims(id), operator_user_id uuid NOT NULL,
    expires_at timestamptz NOT NULL, revoked_at timestamptz, checkout_attempt_id uuid,
    reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 300), created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX offer_early_grants_listing_idx ON offer_early_purchase_grants(created_at DESC,id DESC)`,
  `CREATE INDEX offer_early_grants_claim_idx ON offer_early_purchase_grants(claim_id,expires_at)`,
  `CREATE TABLE offer_operator_delegations (
    proof_hash text PRIMARY KEY CHECK(proof_hash ~ '^[a-f0-9]{64}$'), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_token_id uuid NOT NULL, session_id uuid NOT NULL,
    actions jsonb NOT NULL CHECK(jsonb_typeof(actions)='array'), expires_at timestamptz NOT NULL,
    revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX offer_delegation_expiry_idx ON offer_operator_delegations(expires_at)`,
  `CREATE TABLE offer_provider_bindings (
    version_id uuid PRIMARY KEY REFERENCES offer_programme_versions(id), coupon_id text NOT NULL CHECK(length(coupon_id) BETWEEN 1 AND 255),
    livemode boolean NOT NULL, configured_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE FUNCTION protect_offer_immutable_records() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'offer_record_immutable'; END IF;
    IF TG_TABLE_NAME='offer_programme_versions' AND
      (to_jsonb(NEW)-ARRAY['state','claims_count']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','claims_count'])
      THEN RAISE EXCEPTION 'offer_version_immutable'; END IF;
    IF TG_TABLE_NAME='offer_codes' AND
      (to_jsonb(NEW)-ARRAY['blocked','preferred']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['blocked','preferred'])
      THEN RAISE EXCEPTION 'offer_code_owner_immutable'; END IF;
    IF TG_TABLE_NAME IN ('offer_claim_history','offer_provider_bindings','offer_code_actions','referral_benefit_recovery_retirements') THEN RAISE EXCEPTION 'offer_record_immutable'; END IF;
    IF TG_TABLE_NAME='offer_claims' THEN
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.owner_identity_hash IS DISTINCT FROM OLD.owner_identity_hash OR
         NEW.organization_external_id IS DISTINCT FROM OLD.organization_external_id THEN RAISE EXCEPTION 'offer_identity_immutable'; END IF;
      IF OLD.eligible_invoice_id IS NOT NULL AND (
        (to_jsonb(NEW)-ARRAY['organization_id','updated_at','performance','recovery_completed_at']) IS DISTINCT FROM
        (to_jsonb(OLD)-ARRAY['organization_id','updated_at','performance','recovery_completed_at']) OR
        (OLD.recovery_completed_at IS NOT NULL AND NEW.recovery_completed_at IS DISTINCT FROM OLD.recovery_completed_at) OR
        (OLD.recovery_completed_at IS NULL AND NEW.recovery_completed_at IS NOT NULL AND OLD.recovery_invoice_id IS DISTINCT FROM OLD.eligible_invoice_id)
      ) THEN RAISE EXCEPTION 'offer_invoice_immutable'; END IF;
      IF OLD.checkout_attempt_id IS NOT NULL AND
         (NEW.version_id,NEW.code_id,NEW.attribution_id,NEW.referral_version_id,NEW.referral_code_id,NEW.redeem_by)
         IS DISTINCT FROM (OLD.version_id,OLD.code_id,OLD.attribution_id,OLD.referral_version_id,OLD.referral_code_id,OLD.redeem_by)
         THEN RAISE EXCEPTION 'offer_reserved_immutable'; END IF;
    END IF;
    RETURN NEW;
  END $$`,
  ...[
    "offer_programme_versions",
    "offer_codes",
    "offer_code_actions",
    "offer_claim_history",
    "referral_benefit_recovery_retirements",
    "offer_provider_bindings",
    "offer_claims"
  ].map(
    (table) =>
      `CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION protect_offer_immutable_records()`
  )
] as const;

export const OFFER_PROGRAMME_MIGRATION = defineStorageSchemaMigration({
  id: "202611160001_add_offer_programmes",
  description:
    "Add versioned introductory offers and permanent creator codes without changing legacy referral terms.",
  statements
});

// Explicit shape checks catch partial/manual schema upgrades before the API or
// worker consumes financial columns. Ledger checksums alone prove migration
// history, not the current presence of columns, enabled guards or constraints.
const columnShapes: Record<string, string> = {
  offer_programmes: "id:uuid! current_version_id:uuid created_at:timestamptz!",
  offer_programme_versions:
    "id:uuid! programme_id:uuid! revision:int4! name:text! public_description:text! policy:jsonb! state:text! claims_count:int4! created_by:uuid! created_at:timestamptz!",
  offer_creator_memberships:
    "partner_id:uuid! version_id:uuid! terms_version:text! accepted_at:timestamptz! preferred:bool!",
  offer_codes:
    "id:uuid! code:text! kind:text! partner_id:uuid version_id:uuid blocked:bool! preferred:bool! created_at:timestamptz!",
  offer_code_actions:
    "id:uuid! code_id:uuid! operator_user_id:uuid! action:text! reason:text! recorded_at:timestamptz!",
  offer_claims:
    "id:uuid! owner_user_id:uuid! owner_identity_hash:text! organization_id:uuid organization_external_id:uuid! version_id:uuid! code_id:uuid! attribution_id:uuid referral_version_id:uuid referral_code_id:uuid source:text! claimed_at:timestamptz! slot_released:bool! redeem_by:timestamptz revoked_at:timestamptz revoked_reason:text checkout_attempt_id:uuid coupon_id:text provider_customer_id:text provider_subscription_id:text eligible_invoice_id:text recovery_invoice_id:text recovery_requested_at:timestamptz recovery_completed_at:timestamptz performance:jsonb updated_at:timestamptz!",
  referral_benefit_recovery_retirements:
    "id:uuid! kind:text! claim_id:uuid attribution_id:uuid organization_external_id:uuid! owner_identity_hash:text! coupon_id:text! provider_customer_id:text! provider_subscription_id:text! provider_invoice_id:text! amount_due_minor:int8! base_net_minor:int8! observed_at:timestamptz! recorded_at:timestamptz!",
  offer_claim_history:
    "id:uuid! claim_id:uuid! actor_user_id:uuid! action:text! version_id:uuid! code_id:uuid! attribution_id:uuid recorded_at:timestamptz!",
  offer_signup_intents:
    "id:uuid! organization_id:uuid! user_id:uuid! code:text! expires_at:timestamptz! attempts:int4! status:text! next_attempt_at:timestamptz! created_at:timestamptz!",
  offer_early_purchase_grants:
    "id:uuid! claim_id:uuid! operator_user_id:uuid! expires_at:timestamptz! revoked_at:timestamptz checkout_attempt_id:uuid reason:text! created_at:timestamptz!",
  offer_operator_delegations:
    "proof_hash:text! user_id:uuid! member_token_id:uuid! session_id:uuid! actions:jsonb! expires_at:timestamptz! revoked_at:timestamptz created_at:timestamptz!",
  offer_provider_bindings:
    "version_id:uuid! coupon_id:text! livemode:bool! configured_by:uuid! created_at:timestamptz!"
};
const requiredColumns = Object.entries(columnShapes).flatMap(([table, columns]) =>
  columns.split(" ").map((entry) => {
    const [column, type] = entry.split(":") as [string, string];
    return {
      table_name: table,
      column_name: column,
      type_name: type.replace("!", ""),
      not_null: type.endsWith("!")
    };
  })
);
const guardedTables = [
  "offer_programme_versions",
  "offer_codes",
  "offer_code_actions",
  "offer_claim_history",
  "referral_benefit_recovery_retirements",
  "offer_provider_bindings",
  "offer_claims"
];
const expectedGuardBody = statements
  .find((sql) => sql.startsWith("CREATE FUNCTION protect_offer_immutable_records"))!
  .split("$$")[1]!;
const requiredUniqueIndexes = [
  [
    "referral_benefit_recovery_retirements_provider_invoice_id_key",
    "referral_benefit_recovery_retirements",
    ["provider_invoice_id"],
    null
  ],
  ["offer_creator_preferred_idx", "offer_creator_memberships", ["partner_id"], "preferred"],
  [
    "offer_creator_primary_code_idx",
    "offer_codes",
    ["partner_id"],
    "((kind = 'creator'::text) AND preferred)"
  ],
  ["offer_codes_code_key", "offer_codes", ["code"], null],
  ...[
    "owner_identity_hash",
    "organization_id",
    "organization_external_id",
    "attribution_id",
    "eligible_invoice_id"
  ].map((column) => [`offer_claims_${column}_key`, "offer_claims", [column], null]),
  [
    "offer_creator_memberships_pkey",
    "offer_creator_memberships",
    ["partner_id", "version_id"],
    null
  ],
  [
    "offer_signup_intents_organization_id_user_id_key",
    "offer_signup_intents",
    ["organization_id", "user_id"],
    null
  ],
  ["offer_operator_delegations_pkey", "offer_operator_delegations", ["proof_hash"], null],
  ["offer_provider_bindings_pkey", "offer_provider_bindings", ["version_id"], null],
  [
    "offer_programme_versions_programme_id_revision_key",
    "offer_programme_versions",
    ["programme_id", "revision"],
    null
  ]
].map(([index_name, table_name, columns, predicate]) => ({
  index_name,
  table_name,
  columns,
  predicate
}));
export async function offerProgrammeSchemaAvailable(db: Queryable): Promise<boolean> {
  const result = await db.query<{ available: boolean }>(
    `SELECT
  (SELECT count(*)=cardinality($1::text[]) FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[]))
  AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS expected(table_name text,column_name text,type_name text,not_null boolean)
    WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid WHERE a.attrelid=to_regclass('public.'||expected.table_name)
      AND a.attname=expected.column_name AND NOT a.attisdropped AND t.typname=expected.type_name AND a.attnotnull=expected.not_null))
  AND EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.protect_offer_immutable_records()') AND p.prosrc=$3 AND p.prorettype='trigger'::regtype)
  AND NOT EXISTS(SELECT 1 FROM unnest($4::text[]) expected(table_name) WHERE NOT EXISTS(
    SELECT 1 FROM pg_trigger t WHERE t.tgname=expected.table_name||'_immutable' AND t.tgrelid=to_regclass('public.'||expected.table_name)
      AND t.tgfoid=to_regprocedure('public.protect_offer_immutable_records()') AND t.tgenabled='O' AND t.tgtype=27 AND NOT t.tgisinternal AND t.tgqual IS NULL AND t.tgnargs=0))
  AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($5::jsonb) AS expected(index_name text,table_name text,columns text[],predicate text) WHERE NOT EXISTS(
    SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.'||expected.index_name) AND i.indrelid=to_regclass('public.'||expected.table_name)
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
      AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ord)=expected.columns
      AND pg_get_expr(i.indpred,i.indrelid) IS NOT DISTINCT FROM expected.predicate))
  AND to_regclass('public.offer_signup_pending_idx') IS NOT NULL AND to_regclass('public.offer_versions_listing_idx') IS NOT NULL
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.offer_programmes') AND conname='offer_programme_current_version_fk' AND contype='f' AND convalidated)
  AS available`,
    [
      OFFER_PROGRAMME_TABLES,
      JSON.stringify(requiredColumns),
      expectedGuardBody,
      guardedTables,
      JSON.stringify(requiredUniqueIndexes)
    ]
  );
  return result.rows[0]?.available === true;
}
