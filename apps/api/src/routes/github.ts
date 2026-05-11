import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";

import {
  buildClearedGitHubAppInstallStateCookie,
  buildGitHubAppInstallStateCookie,
  GITHUB_APP_INSTALL_STATE_COOKIE_NAME,
  readCookieValue
} from "../../../../packages/auth/src/index.js";
import { getTierCapabilities } from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth, requireRateLimitedOwnerMemberAuth } from "../api-helpers.js";
import {
  GitHubAppCallbackQuerySchema,
  GitHubAppInstallUrlQuerySchema,
  GitHubDispatchDeliveriesQuerySchema,
  GitHubDispatchDeliveryRetryParamsSchema,
  GitHubDispatchRuleBodySchema,
  GitHubDispatchRuleParamsSchema,
  GitHubProjectRepoBodySchema,
  ProjectParamsSchema,
  UpdateGitHubDispatchRuleBodySchema
} from "../schemas.js";

function resolveAppRedirectBaseUrl(): string {
  return (process.env["APP_BASE_URL"] ?? "http://localhost:5291").replace(/\/+$/, "");
}

function shouldUseSecureCookies(): boolean {
  return process.env["AUTH_COOKIE_SECURE"] !== "false";
}

function resolveGitHubAppInstallStateSecret(): string | null {
  const appSecret = process.env["GITHUB_APP_STATE_SECRET"]?.trim();
  if (appSecret !== undefined && appSecret.length > 0) {
    return appSecret;
  }

  const oauthSecret = process.env["GITHUB_OAUTH_STATE_SECRET"]?.trim();
  if (oauthSecret !== undefined && oauthSecret.length > 0) {
    return oauthSecret;
  }

  return null;
}

function normalizeGitHubInstallReturnPath(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }

  return normalized;
}

function buildGitHubInstallState(input: {
  organizationId: string;
  returnTo: string;
  secret: string;
  now?: Date;
  lifetimeMs?: number;
}): { token: string; expires_at: string } {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.lifetimeMs ?? 10 * 60 * 1000)).toISOString();
  const payload = Buffer.from(
    JSON.stringify({
      nonce: randomBytes(16).toString("hex"),
      organization_id: input.organizationId,
      return_to: input.returnTo,
      expires_at: expiresAt
    }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", input.secret).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expires_at: expiresAt };
}

function readGitHubInstallState(
  state: string,
  secret: string,
  now: Date = new Date()
): { organization_id: string; return_to: string } | null {
  const [payload, signature, ...rest] = state.split(".");
  if (payload === undefined || signature === undefined || rest.length > 0) {
    return null;
  }

  const expectedSignature = createHmac("sha256", secret).update(payload).digest("base64url");
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsedPayload !== "object" || parsedPayload === null) {
    return null;
  }

  const payloadRecord = parsedPayload as {
    organization_id?: unknown;
    return_to?: unknown;
    expires_at?: unknown;
  };
  const returnTo = normalizeGitHubInstallReturnPath(
    typeof payloadRecord.return_to === "string" ? payloadRecord.return_to : undefined
  );
  if (returnTo === null) {
    return null;
  }
  if (typeof payloadRecord.organization_id !== "string" || payloadRecord.organization_id.length === 0) {
    return null;
  }
  if (typeof payloadRecord.expires_at !== "string" || Number.isNaN(Date.parse(payloadRecord.expires_at))) {
    return null;
  }
  if (Date.parse(payloadRecord.expires_at) <= now.getTime()) {
    return null;
  }

  return {
    organization_id: payloadRecord.organization_id,
    return_to: returnTo
  };
}

async function ensureGitHubAutomationEnabled(
  dependencies: ApiDependencies,
  organizationId: string
): Promise<boolean> {
  if (dependencies.billingManagement === undefined) {
    return false;
  }

  const summary = await dependencies.billingManagement.getBillingSummaryForOrganization({
    organization_id: organizationId,
    now: new Date().toISOString()
  });

  return summary !== null && getTierCapabilities(summary.plan).github_automation;
}

function mapGithubManagementError(error: string): { status: number; body: { error: string } } {
  switch (error) {
    case "installation_not_found":
      return { status: 404, body: { error: "installation_not_found" } };
    case "installation_suspended":
      return { status: 409, body: { error: "installation_suspended" } };
    case "installation_removed":
      return { status: 409, body: { error: "installation_removed" } };
    case "project_not_found":
      return { status: 404, body: { error: "project_not_found" } };
    case "repo_not_found":
      return { status: 404, body: { error: "repo_not_found" } };
    case "rule_not_found":
      return { status: 404, body: { error: "rule_not_found" } };
    case "delivery_not_found":
      return { status: 404, body: { error: "delivery_not_found" } };
    case "rule_limit_reached":
      return { status: 409, body: { error: "rule_limit_reached" } };
    default:
      return { status: 503, body: { error } };
  }
}

