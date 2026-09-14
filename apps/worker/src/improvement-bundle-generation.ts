import { gzipSync } from "node:zlib";
import type {
  ObjectStoreClient,
  RetainedBundleOwnerReference
} from "../../../packages/storage/src/index.js";
import {
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildReproductionObjectKey,
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications,
  queueRetentionRotationNotice
} from "../../../packages/storage/src/index.js";
import { type ImprovementRuleThresholds } from "./improvement-rules.js";
import { recordProjectMetricDeltas } from "./account-analytics.js";
import { buildHostedImprovementBundle } from "./improvement-bundle-context.js";
import { publishImprovementBundleCreated } from "./improvement-bundle-publishing.js";
import {
  type ImprovementBundleWorkerDependencies,
  type RecordedImprovementCandidate,
  normalizeBaseUrl
} from "./improvement-bundle-shared.js";

export async function generateRecordedHostedImprovementBundle(input: {
  project_id: string;
  event_id: string;
  event_type?: "log_event" | "request_event";
  occurred_at: string;
  recorded: RecordedImprovementCandidate;
  thresholds: ImprovementRuleThresholds;
  dependencies: ImprovementBundleWorkerDependencies;
}): Promise<void> {
  if (input.dependencies.improvementOpportunityStore === undefined) {
    return;
  }

  const alreadyRecorded =
    await input.dependencies.improvementOpportunityStore.hasImprovementBundleGenerationForSourceEvent(
      {
        opportunity_id: input.recorded.opportunity_id,
        event_id: input.event_id
      }
    );

  let bundleRequestBillingSummary: Awaited<
    ReturnType<
      NonNullable<
        ImprovementBundleWorkerDependencies["billingStore"]
      >["getBillingSummaryForProject"]
    >
  > | null = null;
  if (!alreadyRecorded && input.dependencies.billingStore !== undefined) {
    bundleRequestBillingSummary = await input.dependencies.billingStore.getBillingSummaryForProject(
      {
        project_id: input.project_id,
        now: new Date().toISOString()
      }
    );
    const allowance = bundleRequestBillingSummary?.allowances.monthly_bundle_requests;
    if (
      bundleRequestBillingSummary !== null &&
      allowance !== undefined &&
      allowance.used >= allowance.limit
    ) {
      if (input.dependencies.operationalEmailDeliveryStore !== undefined) {
        await queueAllowanceLimitReachedNotification({
          store: input.dependencies.operationalEmailDeliveryStore,
          project_id: input.project_id,
          meter: "monthly_bundle_requests",
          used: allowance.used,
          limit: allowance.limit,
          usage_window_starts_at: bundleRequestBillingSummary.usage_window.starts_at,
          usage_window_ends_at: bundleRequestBillingSummary.usage_window.ends_at
        });
      }
      await input.dependencies.improvementOpportunityStore.markImprovementBundleGenerationFailure({
        opportunity_id: input.recorded.opportunity_id,
        reason: "monthly_quota_exceeded"
      });
      await recordProjectMetricDeltas(input.dependencies, {
        projectId: input.project_id,
        occurredAt: input.occurred_at,
        source: "worker.improvement_bundle",
        dedupeKey: `improvement_bundle_generation_failed:${input.recorded.opportunity_id}:${input.event_id}`,
        deltas: {
          improvement_bundle_generations_failed: 1
        }
      });
      return;
    }
  }

  try {
    const reserved =
      await input.dependencies.improvementOpportunityStore.reserveImprovementBundleGeneration({
        opportunity_id: input.recorded.opportunity_id,
        event_id: input.event_id,
        occurred_at: input.occurred_at,
        trigger: "occurrence_threshold"
      });
    const context =
      await input.dependencies.improvementOpportunityStore.getImprovementBundleBuildContext({
        project_id: input.project_id,
        opportunity_id: input.recorded.opportunity_id
      });
    if (context === null) {
      return;
    }

    const references =
      await input.dependencies.improvementOpportunityStore.listImprovementEventReferences({
        opportunity_id: input.recorded.opportunity_id,
        limit: 5
      });
    const referencesWithSource =
      input.event_type === undefined ||
      references.some((reference) => reference.event_id === input.event_id)
        ? references
        : [
            ...references,
            {
              event_id: input.event_id,
              event_type: input.event_type,
              occurred_at: input.occurred_at
            }
          ];
    const apiBaseUrl = normalizeBaseUrl(input.dependencies.apiBaseUrl);
    const appBaseUrl = normalizeBaseUrl(input.dependencies.appBaseUrl);
    const docsBaseUrl = normalizeBaseUrl(input.dependencies.docsBaseUrl);
    const bundle = await buildHostedImprovementBundle({
      context,
      references: referencesWithSource,
      thresholds: input.thresholds,
      objectStore: input.dependencies.objectStore,
      reserved,
      apiBaseUrl,
      appBaseUrl,
      docsBaseUrl
    });
    const severity = bundle.signal.severity;
    const bundleLink = bundle.links.self;
    const projectLink = bundle.links.project;

    const key = buildImprovementBundleObjectKey(context.project_id, context.opportunity_id);
    await input.dependencies.objectStore.putObject?.({
      key,
      body: gzipSync(Buffer.from(JSON.stringify(bundle), "utf8")),
      contentType: "application/json",
      contentEncoding: "gzip"
    });
    await recordProjectMetricDeltas(input.dependencies, {
      projectId: context.project_id,
      occurredAt: input.occurred_at,
      source: "worker.improvement_bundle",
      dedupeKey: `improvement_bundle_generation:${context.opportunity_id}:${reserved.generation_number}`,
      deltas: {
        [reserved.generation_number > 1
          ? "improvement_bundles_updated"
          : "improvement_bundles_created"]: 1
      }
    });

    if (
      !alreadyRecorded &&
      bundleRequestBillingSummary !== null &&
      input.dependencies.operationalEmailDeliveryStore !== undefined
    ) {
      const allowance = bundleRequestBillingSummary.allowances.monthly_bundle_requests;
      await queueAllowanceThresholdNotifications({
        store: input.dependencies.operationalEmailDeliveryStore,
        project_id: context.project_id,
        meter: "monthly_bundle_requests",
        previous_used: allowance.used,
        next_used: allowance.used + 1,
        limit: allowance.limit,
        usage_window_starts_at: bundleRequestBillingSummary.usage_window.starts_at,
        usage_window_ends_at: bundleRequestBillingSummary.usage_window.ends_at
      });
    }

    if (
      input.dependencies.billingStore !== undefined &&
      input.dependencies.objectStore.deleteObject !== undefined
    ) {
      const billingSummary = await input.dependencies.billingStore.getBillingSummaryForProject({
        project_id: context.project_id,
        now: new Date().toISOString()
      });
      const retainedAllowance = billingSummary?.allowances.retained_bundle_cap;

      if (retainedAllowance !== undefined) {
        if (input.dependencies.operationalEmailDeliveryStore !== undefined) {
          await queueAllowanceThresholdNotifications({
            store: input.dependencies.operationalEmailDeliveryStore,
            project_id: context.project_id,
            meter: "retained_bundle_cap",
            previous_used: Math.max(0, retainedAllowance.used - 1),
            next_used: retainedAllowance.used,
            limit: retainedAllowance.limit
          });
        }

        const prunedOwners =
          await input.dependencies.improvementOpportunityStore.pruneRetainedBundleOwnersForProject({
            project_id: context.project_id,
            retained_bundle_limit: retainedAllowance.limit
          });

        for (const prunedOwner of prunedOwners) {
          await deletePrunedBundleArtifacts({
            objectStore: input.dependencies.objectStore,
            owner: prunedOwner
          });
        }

        if (
          input.dependencies.operationalEmailDeliveryStore !== undefined &&
          prunedOwners.length > 0
        ) {
          await queueRetentionRotationNotice({
            store: input.dependencies.operationalEmailDeliveryStore,
            project_id: context.project_id,
            rotated_owner_count: prunedOwners.length,
            retained_bundle_limit: retainedAllowance.limit,
            dedupe_date: new Date().toISOString().slice(0, 10)
          });
        }
        if (prunedOwners.length > 0) {
          await recordProjectMetricDeltas(input.dependencies, {
            projectId: context.project_id,
            occurredAt: input.occurred_at,
            source: "worker.improvement_bundle",
            dedupeKey: `retention_bundle_rotation:improvement:${context.opportunity_id}:${reserved.generation_number}`,
            deltas: {
              retention_bundle_owners_rotated: prunedOwners.length
            }
          });
        }
      }
    }

    await publishImprovementBundleCreated({
      project_id: context.project_id,
      opportunity_id: context.opportunity_id,
      occurred_at: input.occurred_at,
      service_name: context.service_name,
      environment: context.environment,
      severity,
      title: context.title,
      bundle_link: bundleLink,
      project_link: projectLink,
      ...(input.dependencies.accountAnalyticsStore === undefined
        ? {}
        : { accountAnalyticsStore: input.dependencies.accountAnalyticsStore }),
      ...(input.dependencies.resolveOrganizationIdForProject === undefined
        ? {}
        : { resolveOrganizationIdForProject: input.dependencies.resolveOrganizationIdForProject }),
      ...(input.dependencies.webhookDeliveryStore === undefined
        ? {}
        : { webhookDeliveryStore: input.dependencies.webhookDeliveryStore }),
      ...(input.dependencies.billingStore === undefined
        ? {}
        : { billingStore: input.dependencies.billingStore }),
      ...(input.dependencies.operationalEmailDeliveryStore === undefined
        ? {}
        : { operationalEmailDeliveryStore: input.dependencies.operationalEmailDeliveryStore }),
      ...(input.dependencies.fallbackTargetUrl === undefined
        ? {}
        : { fallbackTargetUrl: input.dependencies.fallbackTargetUrl }),
      ...(input.dependencies.fallbackSigningSecret === undefined
        ? {}
        : { fallbackSigningSecret: input.dependencies.fallbackSigningSecret })
    });

    await input.dependencies.githubDispatchPublisher?.publish({
      event_type: "improvement_bundle.created",
      improvement_id: context.opportunity_id,
      project_id: context.project_id,
      occurred_at: input.occurred_at,
      service_name: context.service_name,
      environment: context.environment,
      severity,
      bundle_type: "improvement",
      title: context.title,
      occurrence_count: context.occurrence_count,
      first_seen_at: context.first_detected_at,
      bundle_version: reserved.generation_number
    });
  } catch (error) {
    await input.dependencies.improvementOpportunityStore.markImprovementBundleGenerationFailure({
      opportunity_id: input.recorded.opportunity_id,
      reason: "build_error"
    });
    await recordProjectMetricDeltas(input.dependencies, {
      projectId: input.project_id,
      occurredAt: input.occurred_at,
      source: "worker.improvement_bundle",
      dedupeKey: `improvement_bundle_generation_failed:${input.recorded.opportunity_id}:${input.event_id}`,
      deltas: {
        improvement_bundle_generations_failed: 1
      }
    });
    throw error;
  }
}

export async function deletePrunedBundleArtifacts(input: {
  objectStore: Pick<Partial<ObjectStoreClient>, "deleteObject">;
  owner: RetainedBundleOwnerReference;
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
