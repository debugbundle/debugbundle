import { describe, expect, it } from "vitest";
import { createDevMockApi } from "../../scripts/dev-mock/api.js";

describe("local preview management data", () => {
  it("simulates probe, weekly-report, repository and project actions without losing their scoped state", () => {
    const api = createDevMockApi();
    const activation = api.handle("POST", "/v1/projects/proj_123/probes/activate", {
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      ttl_seconds: 60,
      trigger_ttl_seconds: 300
    });
    expect(activation.status).toBe(200);
    const record = (activation.body as { activation: { activation_id: string } }).activation;
    expect(
      api.handle("POST", "/v1/projects/proj_123/probes/deactivate", {
        activation_id: record.activation_id
      }).status
    ).toBe(200);
    expect(
      api.handle("PATCH", "/v1/weekly-report-channels/weekly_demo", { is_enabled: false }).body
    ).toHaveProperty("channel.is_enabled", false);
    expect(
      api.handle("POST", "/v1/projects/proj_123/slack/destinations/slack_demo/test").body
    ).toHaveProperty("synthetic", true);
    expect(api.handle("DELETE", "/v1/projects/proj_123/github/repo").status).toBe(200);
    expect(api.handle("GET", "/v1/projects/proj_123/github/repo").body).toMatchObject({
      repo: null
    });
    expect(
      api.handle("PUT", "/v1/projects/proj_123/github/repo", { owner: "demo", repo: "web" }).body
    ).toHaveProperty("repo.repo_name", "web");
    expect(
      api.handle("POST", "/v1/improvements/imp_0/snooze", {
        snoozed_until: new Date(Date.now() + 86400000).toISOString()
      }).body
    ).toHaveProperty("improvement.status", "snoozed");
    for (const id of ["proj_123", "proj_new", "proj_down"])
      expect(api.handle("DELETE", `/v1/projects/${id}`).status).toBe(200);
    expect(
      api.handle("POST", "/v1/projects", {
        name: "Fresh mock app",
        slug: "fresh-mock",
        environment_default: "production"
      }).body
    ).toHaveProperty("project.organization_id", "org_123");
  });
  it.each([
    ["/v1/webhooks?project_id=proj_123&limit=20", "webhooks"],
    ["/v1/projects/proj_123/probes", "activations"],
    ["/v1/projects/proj_123/tokens", "tokens"],
    ["/v1/projects/proj_123/members", "members"],
    ["/v1/projects/proj_123/invites", "invites"],
    ["/v1/member/tokens", "tokens"],
    ["/v1/billing", "billing"],
    ["/v1/openai/connections", "connections"],
    ["/v1/projects/proj_123/slack/destinations", "destinations"],
    ["/v1/weekly-report-channels?project_id=proj_123", "channels"]
  ])("populates %s with synthetic data", (path, key) => {
    const result = createDevMockApi().handle("GET", path);
    expect(result.status).toBe(200);
    const record = (result.body as Record<string, unknown>)[key];
    expect(Array.isArray(record) ? record.length : record).toBeTruthy();
  });

  it("simulates webhook creation and test deliveries, scopes history and reveals secrets only once", () => {
    const api = createDevMockApi();
    const created = api.handle("POST", "/v1/webhooks", {
      project_id: "proj_123",
      url: "https://hooks.example.test/demo",
      events: ["bundle.created"]
    });
    expect(created.status).toBe(200);
    const webhook = (created.body as { webhook: { webhook_id: string; signing_secret: string } })
      .webhook;
    expect(webhook.signing_secret).toContain("mock");
    const path = `/v1/webhooks/${webhook.webhook_id}`;
    expect(api.handle("GET", `${path}?project_id=proj_123`).body).not.toHaveProperty(
      "webhook.signing_secret"
    );
    expect(
      api.handle("POST", `${path}/test?project_id=proj_123`, { event_type: "verification.passed" })
        .body
    ).toHaveProperty("delivery.status", "delivered");
    expect(api.handle("GET", `${path}/deliveries?project_id=proj_123`).body).toHaveProperty(
      "deliveries.0.event_type",
      "verification.passed"
    );
    expect(api.handle("GET", `${path}/deliveries?project_id=proj_new`).status).toBe(404);
    expect(
      api.handle("POST", "/v1/webhooks", { project_id: "proj_123", url: "invalid", events: [] })
        .status
    ).toBe(400);
  });

  it.each(["/v1/projects/proj_123/tokens", "/v1/member/tokens"])(
    "creates and revokes fake tokens at %s without retaining plaintext",
    (path) => {
      const api = createDevMockApi();
      const created = api.handle("POST", path, {
        label: "Preview token",
        allowed_origins: ["http://localhost:5291"]
      });
      expect(created.status).toBe(200);
      const token = (created.body as { token: { token_id: string; plaintext: string } }).token;
      expect(token.plaintext).toContain("mock");
      const records = (api.handle("GET", path).body as { tokens: Record<string, unknown>[] })
        .tokens;
      expect(records.find((row) => row["token_id"] === token.token_id)).not.toHaveProperty(
        "plaintext"
      );
      expect(api.handle("POST", `${path}/${token.token_id}/revoke`).status).toBe(200);
      // Production token lists exclude revoked credentials; reload must not resurrect the row.
      expect(
        (api.handle("GET", path).body as { tokens: Record<string, unknown>[] }).tokens.find(
          (row) => row["token_id"] === token.token_id
        )
      ).toBeUndefined();
      expect(createDevMockApi().handle("GET", path).body).not.toHaveProperty(
        `tokens.${records.length - 1}.label`,
        "Preview token"
      );
    }
  );

  it("simulates invites and member edits independently for each project", () => {
    const api = createDevMockApi();
    const invited = api.handle("POST", "/v1/projects/proj_123/invite", {
      email: "new@example.test",
      role: "admin"
    });
    expect(invited.status).toBe(200);
    const inviteId = (invited.body as { invite: { invite_id: string } }).invite.invite_id;
    expect(api.handle("GET", "/v1/projects/proj_new/invites").body).toMatchObject({ invites: [] });
    expect(api.handle("DELETE", `/v1/projects/proj_new/invites/${inviteId}`).status).toBe(404);
    expect(api.handle("DELETE", `/v1/projects/proj_123/invites/${inviteId}`).status).toBe(200);
    expect(
      api.handle("PATCH", "/v1/projects/proj_123/members/usr_collaborator", { role: "admin" }).body
    ).toHaveProperty("member.role", "admin");
    expect(api.handle("DELETE", "/v1/projects/proj_123/members/usr_123").status).toBe(400);
  });

  it("keeps billing checkout URLs local and capacity changes consistent with the selected plan", () => {
    const api = createDevMockApi();
    const checkout = api.handle("POST", "/v1/billing/checkout", { target_plan: "solo" });
    expect(checkout.status).toBe(200);
    const url = new URL((checkout.body as { url: string }).url, "http://localhost:5291");
    expect(url.origin).toBe("http://localhost:5291");
    const billing = api.handle("POST", "/v1/billing/checkout/confirm", {
      session_id: url.searchParams.get("session_id")
    });
    expect(billing.body).toHaveProperty("billing.plan", "solo");
    expect(
      api.handle("POST", "/v1/billing/capacity/increase", { target_additional_capacity_units: 2 })
        .body
    ).toHaveProperty("billing.capacity_units.additional_purchased", 2);
    expect(
      api.handle("POST", "/v1/billing/capacity/scheduled-reduction", {
        target_additional_capacity_units: 1
      }).body
    ).toHaveProperty("billing.capacity_units.pending_reduction.additional_purchased", 1);
    expect(api.handle("DELETE", "/v1/billing/capacity/scheduled-reduction").body).toHaveProperty(
      "billing.capacity_units.pending_reduction",
      null
    );
    expect(
      api.handle("POST", "/v1/billing/checkout/confirm", { session_id: "real_session" }).status
    ).toBe(404);
    expect(
      api.handle("POST", "/v1/billing/capacity/increase", { target_additional_capacity_units: -1 })
        .status
    ).toBe(400);
    expect(api.handle("POST", "/v1/billing/portal").body).toMatchObject({
      url: "/billing?mock_portal=1"
    });
  });
});
