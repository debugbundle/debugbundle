import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportRunAdmissionStore } from "../../packages/storage/src/report-run-admission.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import { actualReportAttemptCost } from "../../packages/smart-reports/src/model-cost.js";
import type { Queryable } from "../../packages/storage/src/types.js";
export const reportTestUsage = {
  input_tokens: 100,
  output_tokens: 20,
  total_tokens: 120,
  input_tokens_details: {
    cached_tokens: 0,
    cache_write_tokens: 0,
    cache_write_tokens_details: { ttl_30m_tokens: 0, ttl_12h_tokens: 0 }
  },
  output_tokens_details: { reasoning_tokens: 0 }
};
export const reportTestCost = actualReportAttemptCost({
  model: "gpt-6.1-terra",
  regional_processing: true,
  usage: reportTestUsage
});
export const reportTestReceipt = () => ({
  state: "rejected" as const,
  reason: "report_output_incomplete",
  usage: reportTestUsage,
  cost_nano_usd: reportTestCost,
  provider_response_id: `resp_${randomUUID()}`,
  elapsed_ms: 50
});

export async function resetReportRunFixture(
  pool: Pool,
  db: Queryable,
  options: { privacy_mode?: "full" | "restricted"; plan?: "solo" | "team" | "business" } = {}
) {
  const definitions = createReportDefinitionStore(db);
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await bootstrapStorageSchema(db);
  const org = randomUUID();
  const project = randomUUID();
  const owner = randomUUID();
  await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
    owner,
    `${owner}@example.test`
  ]);
  await pool.query(
    "INSERT INTO organizations(id,name,slug,plan,additional_capacity_units) VALUES($1::uuid,'Reports',$1::text,$2,99)",
    [org, options.plan ?? "business"]
  );
  await pool.query(
    "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
    [randomUUID(), org, owner]
  );
  await pool.query(
    "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Project',$1::text)",
    [project, org, owner]
  );
  const actor = () => ({ version: 1 as const, kind: "browser_session" as const, user_id: owner });
  const definition = (
    await definitions.create({
      organization_id: org,
      initiator: actor(),
      request_id: randomUUID(),
      definition: {
        name: "Monthly review",
        cadence: "monthly",
        project_ids: [project],
        recipient_user_ids: [],
        source_collection_consent: true,
        privacy_mode: options.privacy_mode ?? "full",
        schedule: { time: "09:00", timezone: "UTC" },
        enabled: true
      }
    })
  ).id;

  const store = createReportRunAdmissionStore(db, { profile: reportModelProfile("gpt-6.1-terra") });
  const admit = (request_id = randomUUID()) =>
    store.admit({
      organization_id: org,
      initiator: actor(),
      request_id,
      definition_id: definition,
      expected_version: 1,
      period: lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z"),
      kind: "manual"
    });
  return { org, project, owner, definition, admit };
}
