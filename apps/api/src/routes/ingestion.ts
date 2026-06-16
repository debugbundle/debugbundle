import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { ZodIssue } from "zod";

import { hashToken, readBearerToken, requireProjectToken } from "../../../../packages/auth/src/index.js";
import { classifyEvent, validateEvent } from "../../../../packages/event-normalizer/src/index.js";
import {
  buildIngestionMetricBatch,
  countsTowardMonthlyIngestAllowance,
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications
} from "../../../../packages/storage/src/index.js";
import { getTierCapabilities, resolvePolicy, PRESET_DEFAULTS, shouldCaptureEvent, getDefaultPreset, isSelfHostMode } from "../../../../packages/shared-types/src/index.js";
import {
  applyCaptureRuleEventClass,
  buildCaptureRuleEvaluationContext,
  evaluateCaptureRules,
  type CaptureRuleEvaluationResult,
  type EventClass,
  type ResolvedCapturePolicy
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { redactEvent } from "../api-helpers.js";
import { SMALL_REQUEST_BODY_LIMIT_BYTES } from "../http-limits.js";
import { isProjectTokenOriginAllowed } from "../project-token-origins.js";
import { IngestionRequestSchema } from "../schemas.js";

function toRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1_000)));
}

function getQuotaRetryAfterMs(resetAt: string, now: Date): number {
  return Math.max(1_000, new Date(resetAt).getTime() - now.getTime());
}

function readRejectedMetricEventId(candidate: unknown, index: number): string {
  if (typeof candidate === "object" && candidate !== null) {
    const eventId = (candidate as Record<string, unknown>)["event_id"];
    if (typeof eventId === "string" && eventId.length > 0) {
      return eventId;
    }
  }

  return `invalid_event_index_${index}`;
}

