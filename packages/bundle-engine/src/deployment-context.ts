import type { EventEnvelope } from "../../shared-types/src/index.js";

type DeployEnvelope = Extract<EventEnvelope, { event_type: "deploy_metadata" }>;

export function selectScopedDeployments(input: {
  envelopes: EventEnvelope[];
  service: string;
  environment: string;
  occurredAt: string;
  configuredDeployedAt?: string | null;
}): DeployEnvelope[] {
  const cutoff = Date.parse(input.occurredAt);
  const configuredAt = Date.parse(input.configuredDeployedAt ?? "");
  return input.envelopes
    .filter(
      (event): event is DeployEnvelope =>
        event.event_type === "deploy_metadata" &&
        event.service.name === input.service &&
        event.service.environment === input.environment &&
        event.payload.environment === input.environment &&
        Date.parse(event.payload.deployed_at) <= cutoff &&
        // A caller-provided workload history row can be newer than the raw window.
        (!(configuredAt <= cutoff) || Date.parse(event.payload.deployed_at) >= configuredAt)
    )
    .sort(
      (left, right) =>
        Date.parse(left.payload.deployed_at) - Date.parse(right.payload.deployed_at) ||
        left.event_id.localeCompare(right.event_id)
    );
}
