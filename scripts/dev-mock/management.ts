import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { createDevMockFixtures, MockRecord } from "./fixtures.js";
import type { MockResponse } from "./api.js";
import { base } from "./base.js";

const reply = (body: unknown, status = 200): MockResponse => ({ status, body });
const missing = (): MockResponse => reply({ error: "mock_record_not_found" }, 404);
const invalid = (): MockResponse => reply({ error: "invalid_mock_payload" }, 400);
const label = z.string().trim().min(1).max(120);
const role = z.enum(["admin", "member"]);
const webhookEvents = z.enum([
  "bundle.created",
  "bundle.updated",
  "bundle.reopened",
  "bundle.resolved",
  "verification.passed",
  "verification.failed",
  "improvement_bundle.created",
  "incident.spike_detected"
]);
const webhookInput = z.object({
  project_id: z.string().min(1),
  url: z.string().url(),
  events: z.array(webhookEvents).min(1),
  filters: z
    .object({
      environment: z.array(z.string()).optional(),
      service: z.array(z.string()).optional(),
      severity_min: z.enum(["low", "medium", "high", "critical"]).optional(),
      bundle_type: z.array(z.enum(["failure", "improvement"])).optional(),
      verification: z.boolean().optional()
    })
    .default({}),
  is_enabled: z.boolean().default(true)
});