type IngestionRejectedMetricEvent = {
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

type IngestionAcceptedMetricEvent = {
  event_id: string;
  event_class: EventClass;
  event_type: string;
};

type IngestionRejectedDiagnosticEvent = {
  rejection_reason: IngestionRejectedMetricEvent["reason"];
  project_id: string;
  sdk_name: string | null;
  sdk_version: string | null;
  event_type: string | null;
  service_name: string | null;
  service_environment: string | null;
  service_runtime: string | null;
  validation_code: string | null;
  validation_path: string | null;
};

async function recordIngestionMetricBatchBestEffort(input: {
  dependencies: ApiDependencies;
  log: FastifyBaseLogger;
  organization_id: string | undefined;
  project_id: string;
  organization_plan: string | undefined;
  occurred_at: string;
  accepted_events: IngestionAcceptedMetricEvent[];
  rejected_events: IngestionRejectedMetricEvent[];
}): Promise<"recorded" | "skipped"> {
  if (input.dependencies.accountAnalytics === undefined || input.organization_id === undefined) {
    return "skipped";
  }

  const metricBatch = buildIngestionMetricBatch({
    project_id: input.project_id,
    organization_plan: input.organization_plan,
    accepted_events: input.accepted_events,
    rejected_events: input.rejected_events
  });
  if (metricBatch === null) {
    return "skipped";
  }

  try {
    const result = await input.dependencies.accountAnalytics.recordMetricDeltas({
      organization_id: input.organization_id,
      occurred_at: input.occurred_at,
      source: "ingestion_batch",
      dedupe_key: metricBatch.dedupe_key,
      deltas: metricBatch.deltas
    });
    return result === "recorded" ? "recorded" : "skipped";
  } catch (error) {
    input.log.warn(
      {
        err: error,
        project_id: input.project_id,
        organization_id: input.organization_id
      },
      "ingestion_account_analytics_record_failed"
    );
    return "skipped";
  }
}

function sanitizeDiagnosticText(candidate: string | null | undefined, maxLength = 160): string | null {
  if (typeof candidate !== "string") {
    return null;
  }

  const normalized = candidate.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function readObjectField(candidate: unknown, key: string): Record<string, unknown> | null {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const value = (candidate as Record<string, unknown>)[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readStringField(candidate: unknown, key: string, maxLength = 160): string | null {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  return sanitizeDiagnosticText((candidate as Record<string, unknown>)[key] as string | null | undefined, maxLength);
}

function readValidationPath(issue: ZodIssue | undefined): string | null {
  if (issue === undefined || issue.path.length === 0) {
    return null;
  }

  return sanitizeDiagnosticText(issue.path.map((segment) => String(segment)).join("."), 160);
}

function buildRejectedDiagnosticFromCandidate(input: {
  project_id: string;
  rejection_reason: IngestionRejectedMetricEvent["reason"];
  candidate: unknown;
  validation_issue?: ZodIssue;
}): IngestionRejectedDiagnosticEvent {
  const service = readObjectField(input.candidate, "service");

  return {
    rejection_reason: input.rejection_reason,
    project_id: input.project_id,
    sdk_name: readStringField(input.candidate, "sdk_name", 120),
    sdk_version: readStringField(input.candidate, "sdk_version", 64),
    event_type: readStringField(input.candidate, "event_type", 80),
    service_name: readStringField(service, "name", 120),
    service_environment: readStringField(service, "environment", 80),
    service_runtime: readStringField(service, "runtime", 80),
    validation_code: sanitizeDiagnosticText(input.validation_issue?.code ?? null, 80),
    validation_path: readValidationPath(input.validation_issue)
  };
}

function buildRejectedDiagnosticFromEvent(input: {
  project_id: string;
  rejection_reason: IngestionRejectedMetricEvent["reason"];
  event: ReturnType<typeof redactEvent>;
}): IngestionRejectedDiagnosticEvent {
  return {
    rejection_reason: input.rejection_reason,
    project_id: input.project_id,
    sdk_name: sanitizeDiagnosticText(input.event.sdk_name, 120),
    sdk_version: sanitizeDiagnosticText(input.event.sdk_version, 64),
    event_type: sanitizeDiagnosticText(input.event.event_type, 80),
    service_name: sanitizeDiagnosticText(input.event.service.name, 120),
    service_environment: sanitizeDiagnosticText(input.event.service.environment, 80),
    service_runtime: sanitizeDiagnosticText(input.event.service.runtime ?? null, 80),
    validation_code: null,
    validation_path: null
  };
}

async function recordRejectedDiagnosticsBestEffort(input: {
  dependencies: ApiDependencies;
  log: FastifyBaseLogger;
  organization_id: string | undefined;
  occurred_at: string;
  rejected_events: IngestionRejectedDiagnosticEvent[];
}): Promise<void> {
  if (
    input.organization_id === undefined ||
    input.dependencies.ingestionRejectionDiagnostics === undefined ||
    input.rejected_events.length === 0
  ) {
    return;
  }

  try {
    await input.dependencies.ingestionRejectionDiagnostics.recordRejectedDiagnostics({
      organization_id: input.organization_id,
      occurred_at: input.occurred_at,
      events: input.rejected_events
    });
  } catch (error) {
    input.log.warn(
      {
        err: error,
        organization_id: input.organization_id
      },
      "ingestion_rejection_diagnostics_record_failed"
    );
  }
}

export function registerIngestionRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.post("/v1/events", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    const projectAuth = await requireProjectToken({
      authorizationHeader: request.headers.authorization,
      resolveByTokenHash: (tokenHash) => dependencies.ingestionMetadata.resolveProjectByTokenHash(tokenHash)
    });
    if (!projectAuth.ok) {
      return reply.status(401).send({
        accepted: 0,
        rejected: 0,
        errors: [
          {
            index: -1,
            reason: "invalid_project_token"
          }
        ]
      });
    }

    const project = projectAuth.context;
    if (!isProjectTokenOriginAllowed({ headers: request.headers, projectToken: project })) {
      return reply.status(403).send({
        accepted: 0,
        rejected: 0,
        errors: [
          {
            index: -1,
            reason: "origin_not_allowed"
          }
        ]
      });
    }

    const now = new Date();

    const parsedBody = IngestionRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        accepted: 0,
        rejected: 0,
        errors: [
          {
            index: -1,
            reason: "malformed_payload"
          }
        ]
      });
    }

    const errors: Array<{ index: number; reason: string }> = [];
    const rejectedMetricEvents: IngestionRejectedMetricEvent[] = [];
    const rejectedDiagnosticEvents: IngestionRejectedDiagnosticEvent[] = [];
    const validEvents: Array<{ index: number; event: ReturnType<typeof redactEvent> }> = [];

    for (const [index, candidate] of parsedBody.data.events.entries()) {
      const validation = validateEvent(candidate);
      if (!validation.success) {
        errors.push({
          index,
          reason: validation.error.issues[0]?.message ?? "invalid_event"
        });
        rejectedMetricEvents.push({
          event_id: readRejectedMetricEventId(candidate, index),
          reason: "invalid_event"
        });
        rejectedDiagnosticEvents.push(
          buildRejectedDiagnosticFromCandidate({
            project_id: project.project_id,
            rejection_reason: "invalid_event",
            candidate,
            ...(validation.error.issues[0] === undefined
              ? {}
              : { validation_issue: validation.error.issues[0] })
          })
        );
        continue;
      }

      validEvents.push({
        index,
        event: redactEvent(validation.data)
      });
    }

    if (validEvents.length > 0 && dependencies.ingestionRateLimiter !== undefined && !isSelfHostMode()) {
      const bearerToken = readBearerToken(request.headers.authorization);
      if (bearerToken !== null) {
        const rateLimit = await dependencies.ingestionRateLimiter.claimEvents({
          token_hash: hashToken(bearerToken),
          project_id: project.project_id,
          event_count: validEvents.length,
          limit: getTierCapabilities(project.organization_plan).ingestion_rate_per_min,
          now: new Date().toISOString()
        });

        if (!rateLimit.allowed) {
          errors.push(
            ...validEvents.map(({ index }) => ({
              index,
              reason: "rate_limited"
            }))
          );
          rejectedMetricEvents.push(
            ...validEvents.map(({ event }) => ({
              event_id: event.event_id,
              reason: "rate_limited" as const
            }))
          );
          rejectedDiagnosticEvents.push(
            ...validEvents.map(({ event }) =>
              buildRejectedDiagnosticFromEvent({
                project_id: project.project_id,
                rejection_reason: "rate_limited",
                event
              })
            )
          );

          const metricRecordResult = await recordIngestionMetricBatchBestEffort({
            dependencies,
            log: request.log,
            organization_id: project.organization_id,
            project_id: project.project_id,
            organization_plan: project.organization_plan,
            occurred_at: now.toISOString(),
            accepted_events: [],
            rejected_events: rejectedMetricEvents
          });
          if (metricRecordResult === "recorded") {
            await recordRejectedDiagnosticsBestEffort({
              dependencies,
              log: request.log,
              organization_id: project.organization_id,
              occurred_at: now.toISOString(),
              rejected_events: rejectedDiagnosticEvents
            });
          }

          return reply.header("Retry-After", toRetryAfterSeconds(rateLimit.retry_after_ms)).status(429).send({
            accepted: 0,
            rejected: errors.length,
            errors,
            retry_after_ms: rateLimit.retry_after_ms
          });
        }
      }
    }

    const defaultPreset = getDefaultPreset(project.organization_plan);
    let capturePolicy: ResolvedCapturePolicy = { preset: defaultPreset, ...PRESET_DEFAULTS[defaultPreset] };
    if (dependencies.capturePolicyManagement !== undefined) {
      const policyRecord = await dependencies.capturePolicyManagement.getCapturePolicyForProject({
        organization_id: "",
        project_id: project.project_id
      });
      if (policyRecord !== null) {
        capturePolicy = resolvePolicy(policyRecord);
      }
    }

    const capturedEvents: typeof validEvents = [];
    const caps = getTierCapabilities(project.organization_plan);
    const activeCaptureRules =
      dependencies.captureRuleManagement === undefined
        ? []
        : await dependencies.captureRuleManagement.listActiveCaptureRulesForProject({
            project_id: project.project_id,
            now: now.toISOString()
          });
    const matchedRuleHits: Array<{ rule_id: string; matched_at: string }> = [];
    const acceptedEvents: Array<{
      index: number;
      event: ReturnType<typeof redactEvent>;
      captureRule: CaptureRuleEvaluationResult | null;
      eventClass: EventClass;
    }> = [];

    for (const entry of validEvents) {
      if (
        !caps.remote_probes &&
        entry.event.event_type === "probe_event" &&
        typeof entry.event.payload === "object" &&
        entry.event.payload !== null &&
        typeof entry.event.payload.activation_id === "string" &&
        entry.event.payload.activation_id.length > 0
      ) {
        errors.push({ index: entry.index, reason: "remote_probes_disabled" });
        rejectedMetricEvents.push({
          event_id: entry.event.event_id,
          reason: "remote_probes_disabled"
        });
        rejectedDiagnosticEvents.push(
          buildRejectedDiagnosticFromEvent({
            project_id: project.project_id,
            rejection_reason: "remote_probes_disabled",
            event: entry.event
          })
        );
        continue;
      }

      if (shouldCaptureEvent(capturePolicy, entry.event.event_type, entry.event.payload as Record<string, unknown>)) {
        const baseEventClass = classifyEvent(
          entry.event.event_type,
          entry.event.event_type === "log_event" ? entry.event.payload.level : undefined,
          entry.event.event_type === "probe_event" && "activation_id" in entry.event.payload ? entry.event.payload.activation_id : undefined,
          entry.event.payload as Record<string, unknown>,
          capturePolicy.preset,
          capturePolicy.immediate_client_error_statuses,
          capturePolicy.immediate_client_error_path_rules
        );
        const captureRule =
          activeCaptureRules.length === 0
            ? null
            : evaluateCaptureRules(
                activeCaptureRules,
                buildCaptureRuleEvaluationContext({
                  project_id: project.project_id,
                  event: {
                    event_id: entry.event.event_id,
                    event_type: entry.event.event_type,
                    service: {
                      name: entry.event.service.name,
                      environment: entry.event.service.environment,
                      ...(entry.event.service.runtime === undefined ? {} : { runtime: entry.event.service.runtime })
                    },
                    payload: entry.event.payload as Record<string, unknown>
                  }
                }),
                now.toISOString()
              );

        if (captureRule?.outcome === "drop") {
          errors.push({ index: entry.index, reason: "capture_rule_dropped" });
          matchedRuleHits.push({ rule_id: captureRule.rule_id, matched_at: now.toISOString() });
          rejectedMetricEvents.push({
            event_id: entry.event.event_id,
            reason: "capture_rule_dropped"
          });
          rejectedDiagnosticEvents.push(
            buildRejectedDiagnosticFromEvent({
              project_id: project.project_id,
              rejection_reason: "capture_rule_dropped",
              event: entry.event
            })
          );
          continue;
        }

        if (captureRule?.outcome === "sampled_out") {
          errors.push({ index: entry.index, reason: "capture_rule_sampled_out" });
          matchedRuleHits.push({ rule_id: captureRule.rule_id, matched_at: now.toISOString() });
          rejectedMetricEvents.push({
            event_id: entry.event.event_id,
            reason: "capture_rule_sampled_out"
          });
          rejectedDiagnosticEvents.push(
            buildRejectedDiagnosticFromEvent({
              project_id: project.project_id,
              rejection_reason: "capture_rule_sampled_out",
              event: entry.event
            })
          );
          continue;
        }

        if (captureRule !== null) {
          matchedRuleHits.push({ rule_id: captureRule.rule_id, matched_at: now.toISOString() });
        }

        acceptedEvents.push({
          index: entry.index,
          event: entry.event,
          captureRule,
          eventClass: applyCaptureRuleEventClass({
            event_class: baseEventClass,
            capture_rule: captureRule
          })
        });
        capturedEvents.push(entry);
      } else {
        errors.push({ index: entry.index, reason: "capture_policy_rejected" });
        rejectedMetricEvents.push({
          event_id: entry.event.event_id,
          reason: "capture_policy_rejected"
        });
        rejectedDiagnosticEvents.push(
          buildRejectedDiagnosticFromEvent({
            project_id: project.project_id,
            rejection_reason: "capture_policy_rejected",
            event: entry.event
          })
        );
      }
    }

    let billingCountedEventsCount = 0;
    let usageWindowStartsAt: string | null = null;
    let usageWindowEndsAt: string | null = null;
    let previousRawIngestAllowanceUsed: number | null = null;
    let rawIngestAllowanceLimit: number | null = null;

    if (
      capturedEvents.length > 0 &&
      project.organization_id !== undefined &&
      dependencies.billingManagement !== undefined &&
      !isSelfHostMode()
    ) {
      const countedEvents = acceptedEvents.filter(({ eventClass }) =>
        countsTowardMonthlyIngestAllowance(project.organization_plan, eventClass)
      );

      if (countedEvents.length > 0) {
        const billingSummary = await dependencies.billingManagement.getBillingSummaryForOrganization({
          organization_id: project.organization_id,
          now: now.toISOString()
        });

        const allowance = billingSummary?.allowances.monthly_raw_ingested_events;
        if (billingSummary !== null && allowance !== undefined && allowance.used + countedEvents.length > allowance.limit) {
          if (dependencies.operationalEmailDelivery !== undefined) {
            await queueAllowanceLimitReachedNotification({
              store: dependencies.operationalEmailDelivery,
              project_id: project.project_id,
              meter: "monthly_raw_ingested_events",
              used: allowance.used,
              limit: allowance.limit,
              usage_window_starts_at: billingSummary.usage_window.starts_at,
              usage_window_ends_at: billingSummary.usage_window.ends_at
            });
          }
          const retryAfterMs = getQuotaRetryAfterMs(billingSummary.usage_window.ends_at, now);
          errors.push(
            ...acceptedEvents.map(({ index }) => ({
              index,
              reason: "monthly_quota_exceeded"
            }))
          );
          rejectedMetricEvents.push(
            ...acceptedEvents.map(({ event }) => ({
              event_id: event.event_id,
              reason: "monthly_quota_exceeded" as const
            }))
          );
          rejectedDiagnosticEvents.push(
            ...acceptedEvents.map(({ event }) =>
              buildRejectedDiagnosticFromEvent({
                project_id: project.project_id,
                rejection_reason: "monthly_quota_exceeded",
                event
              })
            )
          );

          const metricRecordResult = await recordIngestionMetricBatchBestEffort({
            dependencies,
            log: request.log,
            organization_id: project.organization_id,
            project_id: project.project_id,
            organization_plan: project.organization_plan,
            occurred_at: now.toISOString(),
            accepted_events: [],
            rejected_events: rejectedMetricEvents
          });
          if (metricRecordResult === "recorded") {
            await recordRejectedDiagnosticsBestEffort({
              dependencies,
              log: request.log,
              organization_id: project.organization_id,
              occurred_at: now.toISOString(),
              rejected_events: rejectedDiagnosticEvents
            });
          }

          return reply.header("Retry-After", toRetryAfterSeconds(retryAfterMs)).status(429).send({
            accepted: 0,
            rejected: errors.length,
            errors,
            retry_after_ms: retryAfterMs
          });
        }

        billingCountedEventsCount = countedEvents.length;
        if (billingSummary !== null) {
          usageWindowStartsAt = billingSummary.usage_window.starts_at;
          usageWindowEndsAt = billingSummary.usage_window.ends_at;
          previousRawIngestAllowanceUsed = allowance?.used ?? null;
          rawIngestAllowanceLimit = allowance?.limit ?? null;
        }
      }
    }

    let accepted = 0;
    for (const { event, captureRule } of acceptedEvents) {
      await dependencies.ingestionPersistence.persistAndEnqueue(event, project.project_id, {
        capturePreset: capturePolicy.preset,
        immediateClientErrorStatuses: capturePolicy.immediate_client_error_statuses,
        immediateClientErrorPathRules: capturePolicy.immediate_client_error_path_rules,
        ...(captureRule === null ? {} : { captureRule })
      });
      accepted += 1;
    }

    const captureRuleManagement = dependencies.captureRuleManagement;
    if (
      captureRuleManagement !== undefined &&
      captureRuleManagement.recordCaptureRuleMatch !== undefined &&
      matchedRuleHits.length > 0
    ) {
      const recordCaptureRuleMatch = captureRuleManagement.recordCaptureRuleMatch.bind(captureRuleManagement);
      await Promise.allSettled(
        matchedRuleHits.map((match) =>
          recordCaptureRuleMatch({
            project_id: project.project_id,
            rule_id: match.rule_id,
            matched_at: match.matched_at
          })
        )
      );
    }

    if (
      billingCountedEventsCount > 0 &&
      usageWindowStartsAt !== null &&
      project.organization_id !== undefined &&
      dependencies.billingManagement?.incrementOrgUsageCounter !== undefined
    ) {
      await dependencies.billingManagement.incrementOrgUsageCounter({
        organization_id: project.organization_id,
        period_starts_at: usageWindowStartsAt,
        count: billingCountedEventsCount
      });
    }

    if (
      billingCountedEventsCount > 0 &&
      usageWindowStartsAt !== null &&
      dependencies.billingManagement?.incrementProjectUsageCounter !== undefined
    ) {
      try {
        await dependencies.billingManagement.incrementProjectUsageCounter({
          project_id: project.project_id,
          period_starts_at: usageWindowStartsAt,
          count: billingCountedEventsCount
        });
      } catch (error) {
        request.log.warn(
          {
            err: error,
            project_id: project.project_id,
            period_starts_at: usageWindowStartsAt
          },
          "project_usage_counter_increment_failed"
        );
      }
    }

    if (
      billingCountedEventsCount > 0 &&
      previousRawIngestAllowanceUsed !== null &&
      rawIngestAllowanceLimit !== null &&
      dependencies.operationalEmailDelivery !== undefined
    ) {
      await queueAllowanceThresholdNotifications({
        store: dependencies.operationalEmailDelivery,
        project_id: project.project_id,
        meter: "monthly_raw_ingested_events",
        previous_used: previousRawIngestAllowanceUsed,
        next_used: previousRawIngestAllowanceUsed + billingCountedEventsCount,
        limit: rawIngestAllowanceLimit,
        usage_window_starts_at: usageWindowStartsAt,
        usage_window_ends_at: usageWindowEndsAt
      });
    }

    const metricRecordResult = await recordIngestionMetricBatchBestEffort({
      dependencies,
      log: request.log,
      organization_id: project.organization_id,
      project_id: project.project_id,
      organization_plan: project.organization_plan,
      occurred_at: now.toISOString(),
      accepted_events: acceptedEvents.map(({ event, eventClass }) => ({
        event_id: event.event_id,
        event_class: eventClass,
        event_type: event.event_type
      })),
      rejected_events: rejectedMetricEvents
    });
    if (metricRecordResult === "recorded") {
      await recordRejectedDiagnosticsBestEffort({
        dependencies,
        log: request.log,
        organization_id: project.organization_id,
        occurred_at: now.toISOString(),
        rejected_events: rejectedDiagnosticEvents
      });
    }

    let activeProbes: Array<{
      activation_id: string;
      label_pattern: string;
      service: string;
      environment: string;
      expires_at: string;
      trigger_expires_at: string;
    }> = [];

    if (caps.remote_probes && dependencies.probeManagement !== undefined) {
      activeProbes = await dependencies.probeManagement.listActiveProbesForProject({
        project_id: project.project_id,
        now: new Date().toISOString()
      });
    }

    const responseBody: {
      accepted: number;
      rejected: number;
      errors: Array<{ index: number; reason: string }>;
      probe_directives?: {
        active_probes: Array<{
          activation_id: string;
          label_pattern: string;
          service: string;
          environment: string;
          expires_at: string;
          trigger_expires_at: string;
        }>;
      };
    } = {
      accepted,
      rejected: errors.length,
      errors
    };

    if (caps.remote_probes && activeProbes.length > 0) {
      responseBody.probe_directives = {
        active_probes: activeProbes
      };
    }

    return reply.status(202).send(responseBody);
  });
}
