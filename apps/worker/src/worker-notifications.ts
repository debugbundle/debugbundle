import { createHmac, createPrivateKey, createSign } from "node:crypto";
import { createServer, type Server } from "node:http";

import {
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications,
  type BillingStore,
  type GitHubStore,
  type OperationalEmailDeliveryStore,
  type WebhookDeliveryStore
} from "../../../packages/storage/src/index.js";
import {
  GitHubDispatchDeliveryError,
  LifecycleWebhookDeliveryError,
  type GitHubDispatchTransport,
  type IncidentLifecycleGitHubDispatchPublisher,
  type IncidentLifecycleWebhookPublisher,
  type LifecycleWebhookTransport
} from "./processor.js";
import {
  recordProjectMetricDeltas,
  type WorkerAccountAnalyticsDependencies
} from "./account-analytics.js";

interface CreateLifecycleWebhookPublisherInput extends WorkerAccountAnalyticsDependencies {
  fallbackTargetUrl: string | null;
  fallbackSigningSecret: string | null;
  webhookDeliveryStore: Pick<WebhookDeliveryStore, "listMatchingWebhooks" | "createDeliveryIntent">;
  billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
  operationalEmailDeliveryStore?: Pick<
    OperationalEmailDeliveryStore,
    "queueProjectOperationalEmailDelivery"
  >;
}

interface GitHubDispatchTokenCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

interface CreateGitHubDispatchPublisherInput extends WorkerAccountAnalyticsDependencies {
  githubStore: Pick<
    GitHubStore,
    | "listMatchingGitHubDispatchRules"
    | "hasRecentGitHubDispatch"
    | "countProjectGitHubDispatchesSince"
    | "countInstallationGitHubDispatchesSince"
    | "createGitHubDispatchDeliveryIntent"
    | "createSkippedGitHubDispatchDelivery"
  >;
}

export function getIncidentStatusForDispatchEvent(
  eventType:
    | "bundle.created"
    | "bundle.updated"
    | "bundle.reopened"
    | "incident.spike_detected"
    | "improvement_bundle.created"
): "new_only" | "reopened_only" | "new_or_reopened" {
  if (eventType === "bundle.created") {
    return "new_or_reopened";
  }

  if (eventType === "bundle.reopened") {
    return "new_or_reopened";
  }

  return "new_or_reopened";
}

function getGitHubDispatchDedupeKey(event: {
  event_type:
    | "bundle.created"
    | "bundle.updated"
    | "bundle.reopened"
    | "incident.spike_detected"
    | "improvement_bundle.created";
  occurred_at: string;
  bundle_version?: number;
}): string {
  return `${event.event_type}:${event.bundle_version ?? event.occurred_at}`;
}

