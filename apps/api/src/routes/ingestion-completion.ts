import type { FastifyRequest } from "fastify";
import type { ProjectTokenContext } from "../../../../packages/auth/src/index.js";
import {
  getTierCapabilities,
  type EventClass
} from "../../../../packages/shared-types/src/index.js";
import {
  countsTowardMonthlyIngestAllowance,
  queueAllowanceThresholdNotifications,
  type ProbeActivationRecord
} from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { redactEvent } from "../api-helpers.js";
import { evidenceCapabilityResponse } from "../evidence-negotiation.js";
import {
  recordIngestionMetricBatchBestEffort,
  recordRejectedDiagnosticsBestEffort,
  type IngestionRejectedMetricEvent,
  type IngestionRejectedDiagnosticEvent
} from "./ingestion-observability.js";

interface IngestionCompletion {
  dependencies: ApiDependencies;
  request: FastifyRequest;
  project: ProjectTokenContext;
  now: Date;
  accepted: number;
  errors: Array<{ index: number; reason: string }>;
  events: Array<{ index: number; event: ReturnType<typeof redactEvent>; eventClass: EventClass }>;
  event_origins: ReadonlyMap<string, string>;
  rejected_metrics: IngestionRejectedMetricEvent[];
  rejected_diagnostics: IngestionRejectedDiagnosticEvent[];
  billed_count: number;
  usage_starts_at: string | null;
  usage_ends_at: string | null;
  previous_used: number | null;
  allowance_limit: number | null;
}
type IngestionResponse = ReturnType<typeof evidenceCapabilityResponse> & {
  accepted: number;
  rejected: number;
  errors: Array<{ index: number; reason: string }>;
  probe_directives?: { active_probes: ProbeActivationRecord[] };
};

/** Complete usage and response orchestration after the accepted events are durable. */
export async function completeIngestion(input: IngestionCompletion): Promise<IngestionResponse> {
  const { dependencies, project, request } = input;
  if (
    input.billed_count > 0 &&
    input.usage_starts_at !== null &&
    project.organization_id !== undefined &&
    dependencies.billingManagement?.incrementOrgUsageCounter !== undefined
  ) {
    await dependencies.billingManagement.incrementOrgUsageCounter({
      organization_id: project.organization_id,
      period_starts_at: input.usage_starts_at,
      count: input.billed_count
    });
  }
  if (
    input.billed_count > 0 &&
    input.usage_starts_at !== null &&
    dependencies.billingManagement?.incrementProjectUsageCounter !== undefined
  ) {
    const counts = new Map<string, number>();
    for (const { event, eventClass } of input.events) {
      if (!countsTowardMonthlyIngestAllowance(project.organization_plan, eventClass)) continue;
      const origin = input.event_origins.get(event.event_id) ?? project.project_id;
      counts.set(origin, (counts.get(origin) ?? 0) + 1);
    }
    for (const [origin, count] of counts) {
      try {
        await dependencies.billingManagement.incrementProjectUsageCounter({
          project_id: origin,
          period_starts_at: input.usage_starts_at,
          count
        });
      } catch {
        request.log.warn(
          { project_id: origin, period_starts_at: input.usage_starts_at },
          "project_usage_counter_increment_failed"
        );
      }
    }
  }
  if (
    input.billed_count > 0 &&
    input.previous_used !== null &&
    input.allowance_limit !== null &&
    dependencies.operationalEmailDelivery !== undefined
  ) {
    await queueAllowanceThresholdNotifications({
      store: dependencies.operationalEmailDelivery,
      project_id: project.project_id,
      meter: "monthly_raw_ingested_events",
      previous_used: input.previous_used,
      next_used: input.previous_used + input.billed_count,
      limit: input.allowance_limit,
      usage_window_starts_at: input.usage_starts_at,
      usage_window_ends_at: input.usage_ends_at
    });
  }
  const result = await recordIngestionMetricBatchBestEffort({
    dependencies,
    log: request.log,
    organization_id: project.organization_id,
    project_id: project.project_id,
    organization_plan: project.organization_plan,
    occurred_at: input.now.toISOString(),
    accepted_events: input.events.map(({ event, eventClass }) => ({
      event_id: event.event_id,
      event_class: eventClass,
      event_type: event.event_type
    })),
    rejected_events: input.rejected_metrics,
    event_origins: input.event_origins
  });
  if (result === "recorded")
    await recordRejectedDiagnosticsBestEffort({
      dependencies,
      log: request.log,
      organization_id: project.organization_id,
      occurred_at: input.now.toISOString(),
      rejected_events: input.rejected_diagnostics
    });
  let probes: ProbeActivationRecord[] = [];
  if (
    getTierCapabilities(project.organization_plan).remote_probes &&
    dependencies.probeManagement !== undefined
  ) {
    try {
      probes = await dependencies.probeManagement.listActiveProbesForProject({
        project_id: project.project_id,
        ...(project.scope_origin_ids ? { scope_origin_ids: project.scope_origin_ids } : {}),
        now: new Date().toISOString()
      });
    } catch {
      // Optional refresh cannot turn already durable event admission into failure.
      // Existing SDK directives retain their own expiry when no refresh is supplied.
      request.log.warn({ code: "probe_refresh_unavailable" }, "Optional probe refresh unavailable");
    }
  }
  return {
    accepted: input.accepted,
    rejected: input.errors.length,
    errors: input.errors,
    ...evidenceCapabilityResponse(
      request,
      dependencies.ingestionPersistence.claimEvidenceReceipt !== undefined
    ),
    ...(probes.length ? { probe_directives: { active_probes: probes } } : {})
  };
}
