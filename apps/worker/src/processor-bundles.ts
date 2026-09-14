import { gunzipSync, gzipSync } from "node:zlib";
import { buildBundle } from "../../../packages/bundle-engine/src/index.js";
import { buildReproduction } from "../../../packages/repro-engine/src/index.js";
import type {
  BuildReproductionJob,
  ObjectStoreClient
} from "../../../packages/storage/src/index.js";
import {
  buildBundleRegenerationLeaseKey,
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildReproductionObjectKey,
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications,
  queueRetentionRotationNotice
} from "../../../packages/storage/src/index.js";
import { BundleV1Schema, type BundleV1 } from "../../../packages/shared-types/src/index.js";
import {
  recordProjectMetricDeltas,
  type WorkerAccountAnalyticsDependencies
} from "./account-analytics.js";
import {
  loadIncidentEnvelopes,
  collectProbeDataItems,
  collectCorrelatedLogEnvelopes
} from "./processor-bundle-context.js";
import {
  type BuildBundleWorkerDependencies,
  type BuildReproductionWorkerDependencies,
  buildWorkerBundleLinkBaseUrls,
  type WorkerProcessResult,
  getWorkerErrorMessage
} from "./processor-shared.js";

export async function deletePrunedBundleArtifacts(input: {
  objectStore: Pick<Partial<ObjectStoreClient>, "deleteObject">;
  owner:
    | {
        owner_type: "incident";
        project_id: string;
        incident_id: string;
        improvement_opportunity_id: null;
      }
    | {
        owner_type: "improvement";
        project_id: string;
        incident_id: null;
        improvement_opportunity_id: string;
      };
}): Promise<void> {
  if (input.owner.owner_type === "incident") {
    await input.objectStore.deleteObject?.({
      key: buildBundleObjectKey(input.owner.project_id, input.owner.incident_id)
    });

    await input.objectStore.deleteObject?.({
      key: buildReproductionObjectKey(input.owner.project_id, input.owner.incident_id)
    });

    return;
  }

  await input.objectStore.deleteObject?.({
    key: buildImprovementBundleObjectKey(
      input.owner.project_id,
      input.owner.improvement_opportunity_id
    )
  });
}

