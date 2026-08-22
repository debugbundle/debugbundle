import type { FastifyInstance } from "fastify";

import {
  hashToken,
  readBearerToken,
  requireProjectToken
} from "../../../../packages/auth/src/index.js";
import {
  FINGERPRINT_VERSION,
  classifyEvent,
  classifyInstalledMobileEventCompatibility,
  fingerprint,
  normalizeEvent,
  validateEvent
} from "../../../../packages/event-normalizer/src/index.js";
import {
  countsTowardMonthlyIngestAllowance,
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications
} from "../../../../packages/storage/src/index.js";
import {
  getTierCapabilities,
  resolvePolicy,
  PRESET_DEFAULTS,
  shouldCaptureEvent,
  getDefaultPreset,
  isSelfHostMode
} from "../../../../packages/shared-types/src/index.js";
import {
  applyCaptureRuleEventClass,
  buildCaptureRuleEvaluationContext,
  evaluateCaptureRules,
  type CaptureRuleEvaluationResult,
  type EventClass,
  type ResolvedCapturePolicy
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import {
  claimAnalyticsIngestionQuotaAtBoundary,
  getAnalyticsQuotaClaimKeysForEvent,
  releaseAnalyticsQuotaClaimBestEffort,
  toRetryAfterSeconds as toAnalyticsRetryAfterSeconds
} from "../analytics-quota.js";
import { redactEvent } from "../api-helpers.js";
import { SMALL_REQUEST_BODY_LIMIT_BYTES } from "../http-limits.js";
import { parseCompatibleIngestionRequest } from "../ingestion-request-compatibility.js";
import { isProjectTokenOriginAllowed } from "../project-token-origins.js";
import {
  isAnalyticsEventCandidate,
  parseAnalyticsEventCandidate,
  selectAcceptedAnalyticsEvents,
  type ValidAnalyticsEvent
} from "./analytics-ingestion.js";
import {
  buildRejectedDiagnosticFromCandidate,
  buildRejectedDiagnosticFromEvent,
  getQuotaRetryAfterMs,
  readRejectedMetricEventId,
  recordIngestionMetricBatchBestEffort,
  recordRejectedDiagnosticsBestEffort,
  toIngestionRetryAfterSeconds,
  type IngestionRejectedDiagnosticEvent,
  type IngestionRejectedMetricEvent
} from "./ingestion-observability.js";

type ValidDebugEvent = { index: number; event: ReturnType<typeof redactEvent> };

export function registerIngestionRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.post("/v1/events", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    const projectAuth = await requireProjectToken({
      authorizationHeader: request.headers.authorization,
      resolveByTokenHash: (tokenHash) =>
        dependencies.ingestionMetadata.resolveProjectByTokenHash(tokenHash)
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

    const { parsedBody, compatibility } = parseCompatibleIngestionRequest(request.body);
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
    const compatibilityEventCounts = {
      legacy_android_event: 0,
      legacy_swift_event: 0
    };
    for (const candidate of parsedBody.data.events) {
      const eventCompatibility = classifyInstalledMobileEventCompatibility(candidate);
      if (eventCompatibility !== null) {
        compatibilityEventCounts[eventCompatibility]++;
      }
    }
    const compatibilityEventCount =
      compatibilityEventCounts.legacy_android_event + compatibilityEventCounts.legacy_swift_event;
    if (compatibility !== null || compatibilityEventCount > 0) {
      request.log.info(
        {
          compatibility_wrapper: compatibility,
          compatibility_event_counts: compatibilityEventCounts,
          compatibility_event_count: compatibilityEventCount,
          request_event_count: parsedBody.data.events.length
        },
        "ingestion_installed_sdk_compatibility_used"
      );
    }

    const errors: Array<{ index: number; reason: string }> = [];
    const rejectedMetricEvents: IngestionRejectedMetricEvent[] = [];
    const rejectedDiagnosticEvents: IngestionRejectedDiagnosticEvent[] = [];
    const validEvents: ValidDebugEvent[] = [];
    const validAnalyticsEvents: ValidAnalyticsEvent[] = [];

    for (const [index, candidate] of parsedBody.data.events.entries()) {
      if (isAnalyticsEventCandidate(candidate)) {
        const analyticsEvent = parseAnalyticsEventCandidate({
          candidate,
          index,
          projectId: project.project_id
        });
        if (analyticsEvent.error !== undefined) {
          errors.push(analyticsEvent.error);
          continue;
        }

        validAnalyticsEvents.push(analyticsEvent.event);
        continue;
      }

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

    const sharedRateLimitedEventCount = validEvents.length + validAnalyticsEvents.length;

    if (
      sharedRateLimitedEventCount > 0 &&
      dependencies.ingestionRateLimiter !== undefined &&
      !isSelfHostMode()
    ) {
      const bearerToken = readBearerToken(request.headers.authorization);
      if (bearerToken !== null) {
        const rateLimit = await dependencies.ingestionRateLimiter.claimEvents({
          token_hash: hashToken(bearerToken),
          project_id: project.project_id,
          event_count: sharedRateLimitedEventCount,
          limit: getTierCapabilities(project.organization_plan).ingestion_rate_per_min,
          now: new Date().toISOString()
        });

        if (!rateLimit.allowed) {
          errors.push(
            ...validEvents.map(({ index }) => ({
              index,
              reason: "rate_limited"
            })),
            ...validAnalyticsEvents.map(({ index }) => ({
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

          return reply
            .header("Retry-After", toIngestionRetryAfterSeconds(rateLimit.retry_after_ms))
            .status(429)
            .send({
              accepted: 0,
              rejected: errors.length,
              errors,
              retry_after_ms: rateLimit.retry_after_ms
            });
        }
      }
    }

    const caps = getTierCapabilities(project.organization_plan);
    const analyticsSelection = await selectAcceptedAnalyticsEvents({
      dependencies,
      events: validAnalyticsEvents,
      organizationId: project.organization_id,
      organizationPlan: project.organization_plan,
      projectId: project.project_id,
      analyticsAvailable: caps.analytics_bundle
    });
    errors.push(...analyticsSelection.errors);
    let acceptedAnalyticsEvents = analyticsSelection.acceptedEvents;

    const defaultPreset = getDefaultPreset(project.organization_plan);
    let capturePolicy: ResolvedCapturePolicy = {
      preset: defaultPreset,
      ...PRESET_DEFAULTS[defaultPreset]
    };
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
    const activeCaptureRules =
      dependencies.captureRuleManagement === undefined
        ? []
        : await dependencies.captureRuleManagement.listActiveCaptureRulesForProject({
            project_id: project.project_id,
            now: now.toISOString()
          });
    const captureRulesNeedFingerprint = activeCaptureRules.some(
      (rule) => rule.matcher.fingerprint !== undefined
    );
    let matchedRuleHits: Array<{ event_index: number; rule_id: string; matched_at: string }> = [];
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

      if (
        shouldCaptureEvent(
          capturePolicy,
          entry.event.event_type,
          entry.event.payload as Record<string, unknown>
        )
      ) {
        const baseEventClass = classifyEvent(
          entry.event.event_type,
          entry.event.event_type === "log_event" ? entry.event.payload.level : undefined,
          entry.event.event_type === "probe_event" && "activation_id" in entry.event.payload
            ? entry.event.payload.activation_id
            : undefined,
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
                      ...(entry.event.service.runtime === undefined
                        ? {}
                        : { runtime: entry.event.service.runtime })
                    },
                    payload: entry.event.payload as Record<string, unknown>
                  },
                  ...(captureRulesNeedFingerprint
                    ? {
                        fingerprint: {
                          version: FINGERPRINT_VERSION,
                          value: fingerprint(normalizeEvent(entry.event))
                        }
                      }
                    : {})
                }),
                now.toISOString()
              );

        if (captureRule?.outcome === "drop") {
          errors.push({ index: entry.index, reason: "capture_rule_dropped" });
          matchedRuleHits.push({
            event_index: entry.index,
            rule_id: captureRule.rule_id,
            matched_at: now.toISOString()
          });
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
          matchedRuleHits.push({
            event_index: entry.index,
            rule_id: captureRule.rule_id,
            matched_at: now.toISOString()
          });
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
          matchedRuleHits.push({
            event_index: entry.index,
            rule_id: captureRule.rule_id,
            matched_at: now.toISOString()
          });
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
    let debugEventsToPersist = acceptedEvents;

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
        const billingSummary =
          await dependencies.billingManagement.getBillingSummaryForOrganization({
            organization_id: project.organization_id,
            now: now.toISOString()
          });

        const allowance = billingSummary?.allowances.monthly_raw_ingested_events;
        if (billingSummary !== null) {
          usageWindowStartsAt = billingSummary.usage_window.starts_at;
          usageWindowEndsAt = billingSummary.usage_window.ends_at;
          previousRawIngestAllowanceUsed = allowance?.used ?? null;
          rawIngestAllowanceLimit = allowance?.limit ?? null;
        }

        if (billingSummary === null || allowance === undefined) {
          billingCountedEventsCount = countedEvents.length;
        } else {
          const remaining = Math.max(0, allowance.limit - allowance.used);
          const admittedCountedEvents = countedEvents.slice(0, remaining);
          const quotaRejectedEvents = countedEvents.slice(remaining);
          const countedIndexes = new Set(countedEvents.map(({ index }) => index));
          const admittedCountedIndexes = new Set(admittedCountedEvents.map(({ index }) => index));
          const quotaRejectedIndexes = new Set(quotaRejectedEvents.map(({ index }) => index));

          billingCountedEventsCount = admittedCountedEvents.length;
          debugEventsToPersist = acceptedEvents.filter(
            ({ index }) => !countedIndexes.has(index) || admittedCountedIndexes.has(index)
          );
          matchedRuleHits = matchedRuleHits.filter(
            ({ event_index }) => !quotaRejectedIndexes.has(event_index)
          );

          if (quotaRejectedEvents.length > 0) {
            errors.push(
              ...quotaRejectedEvents.map(({ index }) => ({
                index,
                reason: "monthly_quota_exceeded"
              }))
            );
            rejectedMetricEvents.push(
              ...quotaRejectedEvents.map(({ event }) => ({
                event_id: event.event_id,
                reason: "monthly_quota_exceeded" as const
              }))
            );
            rejectedDiagnosticEvents.push(
              ...quotaRejectedEvents.map(({ event }) =>
                buildRejectedDiagnosticFromEvent({
                  project_id: project.project_id,
                  rejection_reason: "monthly_quota_exceeded",
                  event
                })
              )
            );

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

            if (debugEventsToPersist.length === 0 && acceptedAnalyticsEvents.length === 0) {
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

              const retryAfterMs = getQuotaRetryAfterMs(billingSummary.usage_window.ends_at, now);
              return reply
                .header("Retry-After", toIngestionRetryAfterSeconds(retryAfterMs))
                .status(429)
                .send({
                  accepted: 0,
                  rejected: errors.length,
                  errors,
                  retry_after_ms: retryAfterMs
                });
            }
          }
        }
      }
    }

    let accepted = 0;
    for (const { event, captureRule } of debugEventsToPersist) {
      await dependencies.ingestionPersistence.persistAndEnqueue(event, project.project_id, {
        capturePreset: capturePolicy.preset,
        immediateClientErrorStatuses: capturePolicy.immediate_client_error_statuses,
        immediateClientErrorPathRules: capturePolicy.immediate_client_error_path_rules,
        ...(captureRule === null ? {} : { captureRule })
      });
      accepted += 1;
    }
    const persistAnalyticsAndEnqueue = dependencies.ingestionPersistence.persistAnalyticsAndEnqueue;
    if (persistAnalyticsAndEnqueue !== undefined) {
      const analyticsQuota = await claimAnalyticsIngestionQuotaAtBoundary({
        dependencies,
        organization_id: project.organization_id,
        organization_plan: project.organization_plan,
        events: acceptedAnalyticsEvents,
        now
      });
      if (analyticsQuota.rejected_events.length > 0) {
        errors.push(
          ...analyticsQuota.rejected_events.map(({ index }) => ({
            index,
            reason: "analytics_quota_exceeded"
          }))
        );
        acceptedAnalyticsEvents = analyticsQuota.accepted_events;
        if (accepted === 0 && acceptedAnalyticsEvents.length === 0) {
          const retryAfterMs = analyticsQuota.retry_after_ms ?? 1_000;
          return reply
            .header("Retry-After", toAnalyticsRetryAfterSeconds(retryAfterMs))
            .status(429)
            .send({
              accepted: 0,
              rejected: errors.length,
              errors,
              retry_after_ms: retryAfterMs
            });
        }
      }

      const persistedAnalyticsClaimKeys = new Set<string>();
      try {
        for (const { event } of acceptedAnalyticsEvents) {
          await persistAnalyticsAndEnqueue(event, project.project_id);
          for (const claimKey of getAnalyticsQuotaClaimKeysForEvent(event)) {
            persistedAnalyticsClaimKeys.add(claimKey);
          }
          accepted += 1;
        }
      } catch (error) {
        for (const release of analyticsQuota.releases) {
          await releaseAnalyticsQuotaClaimBestEffort({
            dependencies,
            release,
            exclude_claim_keys: persistedAnalyticsClaimKeys
          });
        }
        throw error;
      }
    }

    const captureRuleManagement = dependencies.captureRuleManagement;
    if (
      captureRuleManagement !== undefined &&
      captureRuleManagement.recordCaptureRuleMatch !== undefined &&
      matchedRuleHits.length > 0
    ) {
      const recordCaptureRuleMatch =
        captureRuleManagement.recordCaptureRuleMatch.bind(captureRuleManagement);
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
      accepted_events: debugEventsToPersist.map(({ event, eventClass }) => ({
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
