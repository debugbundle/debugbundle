import { gunzipSync } from "node:zlib";

import { protectAnalyticsEvent } from "../../../packages/event-normalizer/src/index.js";
import type { ObjectStoreReader } from "../../../packages/storage/src/index.js";
import {
  AnalyticsEventEnvelopeSchema,
  type AnalyticsEventEnvelope
} from "../../../packages/shared-types/src/index.js";
import type {
  AggregateAnalyticsEventsJob,
  AnalyticsRollupStore
} from "../../../packages/storage/src/index.js";
import type { WorkerProcessResult } from "./processor.js";
import {
  maybeCaptureAnalyticsJourneySample,
  type AnalyticsJourneySampleCaptureDependencies
} from "./analytics-journey-samples.js";

export interface AggregateAnalyticsWorkerQueue {
  dequeue(jobName: "aggregate-analytics-events"): Promise<AggregateAnalyticsEventsJob | null>;
}

export interface AggregateAnalyticsWorkerDependencies {
  queue: AggregateAnalyticsWorkerQueue;
  objectStore: ObjectStoreReader;
  analyticsRollupStore: AnalyticsRollupStore;
  analyticsJourneySamples?: AnalyticsJourneySampleCaptureDependencies | undefined;
}

const MAX_ANALYTICS_EVENT_BYTES = 256 * 1024;

function analyticsEventMatchesJob(input: {
  event: AnalyticsEventEnvelope;
  job: AggregateAnalyticsEventsJob;
}): boolean {
  return input.event.event_id === input.job.event_id &&
    (
      input.event.project_id === undefined ||
      input.event.project_id === null ||
      input.event.project_id === input.job.project_id
    );
}

export async function processNextAggregateAnalyticsEventsJob(
  dependencies: AggregateAnalyticsWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("aggregate-analytics-events");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const rawBody = await dependencies.objectStore.getObject({ key: job.object_key });
  let event: AnalyticsEventEnvelope | null = null;
  try {
    if (rawBody.byteLength > MAX_ANALYTICS_EVENT_BYTES) throw new Error("analytics_event_too_large");
    const parsed = JSON.parse(gunzipSync(rawBody, { maxOutputLength: MAX_ANALYTICS_EVENT_BYTES }).toString("utf8")) as unknown;
    const validated = AnalyticsEventEnvelopeSchema.safeParse(parsed);
    event = validated.success ? protectAnalyticsEvent(validated.data) : null;
  } catch {
    event = null;
  }
  if (event === null) {
    return { processed: false, reason: "invalid_analytics_event" };
  }
  if (!analyticsEventMatchesJob({ event, job })) {
    return { processed: false, reason: "analytics_event_mismatch" };
  }

  await dependencies.analyticsRollupStore.recordAnalyticsEvent({
    project_id: job.project_id,
    event
  });
  await maybeCaptureAnalyticsJourneySample({
    project_id: job.project_id,
    event,
    dependencies: dependencies.analyticsJourneySamples
  });

  return { processed: true };
}
