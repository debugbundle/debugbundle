import { describe, expect, it, vi } from "vitest";
import {
  createOrganizationApi,
  type OrganizationHttpClient
} from "../../../packages/organization-client/src/index.js";

const org = "11111111-1111-4111-8111-111111111111";
describe("organization API client", () => {
  it("validates named scope before sending changes", async () => {
    const request = vi
      .fn<OrganizationHttpClient["request"]>()
      .mockResolvedValue({ status: 200, body: { updated: true } });
    const api = createOrganizationApi({ request });
    await expect(
      api.removePerson({ bearerToken: "member", organizationId: "../other", userId: org })
    ).rejects.toMatchObject({ code: "invalid_resource_id" });
    expect(request).not.toHaveBeenCalled();
    await api.updatePerson({
      bearerToken: "member",
      organizationId: org,
      userId: org,
      changes: { default_project_role: "viewer", project_access: "all" }
    });
    expect(request).toHaveBeenCalledWith({
      method: "PATCH",
      path: `/v1/organizations/${org}/people/${org}`,
      bearerToken: "member",
      body: { default_project_role: "viewer", project_access: "all" }
    });
  });
  it("keeps verified-human refusal and rejects malformed privileged responses", async () => {
    const request = vi
      .fn<OrganizationHttpClient["request"]>()
      .mockResolvedValueOnce({ status: 403, body: { error: "interactive_verification_required" } })
      .mockResolvedValueOnce({ status: 200, body: { people: [{ role: "root" }] } });
    const api = createOrganizationApi({ request });
    await expect(
      api.requestOwnershipTransfer({
        bearerToken: "member",
        organizationId: org,
        recipientUserId: org
      })
    ).rejects.toMatchObject({ code: "interactive_verification_required" });
    await expect(
      api.listPeople({ bearerToken: "member", organizationId: org })
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
