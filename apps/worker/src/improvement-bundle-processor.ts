import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import {
  buildImprovementBundleRegenerationLeaseKey,
  type BuildImprovementBundleJob
} from "../../../packages/storage/src/index.js";
import { getTierCapabilities } from "../../../packages/shared-types/src/index.js";
import {
  generateRecordedHostedImprovementBundle,
  type ImprovementBundleWorkerDependencies
} from "./improvement-bundles.js";
import { getImprovementRuleThresholds } from "./improvement-rules.js";

export interface ImprovementBundleJobQueue {
  dequeue(jobName: "build-improvement-bundle"): Promise<BuildImprovementBundleJob | null>;
  releaseLease?(key: string): Promise<void>;
}

function getImprovementWorkerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

export async function processNextBuildImprovementBundleJob(input: {
  queue: ImprovementBundleJobQueue;
  dependencies: ImprovementBundleWorkerDependencies;
  logger?: RuntimeLogger;
}): Promise<{ processed: boolean }> {
  const job = await input.queue.dequeue("build-improvement-bundle");
  if (job === null) {
    return { processed: false };
  }

  try {
    const store = input.dependencies.improvementOpportunityStore;
    if (store === undefined) {
      return { processed: true };
    }

    const settings = await store.getImprovementExecutionSettings(job.project_id);
    if (
      settings === null ||
      !getTierCapabilities(settings.plan).cloud_improvement_bundles ||
      !settings.automated_improvement_bundles_enabled
    ) {
      await store.markImprovementBundleGenerationFailure({
        opportunity_id: job.opportunity_id,
        reason: "bundle_generation_disabled"
      });
      return { processed: true };
    }

    await generateRecordedHostedImprovementBundle({
      project_id: job.project_id,
      event_id: job.event_id,
      ...(job.event_type === undefined ? {} : { event_type: job.event_type }),
      occurred_at: job.occurred_at,
      recorded: {
        opportunity_id: job.opportunity_id,
        occurrence_count: job.occurrence_count,
        bundle_generation_number: 0,
        should_generate_bundle: true
      },
      thresholds: getImprovementRuleThresholds(settings.improvement_bundle_sensitivity),
      dependencies: input.dependencies
    });
  } catch (error) {
    input.logger?.error(
      {
        error_message: getImprovementWorkerErrorMessage(error),
        opportunity_id: job.opportunity_id,
        project_id: job.project_id,
        trigger: job.trigger
      },
      "worker_build_improvement_bundle_failed"
    );
    await input.dependencies.improvementOpportunityStore?.markImprovementBundleGenerationFailure({
      opportunity_id: job.opportunity_id,
      reason: "build_error"
    });
  } finally {
    await input.queue.releaseLease?.(buildImprovementBundleRegenerationLeaseKey(job.opportunity_id));
  }

  return { processed: true };
}
