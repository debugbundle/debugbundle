import { describe, expect, it, vi } from "vitest";

import { createDefaultMcpTools } from "../../../apps/mcp/src/default-tools.js";

const projectRecord = {
  project_id: "proj_1",
  organization_id: "org_1",
  owner_user_id: "user_1",
  owner_email: "owner@example.com",
  relationship: "owned",
  sharing_state: "private",
  effective_role: "owner",
  name: "Main App",
  slug: "main-app",
  environment_default: "production",
  organization_plan: "solo",
  metrics: {
    open_incidents: 0,
    regressed_incidents: 0,
    opened_incidents_today: 0,
    opened_incidents_month: 0,
    monthly_bundle_requests: 0,
    monthly_raw_ingested_events: 0,
    retained_bundles: 0,
    monthly_alert_deliveries: 0
  },
  created_at: "2026-05-31T00:00:00.000Z",
  updated_at: "2026-05-31T00:00:00.000Z"
};

describe("mcp default tools", () => {
  it("uses DEBUGBUNDLE_MEMBER_TOKEN as the default bearer token for marketplace installs", async () => {
    const previousMemberToken = process.env["DEBUGBUNDLE_MEMBER_TOKEN"];
    const previousApiUrl = process.env["DEBUGBUNDLE_API_URL"];
    process.env["DEBUGBUNDLE_MEMBER_TOKEN"] = " dbundle_mem_env ";
    process.env["DEBUGBUNDLE_API_URL"] = "https://env-api.example.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ projects: [projectRecord] }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    try {
      const tools = await createDefaultMcpTools();
      const listProjects = tools["list_projects"];
      expect(listProjects).toBeDefined();

      await expect(listProjects!({ limit: 5 })).resolves.toEqual({
        projects: [projectRecord]
      });

      expect(fetchMock).toHaveBeenCalledWith("https://env-api.example.test/v1/projects?limit=5", {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: "Bearer dbundle_mem_env"
        }
      });
    } finally {
      if (previousMemberToken === undefined) {
        delete process.env["DEBUGBUNDLE_MEMBER_TOKEN"];
      } else {
        process.env["DEBUGBUNDLE_MEMBER_TOKEN"] = previousMemberToken;
      }
      if (previousApiUrl === undefined) {
        delete process.env["DEBUGBUNDLE_API_URL"];
      } else {
        process.env["DEBUGBUNDLE_API_URL"] = previousApiUrl;
      }
      fetchMock.mockRestore();
    }
  });
});