/** Synthetic management state. Secrets are deliberately unusable and no provider is contacted. */
export function createManagementMocks(data: ReturnType<typeof createDevMockFixtures>) {
  const now = new Date().toISOString();
  let sequence = 100;
  let signedIn = true;
  let installationConnected = true;
  const agentTokens: MockRecord[] = [
    {
      token_id: "mock_agent_credential",
      issuer_user_id: "usr_123",
      organization_id: "org_123",
      project_id: "00000000-0000-4000-8000-000000000001",
      label: "Preview agent",
      scope: "incident:read-minimized",
      policy_version: "telemetry-privacy-v1",
      created_at: now,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      revoked_at: null
    }
  ];
  const repos = new Map<string, MockRecord>([["00000000-0000-4000-8000-000000000001", data.repo]]);
  const members = new Map(
    data.projects.map((project) => [
      String(project["project_id"]),
      [
        {
          user_id: "usr_123",
          email: "demo@example.test",
          role: "owner",
          membership_type: "owner",
          avatar_url: null,
          created_at: now
        },
        ...(project["project_id"] === "00000000-0000-4000-8000-000000000001"
          ? [
              {
                user_id: "usr_collaborator",
                email: "developer@example.test",
                role: "member",
                membership_type: "collaborator",
                avatar_url: null,
                created_at: now
              }
            ]
          : [])
      ] as MockRecord[]
    ])
  );
  const syncSharing = (projectId: string): void => {
    const project = data.projects.find((row) => row["project_id"] === projectId);
    if (project)
      project["sharing_state"] =
        (members.get(projectId)?.length ?? 0) > 1 ? "shared_by_you" : "private";
  };
  data.projects.forEach((project) => syncSharing(String(project["project_id"])));
  const invites: MockRecord[] = [
    {
      invite_id: "invite_demo",
      project_id: "00000000-0000-4000-8000-000000000001",
      email: "pending@example.test",
      role: "member",
      invited_by_user_id: "usr_123",
      accepted_at: null,
      canceled_at: null,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      created_at: now
    }
  ];
  const tokenTemplate = { created_at: now, last_used_at: now, revoked_at: null, expires_at: null };
  const tokens: MockRecord[] = data.projects.flatMap((project) => [
    {
      ...tokenTemplate,
      token_id: `mock_project_${String(project["project_id"])}`,
      project_id: project["project_id"],
      label: "Production browser ingestion",
      allowed_origins: ["https://app.example.test"]
    },
    {
      ...tokenTemplate,
      token_id: `mock_revoked_${String(project["project_id"])}`,
      project_id: project["project_id"],
      label: "Retired CI token",
      allowed_origins: [],
      revoked_at: now
    }
  ]);
  const memberTokens: MockRecord[] = [
    {
      ...tokenTemplate,
      token_id: "mock_member_cli",
      user_id: "usr_123",
      organization_id: "org_123",
      label: "Local CLI and MCP"
    }
  ];
  const probes: MockRecord[] = [
    {
      activation_id: "probe_demo",
      project_id: "00000000-0000-4000-8000-000000000001",
      label_pattern: "checkout.*",
      service: "saycheese-frontend",
      environment: "production",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      trigger_expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: now
    }
  ];
  const webhooks: MockRecord[] = [
    {
      webhook_id: "wh_demo",
      project_id: "00000000-0000-4000-8000-000000000001",
      created_by_user_id: "usr_123",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created", "verification.passed"],
      filters: {},
      is_enabled: true,
      created_at: now,
      updated_at: now
    }
  ];
  const webhookDeliveries = new Map<string, MockRecord[]>([
    [
      "wh_demo",
      [
        {
          delivery_id: "wh_delivery_demo",
          event_type: "bundle.created",
          status: "delivered",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: 200,
          last_attempted_at: now,
          last_error: null
        },
        {
          delivery_id: "wh_delivery_failed",
          event_type: "verification.failed",
          status: "failed",
          attempt_count: 3,
          next_attempt_at: null,
          last_response_code: 503,
          last_attempted_at: now,
          last_error: "mock_endpoint_unavailable"
        }
      ]
    ]
  ]);
  const channels: MockRecord[] = [
    {
      channel_id: "weekly_demo",
      project_id: "00000000-0000-4000-8000-000000000001",
      channel: "email",
      config: { to: ["demo@example.test"] },
      schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
      is_enabled: true,
      created_at: now,
      updated_at: now
    },
    {
      channel_id: "weekly_slack_demo",
      project_id: "00000000-0000-4000-8000-000000000001",
      channel: "slack",
      config: { slack_destination_id: "slack_demo" },
      schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
      is_enabled: true,
      created_at: now,
      updated_at: now
    }
  ];
  const destinations: MockRecord[] = [
    {
      slack_destination_id: "slack_demo",
      project_id: "00000000-0000-4000-8000-000000000001",
      organization_id: "org_123",
      slack_team_id: "mock_team",
      slack_team_name: "Demo workspace",
      slack_channel_id: "mock_channel",
      slack_channel_name: "alerts",
      installed_by_member_id: "usr_123",
      is_active: true,
      created_at: now,
      updated_at: now
    }
  ];
  const connections: MockRecord[] = [
    {
      grant_id: "mock_openai",
      client_name: "ChatGPT and Codex",
      organization_name: "Demo organization",
      product_scopes: ["debugbundle:incidents:read", "debugbundle:health:read"],
      consented_at: now,
      expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
      revoked_at: null,
      status: "active"
    }
  ];
  function scoped(rows: MockRecord[], projectId: string | null): MockRecord[] {
    return rows.filter((row) => row["project_id"] === projectId);
  }
  function handle(
    method: string,
    path: string,
    query: URLSearchParams,
    payload: unknown
  ): MockResponse | undefined {
    const projectMatch = /^\/v1\/projects\/([^/]+)/.exec(path);
    const suppliedProject = z.object({ project_id: z.string().optional() }).safeParse(payload);
    const projectId =
      projectMatch?.[1] ??
      query.get("project_id") ??
      (suppliedProject.success ? (suppliedProject.data.project_id ?? null) : null);
    const project = data.projects.find((row) => row["project_id"] === projectId);
    const route = path.replace(/^\/v1\/projects\/[^/]+/, "/v1");
    const read = method === "GET";
    if (projectMatch && !project) return missing();
    if (path === "/v1/github/installation") {
      if (read) return reply({ installation: installationConnected ? data.installation : null });
      if (method === "DELETE") {
        installationConnected = false;
        repos.clear();
        return reply(null, 204);
      }
    }
    const agentMatch = /^\/v1\/agent-tokens(?:\/([^/]+)\/revoke)?$/.exec(route);
    if (project && agentMatch) {
      if (read) return reply({ tokens: scoped(agentTokens, projectId) });
      if (method === "POST" && !agentMatch[1])
        return reply({ error: "agent_token_issuance_unavailable" }, 503);
      const token = scoped(agentTokens, projectId).find((row) => row["token_id"] === agentMatch[1]);
      if (method === "POST" && token) {
        token["revoked_at"] = new Date().toISOString();
        return reply({ token });
      }
      return missing();
    }
    if (read && path === "/v1/alert-groups") return reply({ groups: [], next_cursor: null });
    if (read && path === "/v1/auth/session")
      return reply({ session: signedIn ? data.session : null });
    if (method === "POST" && path === "/v1/auth/logout") {
      signedIn = false;
      return reply({ success: true });
    }
    if (method === "POST" && path === "/v1/auth/request-code") return reply({ success: true });
    if (method === "POST" && path === "/v1/auth/verify-code") {
      const input = z
        .object({ email: z.string().email(), code: z.literal("123456") })
        .safeParse(payload);
      if (!input.success) return invalid();
      signedIn = true;
      return reply({ session: data.session });
    }
    if (read && path === "/v1/account/export")
      return reply({ synthetic: true, account: data.session.email, projects: data.projects });
    if (method === "POST" && path === "/v1/account/avatar/import-gravatar")
      return reply({ error: "gravatar_not_found" }, 404);
    if (method === "POST" && path === "/v1/account/delete/request-otp")
      return reply({ success: true });
    if (method === "DELETE" && path === "/v1/account") {
      const input = z
        .object({ confirmation_text: z.literal("Delete my account"), otp: z.literal("123456") })
        .safeParse(payload);
      if (!input.success) return invalid();
      signedIn = false;
      return reply({
        account: {
          deleted_at: new Date().toISOString(),
          organization_id: "org_123",
          user_deleted: true
        }
      });
    }
    if (read && path === "/v1/internal/analytics/access") return reply({ allowed: false });
    if (path === "/v1/projects" && method === "POST") {
      const input = z
        .object({
          name: label,
          slug: z.string().min(1),
          environment_default: z.string().default("production"),
          color_tag: z.string().nullable().default(null)
        })
        .safeParse(payload);
      if (!input.success) return invalid();
      const record = {
        ...structuredClone(base.projects),
        ...input.data,
        project_id: randomUUID(),
        sharing_state: "private",
        created_at: now,
        updated_at: now
      };
      data.projects.push(record);
      members.set(record.project_id, [
        {
          user_id: "usr_123",
          email: "demo@example.test",
          role: "owner",
          membership_type: "owner",
          avatar_url: null,
          created_at: now
        }
      ]);
      data.analyticsSettings.set(record.project_id, structuredClone(base.analyticsSettings));
      return reply({ project: record });
    }
    if (projectMatch && /^\/v1\/projects\/[^/]+$/.test(path) && method === "DELETE") {
      data.projects.splice(data.projects.indexOf(project!), 1);
      return reply({ project });
    }
    if (project && route === "/v1/github/repo") {
      if (read) return reply({ repo: repos.get(projectId!) ?? null });
      if (method === "DELETE") {
        repos.delete(projectId!);
        return reply({ deleted: true });
      }
      if (method === "PUT") {
        const input = z.object({ owner: label, repo: label }).safeParse(payload);
        if (!input.success) return invalid();
        const repo = {
          ...structuredClone(base.repo),
          project_id: projectId,
          repo_owner: input.data.owner,
          repo_name: input.data.repo,
          updated_at: now
        };
        repos.set(projectId!, repo);
        return reply({ repo });
      }
    }
    const tokenRoute = /^\/v1\/(?:member\/)?tokens(?:\/([^/]+)\/revoke)?$/.exec(route);
    if (tokenRoute) {
      const personal = route.startsWith("/v1/member/");
      const rows = personal ? memberTokens : tokens;
      const visible = personal ? rows : scoped(rows, projectId);
      if (read && !tokenRoute[1])
        return reply({ tokens: visible.filter((row) => row["revoked_at"] === null) });
      if (method === "POST" && tokenRoute[1]) {
        const token = visible.find((row) => row["token_id"] === tokenRoute[1]);
        if (!token) return missing();
        token["revoked_at"] = new Date().toISOString();
        return reply({ revoked: true });
      }
      if (method === "POST") {
        const input = z
          .object({ label, allowed_origins: z.array(z.string().url()).default([]) })
          .safeParse(payload);
        if (!input.success) return invalid();
        const token = {
          ...tokenTemplate,
          last_used_at: null,
          token_id: `mock_token_${sequence++}`,
          label: input.data.label,
          ...(personal
            ? { user_id: "usr_123", organization_id: "org_123" }
            : { project_id: projectId, allowed_origins: input.data.allowed_origins })
        };
        rows.push(token);
        return reply({
          token: {
            ...token,
            plaintext: `mock_dbundle_${personal ? "mem" : "proj"}_${token.token_id}_not_a_credential`
          }
        });
      }
    }
    if (project && route === "/v1/members" && read)
      return reply({ members: members.get(projectId!) ?? [] });
    if (project && route === "/v1/invites" && read)
      return reply({ invites: scoped(invites, projectId) });
    if (project && route === "/v1/invite" && method === "POST") {
      const input = z.object({ email: z.string().email(), role }).safeParse(payload);
      if (!input.success) return invalid();
      const invite = {
        ...input.data,
        invite_id: `mock_invite_${sequence++}`,
        project_id: projectId,
        invited_by_user_id: "usr_123",
        accepted_at: null,
        canceled_at: null,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        created_at: now
      };
      invites.push(invite);
      return reply({ invite });
    }
    const inviteMatch = /^\/v1\/invites\/([^/]+)$/.exec(route);
    if (project && inviteMatch && method === "DELETE") {
      const index = invites.findIndex(
        (row) => row["project_id"] === projectId && row["invite_id"] === inviteMatch[1]
      );
      if (index < 0) return missing();
      invites.splice(index, 1);
      return reply({ canceled: true });
    }
    const memberMatch = /^\/v1\/members\/([^/]+)$/.exec(route);
    if (project && memberMatch) {
      const rows = members.get(projectId!) ?? [];
      const member = rows.find((row) => row["user_id"] === memberMatch[1]);
      if (!member) return missing();
      if (member["role"] === "owner") return invalid();
      if (method === "PATCH") {
        const input = z.object({ role }).safeParse(payload);
        if (!input.success) return invalid();
        Object.assign(member, input.data);
        return reply({ member });
      }
      if (method === "DELETE") {
        rows.splice(rows.indexOf(member), 1);
        syncSharing(projectId!);
        return reply({ removed: true });
      }
    }
    if (project && route === "/v1/membership" && method === "DELETE")
      return reply({ error: "owner_leave_not_allowed" }, 400);
    if (project && route === "/v1/probes" && read)
      return reply({
        activations: scoped(probes, projectId).filter(
          (row) => String(row["expires_at"]) > new Date().toISOString()
        )
      });
    if (project && route === "/v1/probes/activate" && method === "POST") {
      const input = z
        .object({
          label_pattern: label,
          service: z.string().default("*"),
          environment: z.string().default("*"),
          ttl_seconds: z.number().int().min(1).max(3600),
          trigger_ttl_seconds: z.number().int().min(1).max(86400)
        })
        .safeParse(payload);
      if (!input.success) return invalid();
      const activation = {
        ...input.data,
        activation_id: `mock_probe_${sequence++}`,
        project_id: projectId,
        expires_at: new Date(Date.now() + input.data.ttl_seconds * 1000).toISOString(),
        trigger_expires_at: new Date(
          Date.now() + input.data.trigger_ttl_seconds * 1000
        ).toISOString(),
        created_at: now
      };
      probes.push(activation);
      return reply({ activation, trigger_token: "mock_probe_trigger_not_a_credential" });
    }
    if (project && route === "/v1/probes/deactivate" && method === "POST") {
      const input = z.object({ activation_id: z.string() }).safeParse(payload);
      if (!input.success) return invalid();
      const activation = scoped(probes, projectId).find(
        (row) => row["activation_id"] === input.data.activation_id
      );
      if (!activation) return missing();
      probes.splice(probes.indexOf(activation), 1);
      return reply({ deactivated: activation });
    }
    const webhookRoute = /^\/v1\/webhooks(?:\/([^/]+)(?:\/(deliveries|test))?)?$/.exec(path);
    if (webhookRoute) {
      if (!project) return missing();
      const webhook = scoped(webhooks, projectId).find(
        (row) => row["webhook_id"] === webhookRoute[1]
      );
      if (webhookRoute[1] && !webhook) return missing();
      const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .safeParse(query.get("limit") ?? 20);
      if (!limit.success) return invalid();
      if (read && webhookRoute[2] === "deliveries")
        return reply({
          deliveries: (webhookDeliveries.get(webhookRoute[1]!) ?? []).slice(0, limit.data)
        });
      if (read)
        return webhook
          ? reply({ webhook })
          : reply({ webhooks: scoped(webhooks, projectId).slice(0, limit.data) });
      if (method === "POST" && webhookRoute[2] === "test") {
        const input = z
          .object({
            event_type: z.enum(webhookEvents.options).default("verification.passed")
          })
          .safeParse(payload ?? {});
        if (!input.success) return invalid();
        const delivery = {
          delivery_id: `mock_webhook_delivery_${sequence++}`,
          event_type: input.data.event_type,
          status: "delivered",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: 200,
          last_attempted_at: new Date().toISOString(),
          last_error: null
        };
        webhookDeliveries.set(webhookRoute[1]!, [
          delivery,
          ...(webhookDeliveries.get(webhookRoute[1]!) ?? [])
        ]);
        return reply({ delivery });
      }
      if (method === "DELETE" && webhook) {
        webhooks.splice(webhooks.indexOf(webhook), 1);
        webhookDeliveries.delete(String(webhook["webhook_id"]));
        return reply({ deleted: true });
      }
      if (method === "POST" || method === "PATCH") {
        const input = webhookInput.safeParse({
          ...webhook,
          ...(typeof payload === "object" && payload !== null ? payload : {}),
          project_id: projectId
        });
        if (!input.success) return invalid();
        if (webhook) {
          Object.assign(webhook, input.data, { updated_at: new Date().toISOString() });
          return reply({ webhook });
        }
        const created = {
          ...input.data,
          webhook_id: `mock_webhook_${sequence++}`,
          created_by_user_id: "usr_123",
          created_at: now,
          updated_at: now
        };
        webhooks.push(created);
        return reply({
          webhook: { ...created, signing_secret: "mock_webhook_signing_secret_not_a_credential" }
        });
      }
    }
    if (path === "/v1/openai/connections" && read) return reply({ connections });
    if (path === "/v1/openai/connections/revoke" && method === "POST") {
      const input = z.object({ grant_id: z.string() }).safeParse(payload);
      if (!input.success) return invalid();
      const index = connections.findIndex((row) => row["grant_id"] === input.data.grant_id);
      if (index < 0) return missing();
      connections.splice(index, 1);
      return reply({ revoked: true });
    }
    if (path === "/v1/slack/app/install-url" && read)
      return reply({
        install_url: `/projects/${encodeURIComponent(projectId ?? "00000000-0000-4000-8000-000000000001")}/alerts`
      });
    if (project && route === "/v1/slack/destinations" && read)
      return reply({ destinations: scoped(destinations, projectId) });
    const destinationMatch = /^\/v1\/slack\/destinations\/([^/]+)(\/test)?$/.exec(route);
    if (project && destinationMatch) {
      const destination = scoped(destinations, projectId).find(
        (row) => row["slack_destination_id"] === destinationMatch[1]
      );
      if (!destination) return missing();
      if (method === "POST" && destinationMatch[2])
        return reply({ delivered: true, synthetic: true });
      if (method === "DELETE") {
        destinations.splice(destinations.indexOf(destination), 1);
        return reply({ deleted: true });
      }
    }
    const channelMatch = /^\/v1\/weekly-report-channels(?:\/([^/]+))?$/.exec(path);
    if (channelMatch) {
      if (read) return reply({ channels: scoped(channels, projectId) });
      const channel = channels.find((row) => row["channel_id"] === channelMatch[1]);
      if (channelMatch[1] && !channel) return missing();
      if (method === "DELETE" && channel) {
        channels.splice(channels.indexOf(channel), 1);
        return reply({ deleted: true });
      }
      const input = z
        .object({
          project_id: z.string().optional(),
          channel: z.enum(["email", "slack"]).optional(),
          config: z.record(z.string(), z.unknown()).optional(),
          schedule: z
            .object({
              day_of_week: z.string(),
              hour_of_day: z.number().int().min(0).max(23),
              timezone: z.string()
            })
            .optional(),
          is_enabled: z.boolean().optional()
        })
        .safeParse(payload);
      if (!input.success) return invalid();
      if (channel && method === "PATCH") {
        Object.assign(channel, input.data, { updated_at: now });
        return reply({ channel });
      }
      if (method === "POST") {
        const created = {
          ...channels[0],
          ...input.data,
          channel_id: `mock_weekly_${sequence++}`,
          created_by_user_id: "usr_123",
          created_at: now,
          updated_at: now
        };
        channels.push(created);
        return reply({ channel: created });
      }
    }
    return undefined;
  }
  return { handle, isSignedIn: () => signedIn };
}
