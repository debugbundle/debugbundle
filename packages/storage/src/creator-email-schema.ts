import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const CREATOR_EMAIL_TABLES = [
  "referral_creator_email_state",
  "referral_creator_email_events",
  "referral_creator_email_deliveries"
] as const;
const statements = [
  `CREATE TABLE referral_creator_email_state (
    id boolean PRIMARY KEY DEFAULT true CHECK(id), started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    digest_window_end timestamptz NOT NULL DEFAULT ((date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+interval '1 day'))`,
  `INSERT INTO referral_creator_email_state(id) VALUES(true)`,
  `CREATE TABLE referral_creator_email_deliveries (
    id uuid PRIMARY KEY,partner_id uuid NOT NULL REFERENCES referral_partners(id),user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    kind text NOT NULL CONSTRAINT creator_email_kind CHECK(kind IN ('joined','first_purchase','daily_digest')),dedupe_key text NOT NULL,
    payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
    status text NOT NULL DEFAULT 'queued' CONSTRAINT creator_email_status CHECK(status IN ('queued','claimed','sending','sent','uncertain','skipped','failed')),
    attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),token uuid,lease_until timestamptz,
    next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),reason text,provider_message_id text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),sent_at timestamptz,
    CONSTRAINT creator_email_dedupe UNIQUE(partner_id,kind,dedupe_key),CONSTRAINT creator_email_lease CHECK(status NOT IN ('claimed','sending') OR (token IS NOT NULL AND lease_until IS NOT NULL)))`,
  `CREATE INDEX referral_creator_email_due_idx ON referral_creator_email_deliveries(next_attempt_at,id) WHERE status IN ('queued','claimed','sending')`,
  `CREATE TABLE referral_creator_email_events (
    id uuid PRIMARY KEY,partner_id uuid NOT NULL REFERENCES referral_partners(id),programme_id uuid NOT NULL REFERENCES offer_programmes(id),
    version_id uuid NOT NULL REFERENCES offer_programme_versions(id),attribution_id uuid NOT NULL CONSTRAINT creator_email_attribution_once UNIQUE REFERENCES referral_attributions(id),
    invoice_id text NOT NULL,name text NOT NULL,commission_minor bigint NOT NULL CHECK(commission_minor>=0),
    first_in_programme boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    digest_id uuid REFERENCES referral_creator_email_deliveries(id))`,
  `CREATE UNIQUE INDEX referral_creator_email_first_idx ON referral_creator_email_events(partner_id,programme_id) WHERE first_in_programme`,
  `CREATE INDEX referral_creator_email_events_due_idx ON referral_creator_email_events(created_at,partner_id) WHERE NOT first_in_programme AND digest_id IS NULL`
];
const shape = `to_regclass('public.referral_creator_email_state') IS NOT NULL
 AND to_regclass('public.referral_creator_email_events') IS NOT NULL
 AND to_regclass('public.referral_creator_email_deliveries') IS NOT NULL
 AND to_regclass('public.referral_creator_email_first_idx') IS NOT NULL
 AND to_regclass('public.referral_creator_email_due_idx') IS NOT NULL
 AND to_regclass('public.referral_creator_email_events_due_idx') IS NOT NULL
 AND (SELECT count(*)=3 FROM information_schema.columns WHERE table_schema='public' AND table_name='referral_creator_email_state' AND column_name IN ('id','started_at','digest_window_end'))
 AND (SELECT count(*)=11 FROM information_schema.columns WHERE table_schema='public' AND table_name='referral_creator_email_events' AND column_name IN ('id','partner_id','programme_id','version_id','attribution_id','invoice_id','name','commission_minor','first_in_programme','created_at','digest_id'))
 AND (SELECT count(*)=15 FROM information_schema.columns WHERE table_schema='public' AND table_name='referral_creator_email_deliveries' AND column_name IN ('id','partner_id','user_id','kind','dedupe_key','payload','status','attempt','token','lease_until','next_attempt_at','reason','provider_message_id','created_at','sent_at'))
 AND (SELECT count(*)=4 FROM pg_constraint WHERE conrelid=to_regclass('public.referral_creator_email_deliveries') AND convalidated AND conname IN ('creator_email_kind','creator_email_status','creator_email_dedupe','creator_email_lease'))
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.referral_creator_email_events') AND convalidated AND conname='creator_email_attribution_once' AND contype='u')
 AND EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.referral_creator_email_first_idx') AND indrelid=to_regclass('public.referral_creator_email_events') AND indisunique AND indisvalid)`;
export const CREATOR_EMAIL_MIGRATION = defineStorageSchemaMigration({
  id: "202611170001_add_creator_referral_emails",
  description:
    "Queue private creator programme confirmations, first-purchase celebrations and conditional daily summaries.",
  statements: [
    ...statements,
    `DO $$ BEGIN IF NOT (${shape}) THEN RAISE EXCEPTION 'creator_email_schema_incomplete'; END IF; END $$`
  ]
});
export async function creatorEmailSchemaAvailable(db: Queryable): Promise<boolean> {
  const row = (await db.query<{ ready: boolean }>(`SELECT ${shape} AS ready`, [])).rows[0];
  if (!row?.ready) return false;
  return (
    (
      await db.query<{ ready: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM referral_creator_email_state WHERE id) AS ready",
        []
      )
    ).rows[0]?.ready === true
  );
}
