import type { EventClass } from "../../shared-types/src/index.js";
import type { AccountMetricKey } from "./account-analytics-store.js";

type AcceptedIngestionEvent = {
  event_id: string;
  event_class: EventClass;
  event_type: string;
};

type RejectedIngestionEvent = {
  event_id: string;
  reason:
    | "capture_policy_rejected"
    | "capture_rule_dropped"
    | "capture_rule_sampled_out"
    | "invalid_event"
    | "monthly_quota_exceeded"
    | "rate_limited"
    | "remote_probes_disabled";
};

const REJECTION_REASON_METRIC_KEYS: Partial<
  Record<RejectedIngestionEvent["reason"], AccountMetricKey>
> = {
  capture_policy_rejected: "events_rejected_capture_policy",
  capture_rule_dropped: "events_rejected_capture_rule",
  capture_rule_sampled_out: "events_rejected_capture_rule",
  invalid_event: "events_rejected_malformed",
  monthly_quota_exceeded: "events_rejected_quota",
  rate_limited: "events_rejected_rate_limited"
};

export function countsTowardMonthlyIngestAllowance(
  organizationPlan: string | undefined,
  eventClass: EventClass
): boolean {
  if (eventClass === "operational_signal") {
    return false;
  }

  if (organizationPlan === "solo" || organizationPlan === "team") {
    return true;
  }

  return eventClass === "incident_signal";
}

export function buildIngestionMetricBatch(input: {
  project_id: string;
  organization_plan: string | undefined;
  accepted_events: AcceptedIngestionEvent[];
  rejected_events: RejectedIngestionEvent[];
}): {
  dedupe_key: string;
  deltas: Partial<Record<AccountMetricKey, number>>;
} | null {
  const deltas: Partial<Record<AccountMetricKey, number>> = {};

  if (input.accepted_events.length > 0) {
    deltas["raw_events_accepted"] = input.accepted_events.length;

    let billableEventsCounted = 0;
    let incidentSignalEventsCounted = 0;
    let contextSignalEventsCounted = 0;
    let operationalSignalEventsCounted = 0;
    let probeEventsAccepted = 0;

    for (const acceptedEvent of input.accepted_events) {
      if (countsTowardMonthlyIngestAllowance(input.organization_plan, acceptedEvent.event_class)) {
        billableEventsCounted += 1;
      }
      if (acceptedEvent.event_type === "probe_event") {
        probeEventsAccepted += 1;
      }

      if (acceptedEvent.event_class === "incident_signal") {
        incidentSignalEventsCounted += 1;
      } else if (acceptedEvent.event_class === "context_signal") {
        contextSignalEventsCounted += 1;
      } else {
        operationalSignalEventsCounted += 1;
      }
    }

    if (billableEventsCounted > 0) {
      deltas["billable_events_counted"] = billableEventsCounted;
    }
    if (incidentSignalEventsCounted > 0) {
      deltas["incident_signal_events_counted"] = incidentSignalEventsCounted;
    }
    if (contextSignalEventsCounted > 0) {
      deltas["context_signal_events_counted"] = contextSignalEventsCounted;
    }
    if (operationalSignalEventsCounted > 0) {
      deltas["operational_signal_events_counted"] = operationalSignalEventsCounted;
    }
    if (probeEventsAccepted > 0) {
      deltas["probe_events_accepted"] = probeEventsAccepted;
    }
  }

  if (input.rejected_events.length > 0) {
    deltas["raw_events_rejected"] = input.rejected_events.length;

    for (const rejectedEvent of input.rejected_events) {
      const metricKey = REJECTION_REASON_METRIC_KEYS[rejectedEvent.reason];
      if (metricKey === undefined) {
        continue;
      }

      deltas[metricKey] = (deltas[metricKey] ?? 0) + 1;
    }
  }

  if (Object.keys(deltas).length === 0) {
    return null;
  }

  const acceptedIds = input.accepted_events
    .map((event) => `${event.event_id}:${event.event_class}:${event.event_type}`)
    .sort();
  const rejectedIds = input.rejected_events
    .map((event) => `${event.reason}:${event.event_id}`)
    .sort();

  return {
    dedupe_key: [
      "ingestion_batch",
      input.project_id,
      `accepted=${acceptedIds.join(",")}`,
      `rejected=${rejectedIds.join(",")}`
    ].join(":"),
    deltas
  };
}
