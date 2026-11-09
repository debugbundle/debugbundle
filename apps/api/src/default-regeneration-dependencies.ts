import {
  buildBundleRegenerationLeaseKey,
  buildImprovementBundleRegenerationLeaseKey,
  type QueueClient,
  type RedisQueueClient,
  type createPostgresImprovementOpportunityStore,
  type createPostgresMetadataStore
} from "../../../packages/storage/src/index.js";

import type { ApiDependencies } from "./api-types.js";
import { captureProjectJobAuthority } from "../../../packages/storage/src/project-job-authorization.js";
import type { Queryable } from "../../../packages/storage/src/types.js";

const BUNDLE_REGENERATION_LEASE_TTL_SECONDS = 30;

export function createDefaultRegenerationDependencies(input: {
  db?: Queryable;
  queue: QueueClient;
  metadataStore: ReturnType<typeof createPostgresMetadataStore>;
  improvementOpportunityStore: ReturnType<typeof createPostgresImprovementOpportunityStore>;
}): {
  bundleRegeneration: NonNullable<ApiDependencies["bundleRegeneration"]>;
  improvementBundleRegeneration: NonNullable<ApiDependencies["improvementBundleRegeneration"]>;
} {
  return {
    bundleRegeneration: {
      async requestRegeneration(regenerationInput) {
        const authority =
          regenerationInput.initiating_authority === undefined
            ? {}
            : input.db === undefined
              ? null
              : await captureProjectJobAuthority(input.db, {
                  project_id: regenerationInput.project_id,
                  initiator: regenerationInput.initiating_authority
                });
        if (authority === null) return false;
        const queueWithLease = input.queue as QueueClient &
          Partial<Pick<RedisQueueClient, "acquireLease" | "releaseLease">>;
        const leaseKey = buildBundleRegenerationLeaseKey(regenerationInput.incident_id);

        if (queueWithLease.acquireLease !== undefined) {
          const acquired = await queueWithLease.acquireLease(
            leaseKey,
            BUNDLE_REGENERATION_LEASE_TTL_SECONDS
          );
          if (!acquired) {
            return false;
          }
        }

        const source = await input.metadataStore.getBundleSourceForOrganization!({
          organization_id: regenerationInput.organization_id,
          incident_id: regenerationInput.incident_id
        });

        if (source === null) {
          await queueWithLease.releaseLease?.(leaseKey);
          return false;
        }

        try {
          await input.metadataStore.markBundleGenerationFailure!({
            incident_id: regenerationInput.incident_id,
            reason: null
          });
          await input.queue.enqueue("build-bundle", {
            ...authority,
            project_id: regenerationInput.project_id,
            incident_id: regenerationInput.incident_id,
            event_id: source.event_id,
            occurred_at: source.occurred_at,
            occurrence_count: source.occurrence_count,
            trigger: "regeneration"
          });
        } catch (error) {
          await queueWithLease.releaseLease?.(leaseKey);
          throw error;
        }
        return true;
      }
    },
    improvementBundleRegeneration: {
      async requestRegeneration(regenerationInput) {
        const authority =
          regenerationInput.initiating_authority === undefined
            ? {}
            : input.db === undefined
              ? null
              : await captureProjectJobAuthority(input.db, {
                  project_id: regenerationInput.project_id,
                  initiator: regenerationInput.initiating_authority
                });
        if (authority === null) return false;
        const queueWithLease = input.queue as QueueClient &
          Partial<Pick<RedisQueueClient, "acquireLease" | "releaseLease">> & {
            enqueue(
              jobName: "build-improvement-bundle",
              payload: {
                project_id: string;
                opportunity_id: string;
                event_id: string;
                event_type?: "log_event" | "request_event";
                occurred_at: string;
                occurrence_count: number;
                trigger: "regeneration";
              }
            ): Promise<void>;
          };
        const leaseKey = buildImprovementBundleRegenerationLeaseKey(
          regenerationInput.opportunity_id
        );

        if (queueWithLease.acquireLease !== undefined) {
          const acquired = await queueWithLease.acquireLease(
            leaseKey,
            BUNDLE_REGENERATION_LEASE_TTL_SECONDS
          );
          if (!acquired) {
            return true;
          }
        }

        const improvement = await input.improvementOpportunityStore.getImprovementForOrganization({
          organization_id: regenerationInput.organization_id,
          improvement_id: regenerationInput.opportunity_id
        });
        if (
          improvement === null ||
          improvement.project_id !== regenerationInput.project_id ||
          improvement.kind === "recurring_incident" ||
          improvement.kind === "post_deploy_regression"
        ) {
          await queueWithLease.releaseLease?.(leaseKey);
          return false;
        }

        const [source] = await input.improvementOpportunityStore.listImprovementEventReferences({
          opportunity_id: regenerationInput.opportunity_id,
          limit: 1
        });
        if (
          source === undefined ||
          (source.event_type !== "log_event" && source.event_type !== "request_event")
        ) {
          await queueWithLease.releaseLease?.(leaseKey);
          return false;
        }

        try {
          await queueWithLease.enqueue("build-improvement-bundle", {
            ...authority,
            project_id: regenerationInput.project_id,
            opportunity_id: regenerationInput.opportunity_id,
            event_id: source.event_id,
            event_type: source.event_type,
            occurred_at: source.occurred_at,
            occurrence_count: improvement.occurrence_count,
            trigger: "regeneration"
          });
        } catch (error) {
          await queueWithLease.releaseLease?.(leaseKey);
          throw error;
        }
        return true;
      }
    }
  };
}