export async function processNextBuildBundleJob(
  dependencies: BuildBundleWorkerDependencies & WorkerAccountAnalyticsDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("build-bundle");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  try {
    const incident = await dependencies.incidentStore.getBundleBuildContext({
      project_id: job.project_id,
      incident_id: job.incident_id
    });
    if (incident === null) {
      return { processed: false, reason: "incident_missing" };
    }

    const alreadyRecorded =
      (await dependencies.incidentStore.hasBundleGenerationForSourceEvent?.({
        incident_id: job.incident_id,
        event_id: job.event_id
      })) ?? false;

    let billingSummary: Awaited<
      ReturnType<
        NonNullable<BuildBundleWorkerDependencies["billingStore"]>["getBillingSummaryForProject"]
      >
    > | null = null;

    if (!alreadyRecorded && dependencies.billingStore !== undefined) {
      billingSummary = await dependencies.billingStore.getBillingSummaryForProject({
        project_id: incident.project_id,
        now: new Date().toISOString()
      });
      const allowance = billingSummary?.allowances.monthly_bundle_requests;

      if (billingSummary !== null && allowance !== undefined && allowance.used >= allowance.limit) {
        if (dependencies.operationalEmailDeliveryStore !== undefined) {
          await queueAllowanceLimitReachedNotification({
            store: dependencies.operationalEmailDeliveryStore,
            project_id: incident.project_id,
            meter: "monthly_bundle_requests",
            used: allowance.used,
            limit: allowance.limit,
            usage_window_starts_at: billingSummary.usage_window.starts_at,
            usage_window_ends_at: billingSummary.usage_window.ends_at
          });
        }
        await dependencies.incidentStore.markBundleGenerationFailure?.({
          incident_id: incident.incident_id,
          reason: "monthly_quota_exceeded"
        });
        await recordProjectMetricDeltas(dependencies, {
          projectId: incident.project_id,
          occurredAt: job.occurred_at,
          source: "worker.build_bundle",
          dedupeKey: `failure_bundle_generation_failed:${job.incident_id}:${job.event_id}`,
          deltas: {
            failure_bundle_generations_failed: 1
          }
        });

        return { processed: true, reason: "monthly_quota_exceeded" };
      }
    }

    const bundleMetadata = await dependencies.incidentStore.reserveBundleGeneration({
      incident_id: job.incident_id,
      event_id: job.event_id,
      occurred_at: job.occurred_at,
      trigger: job.trigger
    });
    const incidentEnvelopes = await loadIncidentEnvelopes({
      dependencies,
      incidentId: incident.incident_id,
      projectId: incident.project_id
    });
    const correlatedLogEnvelopes = await collectCorrelatedLogEnvelopes({
      dependencies,
      incident,
      incidentEnvelopes
    });
    const probeDataItems = await collectProbeDataItems({
      dependencies,
      incident,
      incidentEnvelopes
    });
    const workerEnv = dependencies.env ?? process.env;
    const workloadDeploy =
      incident.service_id === null
        ? null
        : await dependencies.incidentStore.getDeploymentForServiceAt?.({
            project_id: incident.project_id,
            service_id: incident.service_id,
            environment: incident.environment,
            occurred_at: bundleMetadata.source_occurred_at
          });
    const bundle = buildBundle({
      ...(workloadDeploy == null ? {} : { configuredDeploy: workloadDeploy }),
      job: {
        trigger: bundleMetadata.trigger
      },
      incident,
      linkBaseUrls: buildWorkerBundleLinkBaseUrls(workerEnv),
      bundleMetadata: {
        generation_number: bundleMetadata.generation_number,
        created_at: bundleMetadata.created_at,
        updated_at: bundleMetadata.updated_at,
        source_event_id: bundleMetadata.source_event_id,
        source_occurred_at: bundleMetadata.source_occurred_at
      },
      sourceEnvelopes: [...incidentEnvelopes, ...correlatedLogEnvelopes].map(
        (incidentEnvelope) => incidentEnvelope.envelope
      ),
      probeDataItems: probeDataItems
    });

    const body = gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"));
    const key = buildBundleObjectKey(job.project_id, job.incident_id);

    await dependencies.objectStore.putObject({
      key,
      body,
      contentType: "application/json",
      contentEncoding: "gzip"
    });
    await recordProjectMetricDeltas(dependencies, {
      projectId: incident.project_id,
      occurredAt: job.occurred_at,
      source: "worker.build_bundle",
      dedupeKey: `failure_bundle_generation:${job.incident_id}:${bundleMetadata.generation_number}`,
      deltas: {
        [bundleMetadata.generation_number > 1
          ? "failure_bundles_updated"
          : "failure_bundles_created"]: 1
      }
    });

    if (
      !alreadyRecorded &&
      billingSummary !== null &&
      dependencies.operationalEmailDeliveryStore !== undefined
    ) {
      const bundleAllowance = billingSummary.allowances.monthly_bundle_requests;
      await queueAllowanceThresholdNotifications({
        store: dependencies.operationalEmailDeliveryStore,
        project_id: incident.project_id,
        meter: "monthly_bundle_requests",
        previous_used: bundleAllowance.used,
        next_used: bundleAllowance.used + 1,
        limit: bundleAllowance.limit,
        usage_window_starts_at: billingSummary.usage_window.starts_at,
        usage_window_ends_at: billingSummary.usage_window.ends_at
      });
    }

    if (
      dependencies.billingStore !== undefined &&
      dependencies.incidentStore.pruneRetainedBundleOwnersForProject !== undefined &&
      dependencies.objectStore.deleteObject !== undefined
    ) {
      const hadPreBuildBillingSummary = billingSummary !== null;
      billingSummary ??= await dependencies.billingStore.getBillingSummaryForProject({
        project_id: incident.project_id,
        now: new Date().toISOString()
      });

      const retainedAllowance = billingSummary?.allowances.retained_bundle_cap;

      if (retainedAllowance !== undefined) {
        if (dependencies.operationalEmailDeliveryStore !== undefined) {
          const previousRetainedUsed = hadPreBuildBillingSummary
            ? retainedAllowance.used
            : Math.max(0, retainedAllowance.used - 1);
          const nextRetainedUsed = hadPreBuildBillingSummary
            ? Math.min(retainedAllowance.limit, retainedAllowance.used + 1)
            : retainedAllowance.used;
          await queueAllowanceThresholdNotifications({
            store: dependencies.operationalEmailDeliveryStore,
            project_id: incident.project_id,
            meter: "retained_bundle_cap",
            previous_used: previousRetainedUsed,
            next_used: nextRetainedUsed,
            limit: retainedAllowance.limit
          });
        }

        const prunedOwners = await dependencies.incidentStore.pruneRetainedBundleOwnersForProject({
          project_id: incident.project_id,
          retained_bundle_limit: retainedAllowance.limit
        });

        for (const prunedOwner of prunedOwners) {
          await deletePrunedBundleArtifacts({
            objectStore: dependencies.objectStore,
            owner: prunedOwner
          });
        }

        if (dependencies.operationalEmailDeliveryStore !== undefined && prunedOwners.length > 0) {
          await queueRetentionRotationNotice({
            store: dependencies.operationalEmailDeliveryStore,
            project_id: incident.project_id,
            rotated_owner_count: prunedOwners.length,
            retained_bundle_limit: retainedAllowance.limit,
            dedupe_date: new Date().toISOString().slice(0, 10)
          });
        }
        if (prunedOwners.length > 0) {
          await recordProjectMetricDeltas(dependencies, {
            projectId: incident.project_id,
            occurredAt: job.occurred_at,
            source: "worker.build_bundle",
            dedupeKey: `retention_bundle_rotation:failure:${job.incident_id}:${bundleMetadata.generation_number}`,
            deltas: {
              retention_bundle_owners_rotated: prunedOwners.length
            }
          });
        }
      }
    }

    const reproductionJob: BuildReproductionJob = {
      project_id: job.project_id,
      incident_id: job.incident_id,
      bundle_key: key,
      bundle_version: 1,
      occurred_at: job.occurred_at
    };

    if (dependencies.queue.readJobQueue !== undefined) {
      const queued = await dependencies.queue.readJobQueue("build-reproduction");
      const serialized = JSON.stringify(reproductionJob);
      if (!queued.includes(serialized)) {
        await dependencies.queue.enqueue("build-reproduction", reproductionJob);
      }
    } else {
      await dependencies.queue.enqueue("build-reproduction", reproductionJob);
    }
  } catch (error) {
    dependencies.logger?.error(
      {
        event_id: job.event_id,
        error_message: getWorkerErrorMessage(error),
        incident_id: job.incident_id,
        project_id: job.project_id,
        trigger: job.trigger
      },
      "worker_build_bundle_failed"
    );
    await dependencies.incidentStore.markBundleGenerationFailure?.({
      incident_id: job.incident_id,
      reason: "build_error"
    });
    await recordProjectMetricDeltas(dependencies, {
      projectId: job.project_id,
      occurredAt: job.occurred_at,
      source: "worker.build_bundle",
      dedupeKey: `failure_bundle_generation_failed:${job.incident_id}:${job.event_id}`,
      deltas: {
        failure_bundle_generations_failed: 1
      }
    });

    throw error;
  } finally {
    await dependencies.queue.releaseLease?.(buildBundleRegenerationLeaseKey(job.incident_id));
  }

  return { processed: true };
}

