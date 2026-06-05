import type { FastifyInstance } from "fastify";

import { hashToken, readBearerToken, requireProjectToken } from "../../../../packages/auth/src/index.js";
import { classifyEvent, validateEvent } from "../../../../packages/event-normalizer/src/index.js";
import {
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

function countsTowardMonthlyIngestAllowance(
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

function getQuotaRetryAfterMs(resetAt: string, now: Date): number {
  return Math.max(1_000, new Date(resetAt).getTime() - now.getTime());
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
    const validEvents: Array<{ index: number; event: ReturnType<typeof redactEvent> }> = [];

    for (const [index, candidate] of parsedBody.data.events.entries()) {
      const validation = validateEvent(candidate);
      if (!validation.success) {
        errors.push({
          index,
          reason: validation.error.issues[0]?.message ?? "invalid_event"
        });
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
        continue;
      }

      if (shouldCaptureEvent(capturePolicy, entry.event.event_type, entry.event.payload as Record<string, unknown>)) {
        const baseEventClass = classifyEvent(
          entry.event.event_type,
          entry.event.event_type === "log_event" ? entry.event.payload.level : undefined,
          entry.event.event_type === "probe_event" && "activation_id" in entry.event.payload ? entry.event.payload.activation_id : undefined,
          entry.event.payload as Record<string, unknown>,
          capturePolicy.preset,
          capturePolicy.immediate_client_error_statuses
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
          continue;
        }

        if (captureRule?.outcome === "sampled_out") {
          errors.push({ index: entry.index, reason: "capture_rule_sampled_out" });
          matchedRuleHits.push({ rule_id: captureRule.rule_id, matched_at: now.toISOString() });
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
