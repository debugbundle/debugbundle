import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import { createApiServer } from "../apps/api/src/server.js";
import { createDefaultOffers } from "../apps/api/src/default-offers.js";
import { bootstrapStorageSchemaIfEmpty } from "../packages/storage/src/migrations.js";
import {
  migrateStorageSchema,
  assertStorageSchemaMigrationsApplied
} from "../packages/storage/src/schema-migrations.js";
import { createOfferProgrammeStore } from "../packages/storage/src/offer-programme-store.js";
import type { Queryable } from "../packages/storage/src/types.js";

const database = "debugbundle_referral_review";
const secret = "synthetic-local-referral-review-only-not-a-production-secret";
const operator = "00000000-0000-4000-8000-000000000901";
const creator = "00000000-0000-4000-8000-000000000902";

/** Local public-page review only. No real credentials, authentication, Checkout,
 * ingestion, mail or provider transport is supplied. Use actual offer routes and
 * storage, but refuse every database except the dedicated disposable review DB. */
export async function createReferralPublicReview(db: Queryable): Promise<FastifyInstance> {
  const current = (await db.query<{ name: string }>("SELECT current_database() AS name", []))
    .rows[0];
  if (current?.name !== database) throw new Error("referral_review_database_required");
  await bootstrapStorageSchemaIfEmpty(db);
  await migrateStorageSchema(db);
  for (const [id, email] of [
    [operator, "operator@referral-review.invalid"],
    [creator, "creator@referral-review.invalid"]
  ])
    await db.query(
      "INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now()) ON CONFLICT(id) DO NOTHING",
      [id, email]
    );
  const store = createOfferProgrammeStore(db, {
    identityHashSecret: secret,
    newClaimsEnabled: true
  });
  let version = (await store.list({ limit: 100 })).find(
    (item) => item.policy.terms_version === "local-review-only"
  );
  if (!version) {
    const draft = await store.createDraft({
      actor_user_id: operator,
      name: "Local review referral programme",
      public_description:
        "Synthetic programme for internal review. These terms and the REVIEW20 code are local examples, not a live promotion.",
      policy: {
        kind: "referral",
        discount_basis_points: 2000,
        eligible_plans: ["solo", "team", "business"],
        eligible_intervals: ["month", "year"],
        commission_basis_points: 5000,
        commission_months: 12,
        claims_start_at: "2026-01-01T00:00:00.000Z",
        claims_end_at: null,
        redeem_by: null,
        max_claims: 100,
        allow_early_purchase_grants: false,
        terms_version: "local-review-only"
      }
    });
    await store.bindProvider({
      actor_user_id: operator,
      version_id: draft.version_id,
      coupon_id: "synthetic_local_review_no_provider",
      livemode: false
    });
    version = await store.setState({
      actor_user_id: operator,
      version_id: draft.version_id,
      expected_state: "draft",
      state: "active",
      acknowledge_unlimited: false
    });
  }
  await store.creators.join({
    user_id: creator,
    version_id: version.version_id,
    terms_version: version.policy.terms_version
  });
  await store.creators.claimCode({ user_id: creator, code: "REVIEW20" });
  const unsupported = async (): Promise<never> => {
    throw new Error("local_review_public_only");
  };
  return createApiServer(
    {
      offers: createDefaultOffers({
        db,
        config: {
          secret,
          enrollmentEnabled: false,
          publicApiUrl: "http://localhost:3003",
          publicLandingUrl: "http://localhost:5292/"
        },
        enabled: true,
        operatorEmails: [],
        appBaseUrl: "http://localhost:5291"
      }),
      ingestionPersistence: { persistAndEnqueue: unsupported },
      ingestionMetadata: { resolveProjectByTokenHash: async (): Promise<null> => null },
      memberAuth: { resolveMemberByTokenHash: async (): Promise<null> => null },
      tokenManagement: {
        listProjectTokensForOrganization: unsupported,
        createProjectTokenForOrganization: unsupported,
        revokeProjectTokenForOrganization: unsupported,
        listMemberTokensForOrganization: unsupported,
        createMemberTokenForOrganization: unsupported,
        revokeMemberTokenForOrganization: unsupported
      },
      incidentRetrieval: {
        listIncidentsForOrganization: unsupported,
        getIncidentForOrganization: unsupported,
        listIncidentLogsForOrganization: unsupported
      },
      objectStoreReader: { getObject: unsupported },
      webhookDelivery: { listDeliveriesForWebhookInOrganization: unsupported }
    },
    {
      dogfoodingEnv: { NODE_ENV: "development" },
      readinessCheck: () => assertStorageSchemaMigrationsApplied(db)
    }
  );
}

async function main(): Promise<void> {
  if (process.env["REFERRAL_PUBLIC_REVIEW"] !== "1" || process.env["NODE_ENV"] === "production")
    throw new Error("referral_public_review_opt_in_required");
  // Fixed isolated-network destination; DATABASE_URL and everyday DB_* values
  // are intentionally not accepted by this review-only entry point.
  const pool = new Pool({
    host: "postgres",
    port: 5432,
    database,
    user: "review",
    password: "local-review-only"
  });
  const db: Queryable = {
    query: (sql, params) => pool.query(sql, params),
    transaction: async (work) => {
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const result = await work({ query: (sql, params) => connection.query(sql, params) });
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    }
  };
  const app = await createReferralPublicReview(db);
  const close = (): void => {
    void app.close().then(() => pool.end());
  };
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
  await app.listen({ host: "0.0.0.0", port: 3003 });
  process.stdout.write(
    "Local public referral review API ready; synthetic REVIEW20; no live provider.\n"
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch(() => {
    process.stderr.write("referral_public_review_failed\n");
    process.exitCode = 1;
  });
