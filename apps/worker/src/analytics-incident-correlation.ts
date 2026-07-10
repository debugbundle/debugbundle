import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import {
  hashAnalyticsCorrelationValue,
  hashAnalyticsSessionSubject,
  type AnalyticsCorrelationStore,
  type GroupIncidentJob
} from "../../../packages/storage/src/index.js";
import type { EventEnvelope } from "../../../packages/shared-types/src/index.js";

export type AnalyticsIncidentCorrelationRecorder = Pick<
  AnalyticsCorrelationStore,
  "recordIncidentCorrelation"
>;

export function buildAnalyticsIncidentCorrelationJobFields(
  projectId: string,
  correlation: EventEnvelope["correlation"]
): Pick<GroupIncidentJob, "session_id_hash" | "trace_id_hash"> {
  return {
    session_id_hash:
      correlation?.session_id == null
        ? null
        : hashAnalyticsSessionSubject(projectId, correlation.session_id),
    trace_id_hash: hashAnalyticsCorrelationValue(correlation?.trace_id)
  };
}

export async function recordAnalyticsIncidentCorrelationBestEffort(input: {
  recorder: AnalyticsIncidentCorrelationRecorder | undefined;
  logger: Pick<RuntimeLogger, "warn"> | undefined;
  job: GroupIncidentJob;
  incidentId: string;
}): Promise<void> {
  if (
    input.recorder === undefined ||
    (input.job.session_id_hash == null && input.job.trace_id_hash == null)
  ) {
    return;
  }

  try {
    await input.recorder.recordIncidentCorrelation({
      project_id: input.job.project_id,
      incident_id: input.incidentId,
      event_id: input.job.event_id,
      service: input.job.service_name,
      environment: input.job.environment,
      occurred_at: input.job.occurred_at,
      session_id_hash: input.job.session_id_hash ?? null,
      trace_id_hash: input.job.trace_id_hash ?? null
    });
  } catch (error) {
    input.logger?.warn(
      {
        error_message: error instanceof Error ? error.message : String(error),
        incident_id: input.incidentId,
        project_id: input.job.project_id
      },
      "worker_analytics_incident_correlation_failed"
    );
    // Debug incident processing must not depend on optional analytics correlation.
  }
}
