import { describe, expect, it, vi } from "vitest";

import { listAlertGroupsCommand, getAlertGroupCommand } from "../../../apps/cli/src/alert-commands.js";
import { parseArgv } from "../../../apps/cli/src/argv-helpers.js";
import { handleAlertCommand } from "../../../apps/cli/src/management-command-handlers.js";

describe("cli alert group inspection", () => {
  it("renders a bounded group list and preserves its next cursor", async () => {
    const listAlertGroups = vi.fn().mockResolvedValue({
      groups: [{ group_id: "group-id", kind: "direct", channel: "slack", status: "delivered",
        member_count: 100, root_incident_id: "root-id", created_at: "2026-09-24T10:00:00Z" }],
      next_cursor: "next-page"
    });
    const result = await listAlertGroupsCommand({
      bearerToken: "dbundle_mem_test", projectId: "project-id", limit: 1
    }, { listAlertGroups });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("incidents=100");
    expect(result.output).toContain("Next cursor: next-page");
    expect(listAlertGroups).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_test", projectId: "project-id", limit: 1
    });
  });

  it("renders each member identity and passes a cursor for the next page", async () => {
    const getAlertGroup = vi.fn().mockResolvedValue({
      group: { group_id: "group-id", kind: "email_digest", channel: "email", status: "pending", member_count: 2 },
      members: [{ incident_id: "incident-id", condition_type: "new_incident", created_at: "2026-09-24T10:00:00Z" }],
      next_cursor: "second-page"
    });
    const result = await getAlertGroupCommand({
      bearerToken: "dbundle_mem_test", projectId: "project-id",
      kind: "email_digest", groupId: "group-id", json: true
    }, { getAlertGroup });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output).members[0].incident_id).toBe("incident-id");
    expect(JSON.parse(result.output).next_cursor).toBe("second-page");
  });

  it("dispatches group list/detail commands with project scope and rejects an invalid kind", async () => {
    const listAlertGroupsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "listed" });
    const getAlertGroupCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "detail" });
    const list = await handleAlertCommand(parseArgv([
      "alert", "groups", "--project-id", "project-id", "--limit", "5", "--cursor", "page-2", "--json"
    ]), { listAlertGroupsCommand });
    expect(list.output).toBe("listed");
    expect(listAlertGroupsCommand).toHaveBeenCalledWith({
      projectId: "project-id", limit: 5, cursor: "page-2", json: true
    });
    const detail = await handleAlertCommand(parseArgv([
      "alert", "group", "direct", "group-id", "--project-id", "project-id"
    ]), { getAlertGroupCommand });
    expect(detail.output).toBe("detail");
    expect(getAlertGroupCommand).toHaveBeenCalledWith({
      projectId: "project-id", kind: "direct", groupId: "group-id"
    });
    await expect(handleAlertCommand(parseArgv([
      "alert", "group", "unknown", "group-id", "--project-id", "project-id"
    ]), {})).rejects.toThrow("Alert group kind must be direct or email_digest.");
  });
});
