import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import { organizationWithAuthCommand } from "../../../apps/cli/src/organization-commands.js";
const org = "11111111-1111-4111-8111-111111111111";
describe("organization CLI", () => {
  it("dispatches personal, invitation and member actions through the validated authenticated client", async () => {
    const invitation = {
      invite_id: org,
      organization_id: org,
      email: "person@example.test",
      role: "member",
      project_access: "selected",
      default_project_role: "viewer",
      project_ids: [org],
      created_at: "2026-11-07T00:00:00Z",
      expires_at: "2026-11-14T00:00:00Z"
    };
    const cases = [
      { argv: ["list"], method: "GET", path: "/v1/organizations", body: { organizations: [] } },
      {
        argv: ["people", org],
        method: "GET",
        path: `/v1/organizations/${org}/people`,
        body: { people: [] }
      },
      {
        argv: ["invites", org],
        method: "GET",
        path: `/v1/organizations/${org}/invites`,
        body: { invites: [] }
      },
      {
        argv: [
          "invite",
          org,
          "--email",
          "person@example.test",
          "--project-role",
          "viewer",
          "--projects",
          org
        ],
        method: "POST",
        path: `/v1/organizations/${org}/invites`,
        body: { invite: invitation }
      },
      {
        argv: ["cancel-invite", org, org],
        method: "DELETE",
        path: `/v1/organizations/${org}/invites/${org}`,
        body: { canceled: true }
      },
      {
        argv: ["resend-invite", org, org],
        method: "POST",
        path: `/v1/organizations/${org}/invites/${org}/resend`,
        body: { invite: invitation }
      },
      {
        argv: ["update-person", org, org, "--changes-json", '{"suspended":true}'],
        method: "PATCH",
        path: `/v1/organizations/${org}/people/${org}`,
        body: { updated: true }
      },
      {
        argv: ["remove-person", org, org],
        method: "DELETE",
        path: `/v1/organizations/${org}/people/${org}`,
        body: { removed: true }
      },
      {
        argv: ["transfer-status", org],
        method: "GET",
        path: `/v1/organizations/${org}/ownership-transfer`,
        body: { transfer: null }
      }
    ];
    for (const item of cases) {
      const request = vi.fn().mockResolvedValue({ status: 200, body: item.body });
      const result = await runCli(["organization", ...item.argv, "--json"], {
        organizationCommand: (input) =>
          organizationWithAuthCommand(input, {
            readAuthState: async () => ({
              bearer_token: "scoped-member",
              base_url: "https://app.example.test"
            }),
            createHttpClient: () => ({ request })
          })
      });
      expect(result.exitCode, item.argv.join(" ")).toBe(0);
      expect(JSON.parse(result.output)).toEqual(item.body);
      expect(request).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: item.method,
          path: item.path,
          bearerToken: "scoped-member"
        })
      );
      if (item.method === "PATCH")
        expect(request.mock.calls[0]?.[0].body).toEqual({ suspended: true });
    }
  });
  it("routes explicit selected/read-only invitation grants", async () => {
    const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
    const result = await runCli(
      [
        "organization",
        "invite",
        org,
        "--email",
        "person@example.test",
        "--project-role",
        "viewer",
        "--projects",
        org,
        "--json"
      ],
      { organizationCommand: command }
    );
    expect(result.exitCode).toBe(0);
    expect(command).toHaveBeenCalledWith({
      action: "invite",
      organizationId: org,
      json: true,
      invitation: {
        email: "person@example.test",
        role: "member",
        project_access: "selected",
        default_project_role: "viewer",
        project_ids: [org]
      }
    });
  });
  it("rejects arbitrary owner-role changes before calling the API", async () => {
    const command = vi.fn();
    const result = await runCli(
      ["organization", "update-person", org, org, "--changes-json", '{"role":"owner"}'],
      { organizationCommand: command }
    );
    expect(result.exitCode).not.toBe(0);
    expect(command).not.toHaveBeenCalled();
  });
  it("preserves browser verification for transfer and token context switching", async () => {
    const createHttpClient = vi.fn();
    const readAuthState = vi
      .fn()
      .mockResolvedValue({ bearer_token: "member", base_url: "https://app.debugbundle.com" });
    const result = await organizationWithAuthCommand(
      { action: "switch", organizationId: org },
      { readAuthState, createHttpClient }
    );
    expect(result.exitCode).toBe(4);
    expect(result.output).toContain("interactive_verification_required");
    expect(createHttpClient).not.toHaveBeenCalled();
  });
});
