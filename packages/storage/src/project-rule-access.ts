import { getTierCapabilities } from "../../shared-types/src/index.js";

/** Expressions are repository-owned SQL, never external input. Recheck current
 * access in the fenced statement instead of trusting a prior HTTP role lookup. */
export function ruleActorAllowedSql(project: string, actor: string, creator: string): string {
  return `debugbundle_rule_actor_allowed(${project},${actor},${creator},${getTierCapabilities("free").shared_dashboards ? "true" : "false"})`;
}

/** Match the accepted origin snapshot, never widen a retained rule to the whole
 * canonical project. Both expressions must be repository-owned SQL. */
export function ruleCoversOriginSql(rule: string, origin: string): string {
  return `(${origin}=ANY(COALESCE(${rule}.scope_origin_ids,ARRAY[${rule}.project_id])) AND debugbundle_canonical_project(${rule}.project_id)=debugbundle_canonical_project(${origin}))`;
}
