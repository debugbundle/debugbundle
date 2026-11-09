import { describe, expect, it, vi } from "vitest";
import {
  createOrganizationMcpTools,
  ORGANIZATION_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/organization-tools.js";
import {
  OrganizationApiError,
  type OrganizationApi
} from "../../../packages/organization-client/src/index.js";
import { mockedObject } from "../../helpers/vitest.js";
const org = "11111111-1111-4111-8111-111111111111";
describe("organization MCP tools", () => {
  it("validates explicit org grants and forwards the same domain request", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const tools = createOrganizationMcpTools(
      mockedObject<OrganizationApi>({ updatePerson: update })
    );
    await tools.update_organization_member({
      bearerToken: "member",
      organizationId: org,
      userId: org,
      changes: { project_access: "all", default_project_role: "viewer" }
    });
    expect(update).toHaveBeenCalledWith({
      bearerToken: "member",
      organizationId: org,
      userId: org,
      changes: { project_access: "all", default_project_role: "viewer" }
    });
    await expect(
      tools.update_organization_member({
        bearerToken: "member",
        organizationId: org,
        userId: org,
        changes: { role: "owner" }
      })
    ).rejects.toThrow("invalid_organization_input");
    expect(update).toHaveBeenCalledTimes(1);
    expect(
      ORGANIZATION_MCP_TOOL_CATALOG.find((tool) => tool.name === "remove_organization_member")
        ?.annotations.destructiveHint
    ).toBe(true);
  });
  it("does not bypass verified-human ownership acceptance", async () => {
    const accept = vi
      .fn()
      .mockRejectedValue(new OrganizationApiError(403, "interactive_verification_required"));
    const tools = createOrganizationMcpTools(
      mockedObject<OrganizationApi>({ acceptOwnershipTransfer: accept })
    );
    await expect(
      tools.accept_organization_ownership_transfer({
        bearerToken: "member",
        token: "dbundle_org_transfer_example_secret"
      })
    ).rejects.toThrow("interactive_verification_required");
  });
});
