import { getTierCapabilities } from "../../shared-types/src/index.js";
import type {
  CaptureRule,
  CaptureRuleCreate,
  CaptureRuleUpdate
} from "../../shared-types/src/index.js";
import { createPostgresCaptureRuleStore } from "./capture-rule-store.js";
import type { Queryable } from "./types.js";
import type { PostgresMetadataStoreOptions } from "./metadata-shared.js";
import { runInTransaction } from "./transaction.js";

interface ManagementScope {
  organization_id: string;
  project_id: string;
  actor_user_id?: string;
}
export interface CaptureRuleManagement {
  listCaptureRulesForProject(input: ManagementScope): Promise<CaptureRule[]>;
  listActiveCaptureRulesForProject(input: {
    project_id: string;
    now: string;
  }): Promise<CaptureRule[]>;
  createCaptureRuleForProject(
    input: ManagementScope & { id: string; create: CaptureRuleCreate }
  ): Promise<CaptureRule | null>;
  updateCaptureRuleForProject(
    input: ManagementScope & { rule_id: string; update: CaptureRuleUpdate }
  ): Promise<CaptureRule | null>;
  deleteCaptureRuleForProject(input: ManagementScope & { rule_id: string }): Promise<boolean>;
  recordCaptureRuleMatch(input: {
    project_id: string;
    rule_id: string;
    matched_at: string;
  }): Promise<void>;
}

async function projectAllowed(
  db: Queryable,
  input: ManagementScope,
  write: boolean
): Promise<boolean> {
  if (write)
    await db.query("SELECT debugbundle_assert_canonical_project_write($1::uuid)", [
      input.project_id
    ]);
  const result = await db.query<{ id: string; organization_plan: string; actor_is_owner: boolean }>(
    `
    SELECT p.id,COALESCE(o.plan,'free') AS organization_plan,(p.owner_user_id=$3::uuid) AS actor_is_owner FROM projects p JOIN organizations o ON o.id=p.organization_id
    WHERE p.id=debugbundle_canonical_project($1::uuid) AND p.organization_id=$2 AND o.suspended_at IS NULL
      AND ($3::uuid IS NULL OR p.owner_user_id=$3 OR EXISTS(SELECT 1 FROM project_members pm
        WHERE pm.project_id=p.id AND pm.user_id=$3 AND (NOT $4::boolean OR pm.role='admin')))`,
    [input.project_id, input.organization_id, input.actor_user_id ?? null, write]
  );
  const project = result.rows[0];
  return (
    project !== undefined &&
    (input.actor_user_id === undefined ||
      project.actor_is_owner ||
      getTierCapabilities(project.organization_plan).shared_dashboards)
  );
}

/** HTTP/CLI/MCP use the same fenced domain. Actor checks run under the root lock;
 * internal organisation-scoped callers keep their established trusted boundary. */
export function createCaptureRuleManagement(
  db: Queryable,
  options: PostgresMetadataStoreOptions = {}
): CaptureRuleManagement {
  const store = createPostgresCaptureRuleStore(db);
  return {
    async listCaptureRulesForProject(input) {
      return (await projectAllowed(db, input, false))
        ? store.listCaptureRulesByProjectId(input.project_id)
        : [];
    },
    listActiveCaptureRulesForProject: (input) => store.listActiveCaptureRulesByProjectId(input),
    async createCaptureRuleForProject(input) {
      return runInTransaction(db, async (tx) => {
        if (!(await projectAllowed(tx, input, true))) return null;
        const rule = await createPostgresCaptureRuleStore(tx).createCaptureRule({
          id: input.id,
          project_id: input.project_id,
          ...input.create
        });
        await options.accountAnalyticsStore?.withDb(tx).recordMetricDeltas({
          organization_id: input.organization_id,
          occurred_at: rule.created_at,
          source: "capture_rule_created",
          dedupe_key: `capture_rule_created:${rule.id}`,
          deltas: { capture_rules_created: 1 }
        });
        return rule;
      });
    },
    async updateCaptureRuleForProject(input) {
      return runInTransaction(db, async (tx) => {
        if (!(await projectAllowed(tx, input, true))) return null;
        const update = {
          ...input.update,
          ...(input.update.action && input.update.action !== "sample"
            ? { sample_rate: null, sample_event_class: null }
            : {})
        };
        return createPostgresCaptureRuleStore(tx).updateCaptureRule({
          id: input.rule_id,
          project_id: input.project_id,
          ...update
        });
      });
    },
    async deleteCaptureRuleForProject(input) {
      return runInTransaction(db, async (tx) => {
        if (!(await projectAllowed(tx, input, true))) return false;
        const deleted = await createPostgresCaptureRuleStore(tx).deleteCaptureRule({
          id: input.rule_id,
          project_id: input.project_id
        });
        if (deleted)
          await options.accountAnalyticsStore?.withDb(tx).recordMetricDeltas({
            organization_id: input.organization_id,
            occurred_at: new Date().toISOString(),
            source: "capture_rule_deleted",
            dedupe_key: `capture_rule_deleted:${input.rule_id}`,
            deltas: { capture_rules_deleted: 1 }
          });
        return deleted;
      });
    },
    recordCaptureRuleMatch: (input) =>
      store.recordCaptureRuleMatch({
        id: input.rule_id,
        project_id: input.project_id,
        matched_at: input.matched_at
      })
  };
}
