import type {
  AnalyticsFlowDefinition,
  AnalyticsFlowReport
} from "../../shared-types/src/analytics-flows.js";
import type { Queryable } from "./types.js";

export async function readAnalyticsFlowReport(
  db: Queryable,
  flow: AnalyticsFlowDefinition,
  window: AnalyticsFlowReport["window"]
): Promise<AnalyticsFlowReport> {
  const params = [
    flow.id,
    flow.version,
    window.previous_from.slice(0, 10),
    window.from.slice(0, 10),
    window.to.slice(0, 10)
  ];
  const [counts, sources] = await Promise.all([
    db.query<{
      step_index: number;
      reached: string;
      previous_reached: string;
      unlinked: string;
      elapsed_ms: string;
      elapsed_count: string;
    }>(
      `SELECT step_index,
       COALESCE(SUM(reached) FILTER (WHERE cohort_date >= $4::date),0)::text reached,
       COALESCE(SUM(reached) FILTER (WHERE cohort_date < $4::date),0)::text previous_reached,
       COALESCE(SUM(unlinked) FILTER (WHERE cohort_date >= $4::date),0)::text unlinked,
       COALESCE(SUM(elapsed_ms) FILTER (WHERE cohort_date >= $4::date),0)::text elapsed_ms,
       COALESCE(SUM(elapsed_count) FILTER (WHERE cohort_date >= $4::date),0)::text elapsed_count
       FROM analytics_flow_rollups WHERE flow_id=$1 AND version=$2
       AND cohort_date >= $3::date AND cohort_date < $5::date GROUP BY step_index`,
      params
    ),
    db.query<{ source: string; campaign: string; starts: string; completions: string }>(
      `SELECT source, campaign, SUM(reached) FILTER (WHERE step_index=0)::text starts,
       SUM(reached) FILTER (WHERE step_index=$6)::text completions
       FROM analytics_flow_rollups WHERE flow_id=$1 AND version=$2
       AND cohort_date >= $4::date AND cohort_date < $5::date
       AND cohort_date >= $3::date GROUP BY source,campaign
       ORDER BY SUM(reached) FILTER (WHERE step_index=0) DESC NULLS LAST,source,campaign LIMIT 51`,
      [...params, flow.steps.length - 1]
    )
  ]);
  const steps = flow.steps.map((step, index) => {
    const row = counts.rows.find((item) => item.step_index === index);
    const reached = Number(row?.reached ?? 0);
    const next = Number(counts.rows.find((item) => item.step_index === index + 1)?.reached ?? 0);
    return {
      step_key: step.step_key,
      display_name: step.display_name,
      reached,
      previous_reached: Number(row?.previous_reached ?? 0),
      unlinked: Number(row?.unlinked ?? 0),
      dropoff: index === flow.steps.length - 1 ? 0 : Math.max(0, reached - next),
      average_seconds:
        Number(row?.elapsed_count ?? 0) === 0
          ? null
          : Number(row?.elapsed_ms) / Number(row?.elapsed_count) / 1000
    };
  });
  return {
    flow,
    window,
    starts: steps[0]?.reached ?? 0,
    previous_starts: steps[0]?.previous_reached ?? 0,
    completions: steps.at(-1)?.reached ?? 0,
    steps,
    sources: sources.rows.slice(0, 50).map((row) => ({
      source: row.source,
      campaign: row.campaign,
      starts: Number(row.starts ?? 0),
      completions: Number(row.completions ?? 0)
    })),
    coverage: {
      observation: "explicit_integration_signals",
      incomplete: true,
      sources_truncated: sources.rows.length > 50
    }
  };
}
