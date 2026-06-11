import type { AccountAnalyticsStore, AccountMetricKey } from "../../../packages/storage/src/index.js";

export interface WorkerAccountAnalyticsDependencies {
  accountAnalyticsStore?: Pick<AccountAnalyticsStore, "recordMetricDeltas">;
  resolveOrganizationIdForProject?: (projectId: string) => Promise<string | null>;
  logger?: {
    warn?: (bindings: Record<string, unknown>, message: string) => void;
  };
}

export async function recordProjectMetricDeltas(
  dependencies: WorkerAccountAnalyticsDependencies,
  input: {
    projectId: string;
    occurredAt: string;
    source: string;
    dedupeKey: string;
    deltas: Partial<Record<AccountMetricKey, number>>;
  }
): Promise<void> {
  if (
    dependencies.accountAnalyticsStore === undefined ||
    dependencies.resolveOrganizationIdForProject === undefined
  ) {
    return;
  }

  try {
    const organizationId = await dependencies.resolveOrganizationIdForProject(input.projectId);
    if (organizationId === null) {
      return;
    }

    await dependencies.accountAnalyticsStore.recordMetricDeltas({
      organization_id: organizationId,
      occurred_at: input.occurredAt,
      source: input.source,
      dedupe_key: input.dedupeKey,
      deltas: input.deltas
    });
  } catch (error) {
    dependencies.logger?.warn?.(
      {
        err: error,
        project_id: input.projectId,
        metric_source: input.source
      },
      "worker_account_analytics_record_failed"
    );
  }
}
