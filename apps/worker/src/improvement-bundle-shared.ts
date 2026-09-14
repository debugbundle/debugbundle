import type {
  BillingStore,
  ImprovementOpportunityStore,
  ObjectStoreClient,
  ObjectStoreReader,
  OperationalEmailDeliveryStore,
  WebhookDeliveryStore
} from "../../../packages/storage/src/index.js";
import type { IncidentLifecycleGitHubDispatchPublisher } from "./processor.js";
import { type WorkerAccountAnalyticsDependencies } from "./account-analytics.js";

export type ImprovementWebhookStore = Pick<
  WebhookDeliveryStore,
  "listMatchingWebhooks" | "createDeliveryIntent"
>;

export interface ImprovementBundleWorkerDependencies extends WorkerAccountAnalyticsDependencies {
  scheduleBuild?: (
    job: import("../../../packages/storage/src/improvement-bundle-jobs.js").BuildImprovementBundleJob
  ) => Promise<void>;
  improvementOpportunityStore?: ImprovementOpportunityStore;
  billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
  webhookDeliveryStore?: ImprovementWebhookStore;
  githubDispatchPublisher?: IncidentLifecycleGitHubDispatchPublisher;
  operationalEmailDeliveryStore?: Pick<
    OperationalEmailDeliveryStore,
    "queueProjectOperationalEmailDelivery"
  >;
  fallbackTargetUrl?: string | null;
  fallbackSigningSecret?: string | null;
  objectStore: ObjectStoreReader & Partial<ObjectStoreClient>;
  apiBaseUrl?: string | null;
  appBaseUrl?: string | null;
  docsBaseUrl?: string | null;
}

export type RecordedImprovementCandidate = {
  opportunity_id: string;
  occurrence_count: number;
  bundle_generation_number: number;
  should_generate_bundle: boolean;
};

export function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.replace(/\/+$/, "");
}
