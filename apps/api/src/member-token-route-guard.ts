import type { FastifyInstance, FastifyReply } from "fastify";
import {
  canPerformProjectAction,
  readBearerToken,
  MEMBER_TOKEN_PREFIX,
  tokenAllowsProject,
  type ProjectAction
} from "../../../packages/auth/src/index.js";
import type { ApiDependencies } from "./api-types.js";
import { isSharedProjectAccessSuspended, requireRequestMemberAuth } from "./api-helpers.js";
import { memberReadScope } from "./member-access-scope.js";

const DATA_READ_ROUTES = new Set([
  "/v1/projects",
  "/v1/services",
  "/v1/incidents",
  "/v1/incidents/:id",
  "/v1/incidents/:id/context",
  "/v1/incidents/:id/bundle",
  "/v1/incidents/:id/reproduction",
  "/v1/logs",
  "/v1/improvements",
  "/v1/improvements/:id"
]);
const ISSUE_WRITE_ROUTES = new Set([
  "/v1/incidents/resolve",
  "/v1/incidents/reopen",
  "/v1/incidents/:id/resolve",
  "/v1/incidents/:id/reopen",
  "/v1/improvements/:id/resolve",
  "/v1/improvements/:id/reopen",
  "/v1/improvements/:id/snooze",
  "/v1/incidents/:id/capture-rule-suggestion",
  "/v1/incidents/:id/capture-rules"
]);

function hasProjectPermission(permissions: readonly string[], action: ProjectAction): boolean {
  return (
    permissions.includes("project:admin") ||
    (action === "read" &&
      (permissions.includes("project:read") || permissions.includes("project:write"))) ||
    (action === "write" && permissions.includes("project:write"))
  );
}

/** Explicit resource boundaries for restricted credentials. New account-wide
 * routes fail closed until their own scope-aware implementation is registered. */
export function registerMemberTokenRouteGuard(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.addHook("preHandler", async (request, reply) => {
    const route = request.routeOptions.url ?? "";
    // SDK endpoints authenticate project tokens themselves. Never look up a
    // member/session credential or add member-authority work to ingestion.
    if (route === "/v1/events" || route === "/v1/sdk/config") return;
    if (!readBearerToken(request.headers.authorization)?.startsWith(MEMBER_TOKEN_PREFIX)) return;
    const member = await requireRequestMemberAuth(request, dependencies);
    const policy = member?.token_policy;
    if (member === null || policy === undefined) return;
    const read = request.method === "GET" || request.method === "HEAD";
    const forbidden = (): FastifyReply =>
      reply.status(403).send({ error: "token_permission_denied" });

    if (
      route === "/v1/organizations/:organizationId/report-definitions" ||
      route === "/v1/organizations/:organizationId/report-definitions/:definitionId" ||
      route === "/v1/organizations/:organizationId/report-definitions/:definitionId/allowance" ||
      route === "/v1/organizations/:organizationId/reports" ||
      route === "/v1/organizations/:organizationId/reports/:runId" ||
      route === "/v1/organizations/:organizationId/reports/:runId/cancel" ||
      route === "/v1/organizations/:organizationId/reports/:runId/document" ||
      route === "/v1/organizations/:organizationId/reports/:runId/html" ||
      route === "/v1/organizations/:organizationId/reports/:runId/sources/:reference" ||
      route === "/v1/organizations/:organizationId/reports/:runId/pdf" ||
      route === "/v1/organizations/:organizationId/reports/:runId/deliveries" ||
      route === "/v1/organizations/:organizationId/reports/:runId/pdf/file"
    ) {
      const reportRead =
        read ||
        (request.method === "POST" &&
          route === "/v1/organizations/:organizationId/reports/:runId/pdf");
      if (!hasProjectPermission(policy.permissions, reportRead ? "read" : "manage_settings"))
        return forbidden();
      if (
        policy.mode === "organization" &&
        (request.params as { organizationId?: string }).organizationId !== policy.organization_id
      )
        return reply.status(404).send({ error: "organization_not_found" });
      // The report service checks the actual principal against every saved origin;
      // a readable project or organisation role alone never grants mixed-scope access.
      return;
    }

    if (policy.mode === "organization" && route === "/v1/organizations" && read) return;
    if (policy.mode === "organization" && policy.permissions.includes("organization:admin")) {
      if (route.startsWith("/v1/organizations/:id")) {
        return (request.params as { id?: string }).id === policy.organization_id
          ? undefined
          : reply.status(404).send({ error: "organization_not_found" });
      }
      if (
        route === "/v1/projects" &&
        request.method === "POST" &&
        policy.organization_id === member.organization_id
      )
        return;
    }

    if (route.startsWith("/v1/projects/:id")) {
      // Account deletion, ownership and credential issuance have separate gates.
      if (route === "/v1/projects/:id" && request.method === "DELETE") return forbidden();
      if (/\/(tokens|agent-tokens)$/.test(route) && request.method === "POST") {
        return reply.status(403).send({ error: "credential_issuance_forbidden" });
      }
      const action: ProjectAction = read
        ? "read"
        : /\/(capture-rules|probes)(?:\/|$)/.test(route)
          ? "write"
          : "manage_settings";
      if (!hasProjectPermission(policy.permissions, action)) return forbidden();
      const projectId = (request.params as { id?: string }).id;
      if (projectId === undefined) return forbidden();
      const access = await dependencies.projectManagement?.resolveProjectAccessForUser?.({
        user_id: member.member_id,
        project_id: projectId,
        ...memberReadScope(member)
      });
      if (
        access === undefined ||
        access === null ||
        isSharedProjectAccessSuspended(access) ||
        !tokenAllowsProject(policy, {
          project_id: projectId,
          organization_id: access.organization_id,
          origin_project_ids: access.origin_project_ids ?? [projectId],
          action
        })
      ) {
        return reply.status(404).send({ error: "project_not_found" });
      }
      if (!canPerformProjectAction(access.effective_role, action)) return forbidden();
      return;
    }
    if (read && DATA_READ_ROUTES.has(route)) {
      if (!hasProjectPermission(policy.permissions, "read")) return forbidden();
      return;
    }
    if (!read && ISSUE_WRITE_ROUTES.has(route)) {
      if (!hasProjectPermission(policy.permissions, "write")) return forbidden();
      return;
    }
    // These routes require an explicit project in their validated query/body and
    // the common project guard, never merely the token's current organisation.
    if (
      route.startsWith("/v1/analytics/") &&
      (read || (route === "/v1/analytics/bundles" && request.method === "POST"))
    ) {
      if (!hasProjectPermission(policy.permissions, read ? "read" : "write")) return forbidden();
      return;
    }
    return forbidden();
  });
}
