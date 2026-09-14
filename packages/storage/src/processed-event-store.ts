import type { Queryable } from "./types.js";

export interface ProcessedEventStore {
  upsertProcessedEvent(input: {
    event_id: string;
    project_id: string;
    event_type: string;
    fingerprint: string;
    normalized_message: string;
  }): Promise<{ inserted: boolean }>;
}

export function createProcessedEventStore(db: Queryable): ProcessedEventStore {
  return {
    async upsertProcessedEvent(input: {
      event_id: string;
      project_id: string;
      event_type: string;
      fingerprint: string;
      normalized_message: string;
    }): Promise<{ inserted: boolean }> {
      const result = await db.query(
        `INSERT INTO processed_events (event_id, project_id, event_type, fingerprint, normalized_message, processed_at)
        VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [
          input.event_id,
          input.project_id,
          input.event_type,
          input.fingerprint,
          input.normalized_message
        ]
      );
      return { inserted: result.rows.length > 0 };
    }
  };
}