export function createGitHubDispatchPublisher(
  input: CreateGitHubDispatchPublisherInput
): IncidentLifecycleGitHubDispatchPublisher {
  return {
    async publish(event): Promise<void> {
      const matching = await input.githubStore.listMatchingGitHubDispatchRules({
        project_id: event.project_id,
        event_type: event.event_type,
        environment: event.environment,
        service_name: event.service_name,
        severity: event.severity,
        bundle_type: event.bundle_type ?? "failure",
        incident_status: getIncidentStatusForDispatchEvent(event.event_type)
      });

      const since = new Date(Date.parse(event.occurred_at) - 60 * 60 * 1000).toISOString();

      for (const rule of matching) {
        const targetFingerprint = `${event.improvement_id ?? event.incident_id}:${event.event_type}`;
        const dedupeKey = getGitHubDispatchDedupeKey(event);
        const incidentId = event.incident_id ?? null;
        const improvementId = event.improvement_id ?? null;
        const bundleType = event.bundle_type ?? "failure";
        const links =
          bundleType === "improvement" && improvementId !== null
            ? {
                bundle: `/v1/projects/${event.project_id}/improvements/${improvementId}/bundle`,
                reproduction: null,
                dashboard: `/projects/${event.project_id}/improvements/${improvementId}`
              }
            : {
                bundle: `/v1/incidents/${incidentId}/bundle`,
                reproduction: `/v1/incidents/${incidentId}/reproduction`,
                dashboard: `/incidents/${incidentId}`
              };
        const dispatchPayload = {
          debugbundle_event: event.event_type,
          incident_id: incidentId,
          improvement_id: improvementId,
          bundle_type: bundleType,
          bundle_version: event.bundle_version ?? 1,
          severity: event.severity,
          service: event.service_name,
          environment: event.environment,
          title: event.title ?? null,
          links,
          debugbundle: {
            project_id: event.project_id,
            occurrence_count: event.occurrence_count ?? 1,
            first_seen_at: event.first_seen_at ?? event.occurred_at
          }
        };

        const withinCooldown = await input.githubStore.hasRecentGitHubDispatch({
          rule_id: rule.rule_id,
          incident_fingerprint: targetFingerprint,
          cooldown_seconds: rule.cooldown_seconds
        });
        if (withinCooldown) {
          continue;
        }

        const projectCount = await input.githubStore.countProjectGitHubDispatchesSince({
          project_id: event.project_id,
          since
        });
        if (projectCount >= 100) {
          await input.githubStore.createSkippedGitHubDispatchDelivery({
            rule_id: rule.rule_id,
            rule_name: rule.rule_name,
            project_id: event.project_id,
            incident_id: incidentId,
            improvement_id: improvementId,
            target_fingerprint: targetFingerprint,
            dedupe_key: dedupeKey,
            installation_id: rule.installation_id,
            repo_owner: rule.repo_owner,
            repo_name: rule.repo_name,
            reason: "project_hourly_rate_limited",
            dispatch_payload: dispatchPayload
          });
          continue;
        }

        const installationCount = await input.githubStore.countInstallationGitHubDispatchesSince({
          installation_id: rule.installation_id,
          since
        });
        if (installationCount >= 4000) {
          await input.githubStore.createSkippedGitHubDispatchDelivery({
            rule_id: rule.rule_id,
            rule_name: rule.rule_name,
            project_id: event.project_id,
            incident_id: incidentId,
            improvement_id: improvementId,
            target_fingerprint: targetFingerprint,
            dedupe_key: dedupeKey,
            installation_id: rule.installation_id,
            repo_owner: rule.repo_owner,
            repo_name: rule.repo_name,
            reason: "installation_hourly_rate_limited",
            dispatch_payload: dispatchPayload
          });
          continue;
        }

        const delivery = await input.githubStore.createGitHubDispatchDeliveryIntent({
          rule_id: rule.rule_id,
          rule_name: rule.rule_name,
          project_id: event.project_id,
          incident_id: incidentId,
          improvement_id: improvementId,
          target_fingerprint: targetFingerprint,
          dedupe_key: dedupeKey,
          installation_id: rule.installation_id,
          repo_owner: rule.repo_owner,
          repo_name: rule.repo_name,
          dispatch_payload: dispatchPayload
        });

        if (delivery.created) {
          await recordProjectMetricDeltas(input, {
            projectId: event.project_id,
            occurredAt: event.occurred_at,
            source: "github_dispatch_created",
            dedupeKey: `github_dispatch_created:${delivery.delivery_id}`,
            deltas: {
              github_dispatches_created: 1
            }
          });
        }
      }
    }
  };
}