export async function processNextBuildReproductionJob(
  dependencies: BuildReproductionWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("build-reproduction");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  let compressedBundle: Buffer;
  try {
    compressedBundle = await dependencies.objectStore.getObject({ key: job.bundle_key });
  } catch {
    await recordProjectMetricDeltas(dependencies, {
      projectId: job.project_id,
      occurredAt: job.occurred_at,
      source: "worker.build_reproduction",
      dedupeKey: `reproduction_failed:${job.incident_id}:bundle_missing:${job.occurred_at}`,
      deltas: {
        reproductions_failed: 1
      }
    });
    return { processed: false, reason: "bundle_missing" };
  }

  let bundle: BundleV1;
  try {
    bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(compressedBundle).toString("utf8")));
  } catch {
    await recordProjectMetricDeltas(dependencies, {
      projectId: job.project_id,
      occurredAt: job.occurred_at,
      source: "worker.build_reproduction",
      dedupeKey: `reproduction_failed:${job.incident_id}:bundle_invalid:${job.occurred_at}`,
      deltas: {
        reproductions_failed: 1
      }
    });
    return { processed: false, reason: "bundle_invalid" };
  }

  const reproduction = buildReproduction(bundle);
  const body = gzipSync(Buffer.from(JSON.stringify(reproduction), "utf8"));

  try {
    await dependencies.objectStore.putObject({
      key: buildReproductionObjectKey(job.project_id, job.incident_id),
      body,
      contentType: "application/json",
      contentEncoding: "gzip"
    });
  } catch {
    await recordProjectMetricDeltas(dependencies, {
      projectId: job.project_id,
      occurredAt: job.occurred_at,
      source: "worker.build_reproduction",
      dedupeKey: `reproduction_failed:${job.incident_id}:${bundle.metadata.generation_number}`,
      deltas: {
        reproductions_failed: 1
      }
    });
    throw new Error("reproduction_write_failed");
  }
  await recordProjectMetricDeltas(dependencies, {
    projectId: job.project_id,
    occurredAt: job.occurred_at,
    source: "worker.build_reproduction",
    dedupeKey: `reproduction_created:${job.incident_id}:${bundle.metadata.generation_number}`,
    deltas: {
      reproductions_created: 1
    }
  });

  return { processed: true };
}
