import {
  createOrganizationApi,
  type OrganizationScope
} from "../../../../packages/organization-client/src/index.js";
import type {
  OrganizationInviteBody,
  OrganizationMemberUpdate
} from "../../../../packages/shared-types/src/index.js";
import { buildApiUrl, buildBrowserSessionHeaders, readJson } from "./api-client.js";

// Reuse the automation client's validated DTOs; browser authority is always the
// HttpOnly session and CSRF token, never a bearer credential supplied by React.
const api = createOrganizationApi({
  async request({ method, path, body }) {
    const response = await fetch(buildApiUrl(path), {
      method,
      credentials: "include",
      headers: buildBrowserSessionHeaders(body !== undefined),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await readJson<unknown>(response) };
  }
});
const auth = { bearerToken: "" };
const scope = (organizationId: string): OrganizationScope => ({ ...auth, organizationId });
export const organizationApi = {
  list: () => api.listOrganizations(auth),
  people: (organizationId: string) => api.listPeople(scope(organizationId)),
  invites: (organizationId: string) => api.listInvites(scope(organizationId)),
  invite: (organizationId: string, invitation: OrganizationInviteBody) =>
    api.invite({ ...scope(organizationId), invitation }),
  resend: (organizationId: string, inviteId: string) =>
    api.resendInvite({ ...scope(organizationId), inviteId }),
  cancelInvite: (organizationId: string, inviteId: string) =>
    api.cancelInvite({ ...scope(organizationId), inviteId }),
  update: (organizationId: string, userId: string, changes: OrganizationMemberUpdate) =>
    api.updatePerson({ ...scope(organizationId), userId, changes }),
  remove: (organizationId: string, userId: string) =>
    api.removePerson({ ...scope(organizationId), userId }),
  transfer: (organizationId: string) => api.getOwnershipTransfer(scope(organizationId)),
  requestTransfer: (organizationId: string, recipientUserId: string) =>
    api.requestOwnershipTransfer({ ...scope(organizationId), recipientUserId }),
  cancelTransfer: (organizationId: string) => api.cancelOwnershipTransfer(scope(organizationId)),
  accept: (kind: "invite" | "ownership_transfer", token: string) =>
    kind === "invite"
      ? api.acceptInvite({ ...auth, token })
      : api.acceptOwnershipTransfer({ ...auth, token }),
  switch: (organizationId: string) => api.switchOrganization(scope(organizationId))
};
