import type { AnalyticsEventEnvelope } from "../../shared-types/src/index.js";

export interface AggregateAnalyticsEventsJob {
  project_id: string;
  event_id: string;
  object_key: string;
}

export interface AnalyticsQueueClient {
  enqueue(jobName: "aggregate-analytics-events", payload: AggregateAnalyticsEventsJob): Promise<void>;
}

export interface AnalyticsIngestionPersistenceService {
  persistAnalyticsAndEnqueue(
    event: AnalyticsEventEnvelope,
    projectId: string
  ): Promise<{ object_key: string }>;
}
