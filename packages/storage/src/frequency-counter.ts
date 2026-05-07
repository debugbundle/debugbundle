import { Redis } from "ioredis";

import type {
  CreateRedisQueueClientInput,
  FrequencySnapshotStore,
  IncidentFrequencyCounter,
  IncidentFrequencySnapshot,
} from "./types.js";

const SPIKE_THRESHOLD = 3.0;
const WINDOW_1M_SECONDS = 60;
const WINDOW_5M_SECONDS = 5 * 60;
const WINDOW_1H_SECONDS = 60 * 60;
const WINDOW_24H_SECONDS = 24 * 60 * 60;
const WINDOW_RETENTION_SECONDS = WINDOW_24H_SECONDS + WINDOW_1H_SECONDS;
const MIN_BASELINE_1H_OCCURRENCES_FOR_SPIKE = 12;
const DEFAULT_FREQUENCY_SNAPSHOT_INTERVAL_SECONDS = 60;

function toUnixSeconds(isoTimestamp: string): number {
  return Math.floor(new Date(isoTimestamp).getTime() / 1000);
}

function computeBaselinePerFiveMinutes(occurrences1h: number): number {
  return occurrences1h / 12;
}

export function createRedisIncidentFrequencyCounter(input: CreateRedisQueueClientInput): IncidentFrequencyCounter & { close(): Promise<void> } {
  const redis = new Redis(input.redisUrl);
  const snapshotIntervalSeconds = input.frequencySnapshotIntervalSeconds ?? DEFAULT_FREQUENCY_SNAPSHOT_INTERVAL_SECONDS;
  const lastSnapshotByIncidentId = new Map<string, number>();
  const snapshotQueryable = input.snapshotStore;

  const snapshotStore: FrequencySnapshotStore | null =
    snapshotQueryable === undefined
      ? null
      : {
          async persistIncidentFrequencySnapshot(snapshotInput): Promise<void> {
            await snapshotQueryable.query(
              `
                UPDATE incidents
                SET
                  frequency_occurrences_1m = $2,
                  frequency_occurrences_5m = $3,
                  frequency_occurrences_1h = $4,
                  frequency_occurrences_24h = $5,
                  frequency_baseline_1h_per_5m = $6,
                  frequency_spike_ratio_5m_to_1h = $7,
                  frequency_has_sufficient_baseline = $8,
                  frequency_is_spiking = $9,
                  frequency_snapshot_at = $10::timestamptz,
                  updated_at = now()
                WHERE id = $1::uuid
                  AND (frequency_snapshot_at IS NULL OR frequency_snapshot_at <= $10::timestamptz)
              `,
              [
                snapshotInput.incident_id,
                snapshotInput.occurrences_1m,
                snapshotInput.occurrences_5m,
                snapshotInput.occurrences_1h,
                snapshotInput.occurrences_24h,
                snapshotInput.baseline_1h_per_5m,
                snapshotInput.spike_ratio_5m_to_1h,
                snapshotInput.has_sufficient_baseline,
                snapshotInput.is_spiking,
                snapshotInput.occurred_at
              ]
            );
          }
        };

  return {
    async recordOccurrence(event): Promise<IncidentFrequencySnapshot> {
      const occurredAt = toUnixSeconds(event.occurred_at);
      const windowKey = `incident-frequency:${event.incident_id}`;
      const trimBefore = occurredAt - WINDOW_RETENTION_SECONDS;

      const pipelineResult = await redis
        .multi()
        .zadd(windowKey, "NX", occurredAt, event.event_id)
        .zremrangebyscore(windowKey, 0, trimBefore)
        .expire(windowKey, WINDOW_RETENTION_SECONDS)
        .zcount(windowKey, occurredAt - WINDOW_1M_SECONDS + 1, occurredAt)
        .zcount(windowKey, occurredAt - WINDOW_5M_SECONDS + 1, occurredAt)
        .zcount(windowKey, occurredAt - WINDOW_1H_SECONDS + 1, occurredAt)
        .zcount(windowKey, occurredAt - WINDOW_24H_SECONDS + 1, occurredAt)
        .exec();

      const counts = pipelineResult ?? [];
      const occurrences1m = Number(counts[3]?.[1] ?? 0);
      const occurrences5m = Number(counts[4]?.[1] ?? 0);
      const occurrences1h = Number(counts[5]?.[1] ?? 0);
      const occurrences24h = Number(counts[6]?.[1] ?? 0);
      const baseline1hPer5m = computeBaselinePerFiveMinutes(occurrences1h);
      const spikeRatio = occurrences5m / Math.max(baseline1hPer5m, 1);
      const hasSufficientBaseline = occurrences1h >= MIN_BASELINE_1H_OCCURRENCES_FOR_SPIKE;
      const isSpiking = hasSufficientBaseline && spikeRatio >= SPIKE_THRESHOLD;

      if (snapshotStore !== null) {
        const lastSnapshotAt = lastSnapshotByIncidentId.get(event.incident_id);
        const shouldPersistSnapshot =
          lastSnapshotAt === undefined || occurredAt - lastSnapshotAt >= Math.max(snapshotIntervalSeconds, 1);

        if (shouldPersistSnapshot) {
          await snapshotStore.persistIncidentFrequencySnapshot({
            incident_id: event.incident_id,
            occurred_at: event.occurred_at,
            occurrences_1m: occurrences1m,
            occurrences_5m: occurrences5m,
            occurrences_1h: occurrences1h,
            occurrences_24h: occurrences24h,
            baseline_1h_per_5m: baseline1hPer5m,
            spike_ratio_5m_to_1h: spikeRatio,
            has_sufficient_baseline: hasSufficientBaseline,
            is_spiking: isSpiking
          });

          lastSnapshotByIncidentId.set(event.incident_id, occurredAt);
        }
      }

      return {
        occurrences_1m: occurrences1m,
        occurrences_5m: occurrences5m,
        occurrences_1h: occurrences1h,
        occurrences_24h: occurrences24h,
        baseline_1h_per_5m: baseline1hPer5m,
        spike_ratio_5m_to_1h: spikeRatio,
        has_sufficient_baseline: hasSufficientBaseline,
        is_spiking: isSpiking
      };
    },

    async close(): Promise<void> {
      await redis.quit();
    }
  };
}
