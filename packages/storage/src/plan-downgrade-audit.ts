import type { TierName } from "../../shared-types/src/index.js";

import { createPostgresAuditLogStore } from "./audit-log-store.js";
import type { OrganizationPlanCleanupSummary } from "./plan-downgrade-cleanup.js";
import type { Queryable } from "./types.js";

export type PlanDowngradeTriggerSource =
  | "trial_expiry"
  | "stripe_sync"
  | "checkout_confirmation"
  | "admin_override";

const PLAN_RANK: Record<TierName, number> = {
  free: 0,
  solo: 1,
  team: 2
};

export function normalizePlanForDowngradeAudit(plan: string | null | undefined): TierName {
  return plan === "solo" || plan === "team" ? plan : "free";
}

export function isPlanDowngrade(previousPlan: TierName, targetPlan: TierName): boolean {
  return PLAN_RANK[targetPlan] < PLAN_RANK[previousPlan];
}

export async function recordPlanDowngradeCleanupAudit(input: {
  db: Queryable;
  organization_id: string;
  previous_plan: TierName;
  target_plan: TierName;
  trigger_source: PlanDowngradeTriggerSource;
  cleanup_summary: OrganizationPlanCleanupSummary;
  occurred_at: string;
}): Promise<void> {
  await createPostgresAuditLogStore(input.db).createAuditLog({
    organization_id: input.organization_id,
    actor_user_id: null,
    actor_type: "system",
    action: "billing.plan_downgrade_cleanup",
    target_type: "organization",
    target_id: input.organization_id,
    status: "success",
    ip_address: null,
    metadata: {
      previous_plan: input.previous_plan,
      target_plan: input.target_plan,
      trigger_source: input.trigger_source,
      cleanup_summary: input.cleanup_summary
    },
    occurred_at: input.occurred_at
  });
}
