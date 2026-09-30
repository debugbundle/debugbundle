import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";

import {
  deriveProbeTriggerTokenKey,
  hashToken,
  readBearerToken,
  requireProjectToken,
  validateAnalyticsWriterToken
} from "../../../../packages/auth/src/index.js";
import {
  AnalyticsCapabilitiesSchema,
  SEMANTIC_ANALYTICS_SCHEMA_VERSION,
  getTierCapabilities,
  resolvePolicy,
  PRESET_DEFAULTS,
  getDefaultPreset,
  captureRuleRequiresServerEvaluation
} from "../../../../packages/shared-types/src/index.js";
import type {
  AnalyticsCapabilities,
  AnalyticsSdkConfig,
  AnalyticsSettings,
  ResolvedCapturePolicy
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies, ApiServerContext } from "../api-types.js";
import { isProjectTokenOriginAllowed } from "../project-token-origins.js";

const API_SECURITY_TXT = [
  "Contact: https://github.com/debugbundle/debugbundle/security/advisories/new",
  "Policy: https://github.com/debugbundle/debugbundle/security/policy",
  "Canonical: https://api.debugbundle.com/.well-known/security.txt",
  "Preferred-Languages: en",
  "Expires: 2027-05-07T00:00:00.000Z"
].join("\n");

const API_ROBOTS_TXT = ["User-agent: *", "Disallow: /"].join("\n");
const DISABLED_ANALYTICS_SDK_CONFIG: AnalyticsSdkConfig = {
  enabled: false,
  privacy_mode: "strict",
  consent_required: false,
  capture_page_views: true,
  capture_route_changes: true,
  capture_actions: false,
  capture_friction_signals: true
};

