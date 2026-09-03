export interface RetentionRawEventReference {
  project_id: string;
  event_id: string;
  occurred_at: string;
}

export interface RetentionAnalyticsRawEventReference {
  project_id: string;
  event_id: string;
  occurred_at: string;
}

export interface RetentionAnalyticsJourneySampleReference {
  project_id: string;
  sample_id: string;
  s3_object_key: string;
  expires_at: string;
}

export interface RetentionAnalyticsBundleGenerationReference {
  project_id: string;
  generation_id: string;
  opportunity_id: string | null;
  status: "completed" | "failed";
  object_key: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface RetentionAnalyticsRollupPruneResult {
  deleted_rows: number;
  reached_batch_limit: boolean;
}

export interface RetentionExpiredIncidentReference {
  project_id: string;
  incident_id: string;
}

export interface RetentionStore {
  listExpiredSampledRawEvents(input: {
    now: string;
    limit: number;
  }): Promise<RetentionRawEventReference[]>;
  markRawEventsExpired(input: { references: RetentionRawEventReference[] }): Promise<void>;
  listExpiredAnalyticsRawEvents(input: {
    now: string;
    limit: number;
  }): Promise<RetentionAnalyticsRawEventReference[]>;
  deleteExpiredAnalyticsRawEvents(input: {
    references: RetentionAnalyticsRawEventReference[];
  }): Promise<void>;
  listExpiredAnalyticsJourneySamples(input: {
    now: string;
    limit: number;
  }): Promise<RetentionAnalyticsJourneySampleReference[]>;
  deleteExpiredAnalyticsJourneySamples(input: {
    references: RetentionAnalyticsJourneySampleReference[];
  }): Promise<void>;
  pruneExpiredAnalyticsRollups(input: {
    now: string;
    limit: number;
  }): Promise<RetentionAnalyticsRollupPruneResult>;
  listExpiredAnalyticsBundleGenerations(input: {
    now: string;
    limit: number;
  }): Promise<RetentionAnalyticsBundleGenerationReference[]>;
  deleteExpiredAnalyticsBundleGenerations(input: {
    references: RetentionAnalyticsBundleGenerationReference[];
  }): Promise<void>;
  listExpiredIncidents(input: {
    now: string;
    limit: number;
  }): Promise<RetentionExpiredIncidentReference[]>;
  deleteExpiredIncidents(input: { references: RetentionExpiredIncidentReference[] }): Promise<void>;
}
