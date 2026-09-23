import { createBrowserRecoveryStore, lockBrowserRecoveryEvent } from "../../../packages/storage/src/browser-recovery-store.js";
import { createWorkerJobStore } from "../../../packages/storage/src/worker-job-store.js";
import { z } from "zod";
import { EventClassSchema, EventTypeSchema } from "../../../packages/shared-types/src/index.js";
import { normalizeEvent, parseStoredEvent } from "../../../packages/event-normalizer/src/index.js";
import {
  createPostgresAccountAnalyticsStore,
  createPostgresAnalyticsCorrelationStore,
  createPostgresImprovementOpportunityStore,
  createPostgresMetadataStore,
  type Queryable,
  type IncidentFrequencyCounter,
  type RequestAnomalyCounter,
  type ObjectStoreClient,
  type ObjectStoreReader
} from "../../../packages/storage/src/index.js";
import { createProcessedEventStore } from "../../../packages/storage/src/processed-event-store.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import {
  processNextNormalizeEventsJob,
  processNextGroupIncidentJob,
  type WorkerProcessResult,
  type IncidentLifecycleWebhookPublisher,
  type IncidentLifecycleGitHubDispatchPublisher
} from "./processor.js";
import {
  maybeGenerateHostedImprovementBundle,
  maybeGenerateHostedIncidentImprovementBundle,
  type ImprovementBundleWorkerDependencies
} from "./improvement-bundles.js";
import type { DurableWorkerQueue } from "./durable-queue.js";

const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
const IncidentImprovementSchema = z.object({
  project_id: z.string().uuid(),
  incident_id: z.string().uuid(),
  event_id: z.string().uuid(),
  event_type: EventTypeSchema,
  service_name: z.string(),
  environment: z.string(),
  incident_title: z.string(),
  incident_severity: SeveritySchema,
  incident_occurrence_count: z.number().int().nonnegative(),
  occurred_at: z.string().datetime(),
  regressed_now: z.boolean(),
  regression_deploy: z
    .object({
      deployment_id: z.string().uuid(),
      commit_sha: z.string().nullable(),
      version: z.string().nullable(),
      branch: z.string().nullable(),
      deployed_at: z.string().datetime(),
      minutes_since_deploy: z.number()
    })
    .nullable()
    .default(null)
});
const LifecycleSchema = z
  .object({
    channel: z.enum(["webhook", "github"]),
    project_id: z.string().uuid(),
    input: z.object({
      project_id: z.string().uuid(),
      incident_id: z.string().uuid(),
      event_type: z.enum([
        "bundle.created",
        "bundle.updated",
        "bundle.reopened",
        "incident.spike_detected"
      ]),
      occurred_at: z.string().datetime(),
      service_name: z.string(),
      environment: z.string(),
      severity: SeveritySchema,
      bundle_type: z.enum(["failure", "improvement"]).optional(),
      is_verification: z.boolean().optional(),
      title: z.string().optional(),
      occurrence_count: z.number().int().optional(),
      first_seen_at: z.string().datetime().optional(),
      bundle_version: z.number().int().optional(),
      regression_deploy: IncidentImprovementSchema.shape.regression_deploy
    })
  })
  .refine((value) => value.project_id === value.input.project_id);

export interface DurableIncidentProcessing {
  normalize: () => Promise<WorkerProcessResult>;
  group: () => Promise<WorkerProcessResult>;
  evaluateEventImprovement: () => Promise<WorkerProcessResult>;
  evaluateIncidentImprovement: () => Promise<WorkerProcessResult>;
  publishLifecycle: () => Promise<WorkerProcessResult>;
  deleteRetainedObject: () => Promise<WorkerProcessResult>;
}