export function registerGitHubRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/github/app/install-url", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedQuery = GitHubAppInstallUrlQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const stateSecret = resolveGitHubAppInstallStateSecret();
    if (stateSecret === null) {
      return reply.status(503).send({ error: "github_not_configured" });
    }

    const returnTo = normalizeGitHubInstallReturnPath(parsedQuery.data.return_to) ?? "/projects";
    const installState = buildGitHubInstallState({
      organizationId: member.organization_id,
      returnTo,
      secret: stateSecret
    });
    const installUrl = new URL(await dependencies.githubManagement.getInstallUrl());
    installUrl.searchParams.set("state", installState.token);

    reply.header(
      "Set-Cookie",
      buildGitHubAppInstallStateCookie(installState.token, installState.expires_at, { secure: shouldUseSecureCookies() })
    );
    return reply.status(200).send({ install_url: installUrl.toString() });
  });

  app.get("/v1/github/installation", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const installation = await dependencies.githubManagement.getInstallationForOrganization({
      organization_id: member.organization_id
    });
    return reply.status(200).send({ installation });
  });

  app.delete("/v1/github/installation", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const deleted = await dependencies.githubManagement.disconnectInstallationForOrganization({
      organization_id: member.organization_id
    });
    if (!deleted) {
      return reply.status(404).send({ error: "installation_not_found" });
    }

    return reply.status(204).send();
  });

  app.get("/v1/github/repositories", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const repositories = await dependencies.githubManagement.listRepositoriesForOrganization({
      organization_id: member.organization_id
    });
    if (!Array.isArray(repositories)) {
      const mapped = mapGithubManagementError(repositories);
      return reply.status(mapped.status).send(mapped.body);
    }

    return reply.status(200).send({ repositories });
  });

  app.get("/v1/projects/:id/github/repo", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const repo = await dependencies.githubManagement.getProjectRepoForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id
    });
    if (repo === null) {
      return reply.status(404).send({ error: "repo_not_found" });
    }

    return reply.status(200).send({ repo });
  });

  app.put("/v1/projects/:id/github/repo", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }
    const parsedBody = GitHubProjectRepoBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const repo = await dependencies.githubManagement.setProjectRepoForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      owner: parsedBody.data.owner,
      repo: parsedBody.data.repo
    });
    if (typeof repo === "string") {
      const mapped = mapGithubManagementError(repo);
      return reply.status(mapped.status).send(mapped.body);
    }

    return reply.status(200).send({ repo });
  });

  app.delete("/v1/projects/:id/github/repo", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const removed = await dependencies.githubManagement.removeProjectRepoForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id
    });
    if (!removed) {
      return reply.status(404).send({ error: "repo_not_found" });
    }

    return reply.status(204).send();
  });

  app.get("/v1/projects/:id/github/rules", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const rules = await dependencies.githubManagement.listProjectRulesForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id
    });
    if (rules === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({ rules });
  });

  app.get("/v1/projects/:id/github/deliveries", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }
    const parsedQuery = GitHubDispatchDeliveriesQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const deliveries = await dependencies.githubManagement.listProjectDeliveriesForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      ...(parsedQuery.data.status === undefined ? {} : { status: parsedQuery.data.status }),
      limit: parsedQuery.data.limit
    });

    return reply.status(200).send({ deliveries });
  });

  app.post("/v1/projects/:id/github/deliveries/:deliveryId/retry", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = GitHubDispatchDeliveryRetryParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_delivery_id" });
    }

    const delivery = await dependencies.githubManagement.retryProjectDeliveryForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      delivery_id: parsedParams.data.deliveryId
    });
    if (typeof delivery === "string") {
      const mapped = mapGithubManagementError(delivery);
      return reply.status(mapped.status).send(mapped.body);
    }

    return reply.status(200).send({ delivery });
  });

  app.get("/v1/projects/:id/github/rules/:ruleId", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = GitHubDispatchRuleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_rule_id" });
    }

    const rule = await dependencies.githubManagement.getProjectRuleForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      rule_id: parsedParams.data.ruleId
    });
    if (rule === null) {
      return reply.status(404).send({ error: "rule_not_found" });
    }

    return reply.status(200).send({ rule });
  });

  app.post("/v1/projects/:id/github/rules", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }
    const parsedBody = GitHubDispatchRuleBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const rule = await dependencies.githubManagement.createProjectRuleForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      name: parsedBody.data.name,
      enabled: parsedBody.data.enabled,
      event_types: parsedBody.data.event_types,
      environments: parsedBody.data.environments,
      services: parsedBody.data.services,
      severity_min: parsedBody.data.severity_min,
      bundle_type: parsedBody.data.bundle_type,
      incident_status: parsedBody.data.incident_status,
      cooldown_seconds: parsedBody.data.cooldown_seconds
    });
    if (typeof rule === "string") {
      const mapped = mapGithubManagementError(rule);
      return reply.status(mapped.status).send(mapped.body);
    }

    return reply.status(201).send({ rule });
  });

  app.patch("/v1/projects/:id/github/rules/:ruleId", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = GitHubDispatchRuleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_rule_id" });
    }
    const parsedBody = UpdateGitHubDispatchRuleBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const updateInput: {
      organization_id: string;
      project_id: string;
      rule_id: string;
      name?: string;
      enabled?: boolean;
      event_types?: string[];
      environments?: string[];
      services?: string[];
      severity_min?: "low" | "medium" | "high" | "critical";
      bundle_type?: "failure" | "improvement";
      incident_status?: "new_only" | "reopened_only" | "new_or_reopened";
      cooldown_seconds?: number;
    } = {
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      rule_id: parsedParams.data.ruleId
    };

    if (parsedBody.data.name !== undefined) {
      updateInput.name = parsedBody.data.name;
    }
    if (parsedBody.data.enabled !== undefined) {
      updateInput.enabled = parsedBody.data.enabled;
    }
    if (parsedBody.data.event_types !== undefined) {
      updateInput.event_types = parsedBody.data.event_types;
    }
    if (parsedBody.data.environments !== undefined) {
      updateInput.environments = parsedBody.data.environments;
    }
    if (parsedBody.data.services !== undefined) {
      updateInput.services = parsedBody.data.services;
    }
    if (parsedBody.data.severity_min !== undefined) {
      updateInput.severity_min = parsedBody.data.severity_min;
    }
    if (parsedBody.data.bundle_type !== undefined) {
      updateInput.bundle_type = parsedBody.data.bundle_type;
    }
    if (parsedBody.data.incident_status !== undefined) {
      updateInput.incident_status = parsedBody.data.incident_status;
    }
    if (parsedBody.data.cooldown_seconds !== undefined) {
      updateInput.cooldown_seconds = parsedBody.data.cooldown_seconds;
    }

    const rule = await dependencies.githubManagement.updateProjectRuleForOrganization(updateInput);
    if (typeof rule === "string") {
      const mapped = mapGithubManagementError(rule);
      return reply.status(mapped.status).send(mapped.body);
    }

    return reply.status(200).send({ rule });
  });

  app.delete("/v1/projects/:id/github/rules/:ruleId", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }
    if (!(await ensureGitHubAutomationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = GitHubDispatchRuleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_rule_id" });
    }

    const deleted = await dependencies.githubManagement.deleteProjectRuleForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      rule_id: parsedParams.data.ruleId
    });
    if (!deleted) {
      return reply.status(404).send({ error: "rule_not_found" });
    }

    return reply.status(204).send();
  });

  app.get("/v1/github/app/callback", async (request, reply) => {
    const parsedQuery = GitHubAppCallbackQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }
    if (dependencies.githubManagement === undefined) {
      return reply.status(503).send({ error: "github_not_configured" });
    }

    const stateSecret = resolveGitHubAppInstallStateSecret();
    const stateCookie = readCookieValue(request.headers.cookie, GITHUB_APP_INSTALL_STATE_COOKIE_NAME);
    if (stateSecret === null || parsedQuery.data.state === undefined || stateCookie === null || stateCookie !== parsedQuery.data.state) {
      reply.header("Set-Cookie", buildClearedGitHubAppInstallStateCookie({ secure: shouldUseSecureCookies() }));
      return reply.status(400).send({ error: "invalid_state" });
    }

    const installState = readGitHubInstallState(parsedQuery.data.state, stateSecret);
    if (installState === null) {
      reply.header("Set-Cookie", buildClearedGitHubAppInstallStateCookie({ secure: shouldUseSecureCookies() }));
      return reply.status(400).send({ error: "invalid_state" });
    }

    const installation = await dependencies.githubManagement.completeGithubInstallationForOrganization({
      organization_id: installState.organization_id,
      installation_id: parsedQuery.data.installation_id
    });
    if (installation === "github_not_configured") {
      return reply.status(503).send({ error: "github_not_configured" });
    }

    reply.header("Set-Cookie", buildClearedGitHubAppInstallStateCookie({ secure: shouldUseSecureCookies() }));
    return reply.redirect(`${resolveAppRedirectBaseUrl()}${installState.return_to}`);
  });

  app.register((scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
      done(null, body);
    });

    scope.post("/v1/github/app/webhook", async (request, reply) => {
      if (dependencies.githubManagement === undefined) {
        return reply.status(503).send({ error: "github_not_configured" });
      }

      const signature = request.headers["x-hub-signature-256"];
      if (typeof signature !== "string") {
        return reply.status(400).send({ error: "missing_github_signature" });
      }
      if (!(request.body instanceof Buffer)) {
        return reply.status(400).send({ error: "invalid_body" });
      }
      if (!dependencies.githubManagement.verifyWebhookSignature({ rawBody: request.body, signature })) {
        return reply.status(400).send({ error: "invalid_signature" });
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(request.body.toString("utf8")) as Record<string, unknown>;
      } catch {
        return reply.status(400).send({ error: "invalid_payload" });
      }

      const eventName = request.headers["x-github-event"];
      if (typeof eventName !== "string") {
        return reply.status(400).send({ error: "missing_github_event" });
      }

      await dependencies.githubManagement.processWebhook({ eventName, payload });
      return reply.status(200).send({ received: true });
    });
  });
}