export function createLifecycleWebhookPublisher(
  input: CreateLifecycleWebhookPublisherInput
): IncidentLifecycleWebhookPublisher {
  return {
    async publish(event): Promise<void> {
      const matchInput: Parameters<typeof input.webhookDeliveryStore.listMatchingWebhooks>[0] = {
        project_id: event.project_id,
        event_type: event.event_type,
        environment: event.environment,
        service_name: event.service_name,
        severity: event.severity
      };

      if (event.bundle_type !== undefined) {
        matchInput.bundle_type = event.bundle_type;
      }
      if (event.is_verification !== undefined) {
        matchInput.is_verification = event.is_verification;
      }

      const matching = await input.webhookDeliveryStore.listMatchingWebhooks(matchInput);

      const fallback =
        input.fallbackTargetUrl !== null && input.fallbackSigningSecret !== null
          ? [
              {
                webhook_id: `fallback-${event.project_id}`,
                target_url: input.fallbackTargetUrl,
                signing_secret: input.fallbackSigningSecret
              }
            ]
          : [];

      const targets = matching.length > 0 ? matching : fallback;
      let remainingWebhookDeliveries: number | null = null;
      let webhookAllowanceUsed: number | null = null;
      let webhookAllowanceLimit: number | null = null;
      let webhookUsageWindowStartsAt: string | null = null;
      let webhookUsageWindowEndsAt: string | null = null;
      if (input.billingStore !== undefined) {
        const billingSummary = await input.billingStore.getBillingSummaryForProject({
          project_id: event.project_id,
          now: new Date().toISOString()
        });
        const allowance = billingSummary?.allowances.monthly_webhook_deliveries;
        if (billingSummary !== null && allowance !== undefined) {
          remainingWebhookDeliveries = Math.max(0, allowance.limit - allowance.used);
          webhookAllowanceUsed = allowance.used;
          webhookAllowanceLimit = allowance.limit;
          webhookUsageWindowStartsAt = billingSummary.usage_window.starts_at;
          webhookUsageWindowEndsAt = billingSummary.usage_window.ends_at;
        }
      }

      for (const target of targets) {
        if (remainingWebhookDeliveries !== null && remainingWebhookDeliveries <= 0) {
          if (input.operationalEmailDeliveryStore !== undefined && webhookAllowanceLimit !== null) {
            await queueAllowanceLimitReachedNotification({
              store: input.operationalEmailDeliveryStore,
              project_id: event.project_id,
              meter: "monthly_webhook_deliveries",
              used: webhookAllowanceUsed ?? webhookAllowanceLimit,
              limit: webhookAllowanceLimit,
              usage_window_starts_at: webhookUsageWindowStartsAt,
              usage_window_ends_at: webhookUsageWindowEndsAt
            });
          }
          break;
        }

        const delivery = await input.webhookDeliveryStore.createDeliveryIntent({
          webhook_id: target.webhook_id,
          project_id: event.project_id,
          incident_id: event.incident_id,
          event_type: event.event_type,
          occurred_at: event.occurred_at,
          target_url: target.target_url,
          signing_secret: target.signing_secret,
          payload: {
            event: event.event_type,
            event_type: event.event_type,
            incident_id: event.incident_id,
            project_id: event.project_id,
            occurred_at: event.occurred_at,
            service: event.service_name,
            environment: event.environment,
            severity: event.severity,
            bundle_type: event.bundle_type ?? "failure",
            verification: event.is_verification ?? false,
            summary: event.title ?? null,
            links: {
              bundle: `/v1/incidents/${event.incident_id}/bundle`,
              reproduction: `/v1/incidents/${event.incident_id}/reproduction`
            },
            regression_after_deploy:
              event.regression_deploy !== undefined && event.regression_deploy !== null,
            deploy_version: event.regression_deploy?.version ?? null,
            deploy_commit_sha: event.regression_deploy?.commit_sha ?? null,
            deploy_branch: event.regression_deploy?.branch ?? null,
            deploy_deployed_at: event.regression_deploy?.deployed_at ?? null,
            minutes_since_deploy: event.regression_deploy?.minutes_since_deploy ?? null
          }
        });
        await recordProjectMetricDeltas(input, {
          projectId: event.project_id,
          occurredAt: event.occurred_at,
          source: "webhook_delivery_created",
          dedupeKey: `webhook_delivery_created:${delivery.delivery_id}`,
          deltas: {
            webhook_deliveries_created: 1
          }
        });
        if (remainingWebhookDeliveries !== null) {
          const previousUsed = webhookAllowanceUsed ?? 0;
          remainingWebhookDeliveries -= 1;
          webhookAllowanceUsed = previousUsed + 1;
          if (input.operationalEmailDeliveryStore !== undefined && webhookAllowanceLimit !== null) {
            await queueAllowanceThresholdNotifications({
              store: input.operationalEmailDeliveryStore,
              project_id: event.project_id,
              meter: "monthly_webhook_deliveries",
              previous_used: previousUsed,
              next_used: webhookAllowanceUsed,
              limit: webhookAllowanceLimit,
              usage_window_starts_at: webhookUsageWindowStartsAt,
              usage_window_ends_at: webhookUsageWindowEndsAt
            });
          }
        }
      }
    }
  };
}