export function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies,
  context: ApiServerContext
): void {
  app.get("/robots.txt", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; charset=utf-8");
    return reply.status(200).send(`${API_ROBOTS_TXT}\n`);
  });

  app.get("/.well-known/security.txt", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; charset=utf-8");
    return reply.status(200).send(`${API_SECURITY_TXT}\n`);
  });

  app.get("/health", async (_request, reply) => {
    const uptime = (Date.now() - context.startedAtMs) / 1000;
    return reply.status(200).send({
      status: "ok",
      version: context.apiVersion,
      uptime
    });
  });

  app.get("/ready", async (_request, reply) => {
    if (context.readinessCheck !== undefined) {
      try {
        await context.readinessCheck();
      } catch (error) {
        return reply.status(503).send({
          status: "not_ready",
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return reply.status(200).send({
      status: "ready"
    });
  });

  app.get("/live", async (_request, reply) => {
    return reply.status(200).send({
      status: "live"
    });
  });

  app.get("/v1/sdk/config", async (request, reply) => {
    const requestedSchema = request.headers["x-debugbundle-analytics-schema"];
    const negotiated = requestedSchema !== undefined;
    if (negotiated) {
      reply.header("Cache-Control", "private, no-store");
      reply.header(
        "Vary",
        "Authorization, Origin, X-DebugBundle-Analytics-Schema, X-DebugBundle-Analytics-Config"
      );
    }

    const bearer = readBearerToken(request.headers.authorization);
    if (negotiated && bearer?.startsWith("dbundle_an") === true) {
      const writerStore = dependencies.analyticsWriters;
      if (request.headers.origin !== undefined || writerStore === undefined) {
        return reply.status(401).send({ error: "invalid_analytics_writer" });
      }
      const writer = await validateAnalyticsWriterToken(
        bearer,
        (hash) => writerStore.resolveByTokenHash(hash),
        { allowedKinds: ["server"] }
      );
      if (!writer.ok) return reply.status(401).send({ error: "invalid_analytics_writer" });
      if (requestedSchema !== SEMANTIC_ANALYTICS_SCHEMA_VERSION)
        return reply.status(406).send({ error: "unsupported_analytics_schema" });
      return reply.status(200).send({
        analytics_semantic: await resolveSemanticCapability(dependencies, {
          projectId: writer.context.project_id,
          principal: "server_writer",
          credentialHash: hashToken(bearer),
          receivedAt: new Date().toISOString()
        })
      });
    }

    const projectAuth = await requireProjectToken({
      authorizationHeader: request.headers.authorization,
      resolveByTokenHash: (tokenHash) =>
        dependencies.ingestionMetadata.resolveProjectByTokenHash(tokenHash)
    });
    if (!projectAuth.ok) {
      return reply.status(401).send({
        error: "invalid_project_token"
      });
    }
    if (bearer === null) return reply.status(401).send({ error: "invalid_project_token" });
    if (
      !isProjectTokenOriginAllowed({ headers: request.headers, projectToken: projectAuth.context })
    ) {
      return reply.status(403).send({
        error: "origin_not_allowed"
      });
    }
    if (negotiated && requestedSchema !== SEMANTIC_ANALYTICS_SCHEMA_VERSION)
      return reply.status(406).send({ error: "unsupported_analytics_schema" });

    const caps = getTierCapabilities(projectAuth.context.organization_plan);
    const nowIso = new Date().toISOString();
    const activations =
      dependencies.probeManagement === undefined
        ? []
        : await dependencies.probeManagement.listActiveProbesForProject({
            project_id: projectAuth.context.project_id,
            now: nowIso
          });

    const defaultPreset = getDefaultPreset(projectAuth.context.organization_plan);
    let capturePolicy: ResolvedCapturePolicy = {
      preset: defaultPreset,
      ...PRESET_DEFAULTS[defaultPreset]
    };
    if (dependencies.capturePolicyManagement !== undefined) {
      const policyRecord = await dependencies.capturePolicyManagement.getCapturePolicyForProject({
        organization_id: "",
        project_id: projectAuth.context.project_id
      });
      if (policyRecord !== null) {
        capturePolicy = resolvePolicy(policyRecord);
      }
    }

    const activeCaptureRules =
      dependencies.captureRuleManagement === undefined
        ? []
        : await dependencies.captureRuleManagement.listActiveCaptureRulesForProject({
            project_id: projectAuth.context.project_id,
            now: nowIso
          });
    // An older SDK can ignore lifecycle predicates or execute a broader drop before
    // a server-only exception to it. Evaluate the whole rule set at ingestion when
    // any rule requires server evidence, preserving specificity and precedence.
    const captureRules = activeCaptureRules.some(captureRuleRequiresServerEvaluation)
      ? []
      : activeCaptureRules;

    const includesAnalyticsConfig = request.headers["x-debugbundle-analytics-config"] === "1";
    let analyticsConfig = DISABLED_ANALYTICS_SDK_CONFIG;
    if (
      includesAnalyticsConfig &&
      caps.analytics_bundle &&
      dependencies.analyticsSettingsManagement !== undefined
    ) {
      try {
        const analyticsSettings =
          await dependencies.analyticsSettingsManagement.getAnalyticsSettingsForProject({
            organization_id: "",
            project_id: projectAuth.context.project_id
          });
        if (analyticsSettings !== null) {
          analyticsConfig = toAnalyticsSdkConfig(analyticsSettings);
        }
      } catch {
        analyticsConfig = DISABLED_ANALYTICS_SDK_CONFIG;
      }
    }

    const responseBody = {
      probes_enabled: true,
      remote_probes_enabled: caps.remote_probes,
      active_probes: caps.remote_probes ? activations : [],
      poll_interval_ms: 60000,
      ...(includesAnalyticsConfig ? { analytics: analyticsConfig } : {}),
      capture_policy: capturePolicy,
      capture_rules: captureRules,
      ...(caps.remote_probes
        ? { trigger_token_key: deriveProbeTriggerTokenKey(projectAuth.context.project_id) }
        : {}),
      ...(negotiated
        ? {
            analytics_semantic: await resolveSemanticCapability(dependencies, {
              projectId: projectAuth.context.project_id,
              principal: "project_token",
              credentialHash: hashToken(bearer),
              receivedAt: nowIso
            })
          }
        : {})
    };

    if (negotiated) return reply.status(200).send(responseBody);
    const etag = `"${createHash("sha256").update(JSON.stringify(responseBody), "utf8").digest("hex").slice(0, 16)}"`;
    reply.header("Cache-Control", "public, s-maxage=30");
    reply.header("Vary", "X-DebugBundle-Analytics-Config");
    reply.header("ETag", etag);

    const ifNoneMatch = request.headers["if-none-match"];
    if (ifNoneMatch === etag) {
      return reply.status(304).send();
    }

    return reply.status(200).send(responseBody);
  });
}

async function resolveSemanticCapability(
  dependencies: ApiDependencies,
  input: {
    projectId: string;
    principal: "server_writer" | "project_token";
    credentialHash: string;
    receivedAt: string;
  }
): Promise<AnalyticsCapabilities> {
  const ready =
    dependencies.semanticAnalyticsCapabilities?.enabled === true &&
    dependencies.semanticAnalyticsReports?.enabled === true &&
    (input.principal === "server_writer"
      ? dependencies.semanticAnalyticsDelivery?.enabled === true
      : dependencies.semanticAnalyticsClientDelivery?.enabled === true);
  if (!ready) return disabledSemanticCapability(input.projectId, input.principal);
  try {
    const result = await dependencies.semanticAnalyticsCapabilities!.resolve(input);
    const parsed = AnalyticsCapabilitiesSchema.safeParse(result);
    if (
      parsed.success &&
      parsed.data.project_id === input.projectId &&
      parsed.data.principal === input.principal &&
      parsed.data.scope.kind === "project" &&
      parsed.data.scope.project_id === input.projectId &&
      Date.parse(parsed.data.expires_at) > Date.parse(input.receivedAt)
    )
      return parsed.data;
  } catch {
    // Policy and schema failures are private disabled responses, never a broad grant.
  }
  return disabledSemanticCapability(input.projectId, input.principal, "policy_rejected");
}

function disabledSemanticCapability(
  projectId: string,
  principal: "server_writer" | "project_token",
  unavailableReason: "not_enabled" | "policy_rejected" = "not_enabled"
): AnalyticsCapabilities {
  const now = new Date();
  return AnalyticsCapabilitiesSchema.parse({
    protocol: "2026-09-analytics-capabilities-01",
    project_id: projectId,
    principal,
    server_time: now.toISOString(),
    expires_at: new Date(now.getTime() + 300_000).toISOString(),
    enabled: false,
    unavailable_reason: unavailableReason,
    schema_version: SEMANTIC_ANALYTICS_SCHEMA_VERSION,
    scope: { kind: "project", project_id: projectId },
    scope_revision: 1,
    catalog_revision: null,
    namespace_revision: null,
    identity_scope: null,
    known_identity_allowed: false,
    allowed_producers: [],
    allowed_purposes: [],
    consent_required: true,
    privacy_mode: "strict",
    sample_rate: 1,
    max_event_bytes: 16_384,
    max_batch_events: 256,
    max_batch_bytes: 262_144,
    max_properties: 0,
    detailed_retention_days: 90,
    max_event_age_seconds: 604_800,
    correction_seconds: 172_800,
    receipt_retention_days: 90,
    retry_after_max_ms: 300_000
  });
}

function toAnalyticsSdkConfig(settings: AnalyticsSettings): AnalyticsSdkConfig {
  return {
    enabled: settings.enabled,
    privacy_mode: settings.privacy_mode,
    consent_required: settings.consent_required,
    capture_page_views: settings.capture_page_views,
    capture_route_changes: settings.capture_route_changes,
    capture_actions: settings.capture_actions,
    capture_friction_signals: settings.capture_friction_signals
  };
}
