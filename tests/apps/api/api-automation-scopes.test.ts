import { describe, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { createAlertApi } from "../../../packages/alert-client/src/index.js";
import { createWebhookApi } from "../../../packages/webhook-client/src/index.js";
import { createGitHubManagementApi } from "../../../packages/github-client/src/index.js";
import { mockedObject } from "../../helpers/vitest.js";

describe("automation scope intent through typed HTTP clients", () => {
  const project = "00000000-0000-4000-8000-000000000001",
    id = "00000000-0000-4000-8000-000000000002";
  it.each(["alert", "webhook", "github"] as const)(
    "retains explicit scope intent and owner context for %s",
    async (kind) => {
      const dates = {
        created_at: "2026-11-04T00:00:00.000Z",
        updated_at: "2026-11-04T00:00:00.000Z"
      };
      const common = { project_id: project, created_by_user_id: id, ...dates };
      const alert = {
        ...common,
        alert_id: id,
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        severity_lifecycle_scope: null,
        cooldown_seconds: 60,
        config: { to: "owner@example.test" },
        is_enabled: true
      };
      const webhook = {
        ...common,
        webhook_id: id,
        url: "https://example.test/hook",
        events: ["bundle.created"],
        filters: {},
        is_enabled: true
      };
      const rule = {
        ...common,
        rule_id: id,
        name: "Dispatch",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 60
      };
      const update = vi
        .fn()
        .mockResolvedValue(kind === "alert" ? alert : kind === "webhook" ? webhook : rule);
      const app = createApiServer(
        mockedObject<Parameters<typeof createApiServer>[0]>({
          ingestionPersistence: { persistAndEnqueue: vi.fn() },
          ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
          memberAuth: {
            resolveMemberByTokenHash: vi
              .fn()
              .mockResolvedValue({ member_id: id, organization_id: "home" })
          },
          projectManagement: {
            resolveProjectAccessForUser: vi.fn().mockResolvedValue({
              project_id: project,
              organization_id: "owner-account",
              owner_user_id: id,
              effective_role: "admin",
              relationship: "shared",
              organization_plan: "team"
            })
          },
          alertManagement: { updateAlertForOrganization: update },
          webhookManagement: { updateWebhookForOrganization: update },
          githubManagement: { updateProjectRuleForOrganization: update },
          billingManagement: {
            getBillingSummaryForProject: vi.fn().mockResolvedValue({ plan: "team" })
          },
          tokenManagement: {},
          incidentRetrieval: {},
          objectStoreReader: { getObject: vi.fn() },
          webhookDelivery: {}
        })
      );
      const transport = {
        request: async (input: {
          method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
          path: string;
          bearerToken: string;
          body?: unknown;
        }) => {
          const response = await app.inject({
            method: input.method,
            url: input.path,
            headers: { authorization: `Bearer ${input.bearerToken}` },
            ...(input.body === undefined ? {} : { payload: input.body as object })
          });
          return { status: response.statusCode, body: response.json<unknown>() };
        }
      };
      const input = {
        bearerToken: "dbundle_mem_fixture",
        projectId: project,
        projectScope: "current_project" as const
      };
      if (kind === "alert") await createAlertApi(transport).updateAlert({ ...input, alertId: id });
      else if (kind === "webhook")
        await createWebhookApi(transport).updateWebhook({ ...input, webhookId: id });
      else await createGitHubManagementApi(transport).updateProjectRule({ ...input, ruleId: id });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          project_scope: "current_project",
          organization_id: "owner-account",
          actor_user_id: id,
          project_id: project
        })
      );
      const path =
        kind === "github"
          ? `/v1/projects/${project}/github/rules/${id}`
          : `/v1/${kind === "alert" ? "alerts" : "webhooks"}/${id}?project_id=${project}`;
      const invalid = await transport.request({
        method: "PATCH",
        path,
        bearerToken: input.bearerToken,
        body: { project_scope: "all_accounts" }
      });
      expect(invalid.status).toBe(400);
      expect(update).toHaveBeenCalledTimes(1);
      await app.close();
    }
  );
});