export function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function buildGitHubAppJwt(appId: string, privateKeyPem: string, now: Date): string {
  const issuedAtSeconds = Math.floor(now.getTime() / 1000);
  const payload = {
    iat: issuedAtSeconds - 30,
    exp: issuedAtSeconds + 9 * 60,
    iss: appId
  };
  const encodedHeader = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(createPrivateKey(privateKeyPem));
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function normalizeGitHubPrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function createGitHubDispatchTransport(input: {
  appId: string;
  privateKey: string;
  tokenCache: GitHubDispatchTokenCache;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  createAppJwt?: (appId: string, privateKey: string, now: Date) => string;
}): GitHubDispatchTransport {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date());
  const createAppJwt = input.createAppJwt ?? buildGitHubAppJwt;
  const normalizedPrivateKey = normalizeGitHubPrivateKey(input.privateKey);

  async function getInstallationToken(installationId: number): Promise<string> {
    const cacheKey = `github-installation-token:${installationId}`;
    const cached = await input.tokenCache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const response = await fetchImpl(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${createAppJwt(input.appId, normalizedPrivateKey, now())}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": "DebugBundle/0.1"
        }
      }
    );
    if (!response.ok) {
      throw new GitHubDispatchDeliveryError(
        `github_dispatch_token_error_${response.status}`,
        response.status,
        null
      );
    }

    const body = (await response.json()) as { token?: unknown };
    if (typeof body.token !== "string" || body.token.length === 0) {
      throw new GitHubDispatchDeliveryError("github_dispatch_token_invalid_response", null, null);
    }

    await input.tokenCache.set(cacheKey, body.token, 50 * 60);
    return body.token;
  }

  return {
    async deliver(event): Promise<void> {
      const token = await getInstallationToken(event.installation_id);
      const response = await fetchImpl(
        `https://api.github.com/repos/${event.repo_owner}/${event.repo_name}/dispatches`,
        {
          method: "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `token ${token}`,
            "content-type": "application/json",
            "x-github-api-version": "2022-11-28",
            "user-agent": "DebugBundle/0.1"
          },
          body: JSON.stringify({
            event_type: "debugbundle.incident",
            client_payload: {
              ...event.dispatch_payload,
              debugbundle: {
                ...(typeof event.dispatch_payload["debugbundle"] === "object" &&
                event.dispatch_payload["debugbundle"] !== null
                  ? event.dispatch_payload["debugbundle"]
                  : {}),
                dispatch_id: event.delivery_id,
                dispatched_at: now().toISOString()
              }
            }
          })
        }
      );

      if (!response.ok) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterSeconds =
          retryAfterHeader === null ? null : Number.parseInt(retryAfterHeader, 10);
        throw new GitHubDispatchDeliveryError(
          `github_dispatch_http_error_${response.status}`,
          response.status,
          Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null
        );
      }
    }
  };
}

export function createWorkerHealthServer(input: {
  port: number;
  readinessCheck?: () => Promise<void>;
}): Server {
  const startedAtMs = Date.now();

  const server = createServer((req, res) => {
    const url = req.url ?? "";

    if (url === "/health") {
      const uptime = (Date.now() - startedAtMs) / 1000;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime }));
      return;
    }

    if (url === "/ready") {
      if (input.readinessCheck === undefined) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ready" }));
        return;
      }

      void input.readinessCheck().then(
        () => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "ready" }));
        },
        (error: unknown) => {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              status: "not_ready",
              reason: error instanceof Error ? error.message : String(error)
            })
          );
        }
      );
      return;
    }

    if (url === "/live") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "live" }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(input.port);
  return server;
}

interface CreateLifecycleWebhookTransportInput {
  timeoutMs: number;
}

function computeWebhookSignature(payload: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return `sha256=${digest}`;
}

export function createLifecycleWebhookTransport(
  input: CreateLifecycleWebhookTransportInput
): LifecycleWebhookTransport {
  return {
    async deliver(event): Promise<void> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

      try {
        const serializedPayload = JSON.stringify(event.payload);
        const response = await fetch(event.target_url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-debugbundle-signature": computeWebhookSignature(
              serializedPayload,
              event.signing_secret
            )
          },
          body: serializedPayload,
          signal: controller.signal
        });

        if (!response.ok) {
          throw new LifecycleWebhookDeliveryError(
            `webhook_http_error_${response.status}`,
            response.status
          );
        }
      } catch (error) {
        if (error instanceof LifecycleWebhookDeliveryError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw new LifecycleWebhookDeliveryError("webhook_timeout", null);
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new LifecycleWebhookDeliveryError(`webhook_transport_error:${message}`, null);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export { createAlertEmailDigestTransport, createAlertTransport } from "./worker-alert-transports.js";

export {
  createWeeklyReportTransport,
  scheduleDueAlertEmailDigests,
  scheduleDueGitHubDispatches,
  scheduleDueWebhookDeliveries,
  scheduleRetentionCleanup,
  scheduleWeeklyReports
} from "./worker-weekly-reports.js";
