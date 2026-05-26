import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";

import { deriveProbeTriggerTokenKey, requireProjectToken } from "../../../../packages/auth/src/index.js";
import { getTierCapabilities, resolvePolicy, PRESET_DEFAULTS, getDefaultPreset } from "../../../../packages/shared-types/src/index.js";
import type { ResolvedCapturePolicy } from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies, ApiServerContext } from "../api-types.js";
import { isProjectTokenOriginAllowed } from "../project-token-origins.js";

const API_SECURITY_TXT = [
  "Contact: https://github.com/debugbundle/debugbundle/security/advisories/new",
  "Policy: https://github.com/debugbundle/debugbundle/security/policy",
  "Canonical: https://api.debugbundle.com/.well-known/security.txt",
  "Preferred-Languages: en",
  "Expires: 2027-05-07T00:00:00.000Z"
].join("\n");

export function registerHealthRoutes(app: FastifyInstance, dependencies: ApiDependencies, context: ApiServerContext): void {
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
    const projectAuth = await requireProjectToken({
      authorizationHeader: request.headers.authorization,
      resolveByTokenHash: (tokenHash) => dependencies.ingestionMetadata.resolveProjectByTokenHash(tokenHash)
    });
    if (!projectAuth.ok) {
      return reply.status(401).send({
        error: "invalid_project_token"
      });
    }
    if (!isProjectTokenOriginAllowed({ headers: request.headers, projectToken: projectAuth.context })) {
      return reply.status(403).send({
        error: "origin_not_allowed"
      });
    }

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
    let capturePolicy: ResolvedCapturePolicy = { preset: defaultPreset, ...PRESET_DEFAULTS[defaultPreset] };
    if (dependencies.capturePolicyManagement !== undefined) {
      const policyRecord = await dependencies.capturePolicyManagement.getCapturePolicyForProject({
        organization_id: "",
        project_id: projectAuth.context.project_id
      });
      if (policyRecord !== null) {
        capturePolicy = resolvePolicy(policyRecord);
      }
    }

    const captureRules =
      dependencies.captureRuleManagement === undefined
        ? []
        : await dependencies.captureRuleManagement.listActiveCaptureRulesForProject({
            project_id: projectAuth.context.project_id,
            now: nowIso
          });

    const responseBody = {
      probes_enabled: true,
      remote_probes_enabled: caps.remote_probes,
      active_probes: caps.remote_probes ? activations : [],
      poll_interval_ms: 60000,
      capture_policy: capturePolicy,
      capture_rules: captureRules,
      ...(caps.remote_probes
        ? { trigger_token_key: deriveProbeTriggerTokenKey(projectAuth.context.project_id) }
        : {})
    };

    const etag = `"${createHash("sha256").update(JSON.stringify(responseBody), "utf8").digest("hex").slice(0, 16)}"`;;
    reply.header("Cache-Control", "public, s-maxage=30");
    reply.header("ETag", etag);

    const ifNoneMatch = request.headers["if-none-match"];
    if (ifNoneMatch === etag) {
      return reply.status(304).send();
    }

    return reply.status(200).send(responseBody);
  });
}