export function createDurableIncidentProcessing(input: {
  queue: DurableWorkerQueue;
  objectStore: ObjectStoreClient & ObjectStoreReader;
  logger: RuntimeLogger;
  analyticsHashSecret: string;
  frequencyCounter: IncidentFrequencyCounter;
  requestAnomalyCounter: RequestAnomalyCounter;
  improvementWorker: ImprovementBundleWorkerDependencies;
  lifecycleWebhookPublisher: IncidentLifecycleWebhookPublisher;
  githubDispatchPublisher: IncidentLifecycleGitHubDispatchPublisher;
}): DurableIncidentProcessing {
  function improvementDependencies(
    tx: Queryable,
    queue: DurableWorkerQueue
  ): ImprovementBundleWorkerDependencies {
    const accountAnalyticsStore = createPostgresAccountAnalyticsStore({
      db: tx,
      analyticsHashSecret: input.analyticsHashSecret
    });
    return {
      ...input.improvementWorker,
      accountAnalyticsStore,
      improvementOpportunityStore: createPostgresImprovementOpportunityStore(tx, {
        accountAnalyticsStore
      }),
      scheduleBuild: (job) => queue.enqueueInternal("build-improvement-bundle", job)
    };
  }
  return {
    normalize: () =>
      input.queue.transaction("normalize-events", (tx, queue) =>
        processNextNormalizeEventsJob({
          queue,
          objectStore: input.objectStore,
          processedEventStore: createProcessedEventStore(tx),
          recordBrowserRecoveryContext: (projectId, event) => createBrowserRecoveryStore(tx).record(projectId, event),
          requestAnomalyCounter: input.requestAnomalyCounter,
          deferImprovement: ({ project_id, event, event_class, object_key }) =>
            queue.enqueueInternal("evaluate-event-improvement", {
              project_id,
              event_id: event.event_id,
              object_key,
              event_class
            })
        })
      ),
    group: () =>
      input.queue.transaction("group-incident", (tx, queue) => {
        const jobs = createWorkerJobStore(tx);
        const metadata = createPostgresMetadataStore(tx);
        let bundleJobId: string | undefined;
        const groupingQueue: DurableWorkerQueue = {
          ...queue,
          enqueue: (async (name: string, payload: unknown) => {
            const id = await jobs.enqueue(name, payload);
            if (name === "build-bundle") bundleJobId = id;
          }) as DurableWorkerQueue["enqueue"]
        };
        return processNextGroupIncidentJob({
          queue: groupingQueue,
          alertEvaluationQueue: groupingQueue,
          logger: input.logger,
          incidentStore: {
            ...metadata,
            async upsertIncident(data) {
              if (data.event_type === "frontend_exception") {
                await lockBrowserRecoveryEvent(tx, data.project_id, data.event_id);
              }
              // Serialize one fingerprint through its dedupe check, occurrence update, and follow-ups.
              // Different incidents remain independent across workers.
              await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
                JSON.stringify([
                  data.project_id,
                  data.service_name,
                  data.environment,
                  data.fingerprint
                ])
              ]);
              return metadata.upsertIncident(data);
            }
          },
          analyticsCorrelationStore: createPostgresAnalyticsCorrelationStore(tx),
          frequencyCounter: {
            recordOccurrence: (event) => input.frequencyCounter.recordOccurrence(event, tx)
          },
          lifecycleWebhookPublisher: {
            publish: (data) =>
              queue.enqueueInternal(
                "publish-incident-lifecycle",
                {
                  project_id: data.project_id,
                  channel: "webhook",
                  input: data
                },
                bundleJobId === undefined ? {} : { dependsOn: bundleJobId }
              )
          },
          githubDispatchPublisher: {
            publish: (data) =>
              queue.enqueueInternal(
                "publish-incident-lifecycle",
                {
                  project_id: data.project_id,
                  channel: "github",
                  input: data
                },
                bundleJobId === undefined ? {} : { dependsOn: bundleJobId }
              )
          },
          objectStore: {
            deleteObject: async ({ key }) => {
              const projectId = z.string().uuid().parse(key.split("/")[1]);
              await queue.enqueueInternal("delete-retained-object", { project_id: projectId, key });
            }
          },
          deferImprovement: (data) => queue.enqueueInternal("evaluate-incident-improvement", data)
        });
      }),
    evaluateEventImprovement: () =>
      input.queue.transaction("evaluate-event-improvement", async (tx, queue) => {
        const payload = await queue.dequeueInternal("evaluate-event-improvement");
        if (!payload) return { processed: false, reason: "no_jobs" };
        const job = z
          .object({
            project_id: z.string().uuid(),
            event_id: z.string().uuid(),
            object_key: z.string().min(1),
            event_class: EventClassSchema
          })
          .parse(payload);
        if (!job.object_key.startsWith(`raw-events/${job.project_id}/`))
          throw new Error("worker_improvement_scope_invalid");
        // Reuse the retained source so an optional backlog cannot extend raw-event retention.
        const body = await input.objectStore.getObject({ key: job.object_key });
        const event = parseStoredEvent(body);
        if (event === null || event.event_id !== job.event_id)
          throw new Error("worker_improvement_event_invalid");
        await maybeGenerateHostedImprovementBundle({
          project_id: job.project_id,
          event,
          event_class: job.event_class,
          normalized: normalizeEvent(event),
          dependencies: improvementDependencies(tx, queue)
        });
        return { processed: true };
      }),
    evaluateIncidentImprovement: () =>
      input.queue.transaction("evaluate-incident-improvement", async (tx, queue) => {
        const payload = await queue.dequeueInternal("evaluate-incident-improvement");
        if (!payload) return { processed: false, reason: "no_jobs" };
        await maybeGenerateHostedIncidentImprovementBundle({
          ...IncidentImprovementSchema.parse(payload),
          dependencies: improvementDependencies(tx, queue)
        });
        return { processed: true };
      }),
    publishLifecycle: async () => {
      const payload = await input.queue.dequeueInternal("publish-incident-lifecycle");
      if (!payload) return { processed: false, reason: "no_jobs" };
      const job = LifecycleSchema.parse(payload);
      const data = Object.fromEntries(
        Object.entries(job.input).filter(([, value]) => value !== undefined)
      ) as {
        [Key in keyof typeof job.input]: Exclude<(typeof job.input)[Key], undefined>;
      };
      if (job.channel === "webhook") await input.lifecycleWebhookPublisher.publish(data);
      else await input.githubDispatchPublisher.publish(data);
      return { processed: true };
    },
    deleteRetainedObject: async () => {
      const payload = await input.queue.dequeueInternal("delete-retained-object");
      if (!payload) return { processed: false, reason: "no_jobs" };
      const job = z.object({ project_id: z.string().uuid(), key: z.string() }).parse(payload);
      if (!job.key.startsWith(`raw-events/${job.project_id}/`))
        throw new Error("worker_retention_scope_invalid");
      if (!input.objectStore.deleteObject) throw new Error("worker_object_deletion_unavailable");
      await input.objectStore.deleteObject({ key: job.key });
      return { processed: true };
    }
  };
}
