import { z } from "zod";
import {
  OrganizationInviteBodySchema,
  OrganizationMemberUpdateSchema
} from "../../../packages/shared-types/src/index.js";
import {
  OrganizationApiError,
  type OrganizationApi
} from "../../../packages/organization-client/src/index.js";

const auth = z.object({ bearerToken: z.string().min(1) }).strict();
const scope = auth.extend({ organizationId: z.uuid() });
const person = scope.extend({ userId: z.uuid() });
const invite = scope.extend({ invitation: OrganizationInviteBodySchema });
const cancelInvite = scope.extend({ inviteId: z.uuid() });
const updatePerson = person.extend({ changes: OrganizationMemberUpdateSchema });
const transfer = scope.extend({ recipientUserId: z.uuid() });
const acceptance = auth.extend({ token: z.string().min(20).max(200) });
export const ORGANIZATION_MCP_TOOL_NAMES = [
  "list_organizations",
  "list_organization_people",
  "list_organization_invites",
  "invite_organization_member",
  "cancel_organization_invite",
  "update_organization_member",
  "remove_organization_member",
  "get_organization_ownership_transfer",
  "request_organization_ownership_transfer",
  "cancel_organization_ownership_transfer",
  "accept_organization_invite",
  "accept_organization_ownership_transfer",
  "switch_organization",
  "resend_organization_invite"
] as const;
export const ORGANIZATION_MCP_TOOL_CATALOG = [
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[0],
    inputSchema: auth,
    description:
      "List your active organisation memberships. A scoped token sees only its named organisation.",
    read: true
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[1],
    inputSchema: scope,
    description:
      "List retained Business people, direct project counts, org grants and suspension. Owner or explicitly scoped Org Admin only.",
    read: true
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[2],
    inputSchema: scope,
    description:
      "List pending Business organisation invitations. Owner or explicitly scoped Org Admin only.",
    read: true
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[3],
    inputSchema: invite,
    description:
      "Invite a verified person to selected projects or explicit current/future project access. Reserves one deduplicated account place and sends an invitation email. Admin cannot appoint peers.",
    read: false
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[4],
    inputSchema: cancelInvite,
    description:
      "Cancel a pending organisation invitation and release its reservation when unused elsewhere.",
    read: false
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[5],
    inputSchema: updatePerson,
    description:
      "Change Business member grants or suspension. Owner only for Admin targets/promotions; never changes the Owner. Suspension revokes org-issued credentials.",
    read: false
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[6],
    inputSchema: person,
    description:
      "Remove a person from this organisation and its projects; revoke their org credentials and pending invitations. Keeps their identity and unrelated organisations.",
    read: false
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[7],
    inputSchema: scope,
    description:
      "Read a pending ownership transfer. Owner only; acceptance tokens are never returned.",
    read: true
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[8],
    inputSchema: transfer,
    description:
      "Request ownership transfer and email recipient acceptance. Requires a verified human browser session; bearer automation returns interactive_verification_required.",
    read: false
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[9],
    inputSchema: scope,
    description:
      "Cancel a pending transfer. Requires the verified Owner's browser session; bearer automation cannot perform this action.",
    read: false
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[10],
    inputSchema: acceptance,
    description:
      "Accept an organisation invitation as its verified recipient. Requires a verified browser session; bearer automation cannot bypass identity verification.",
    read: false
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[11],
    inputSchema: acceptance,
    description:
      "Accept ownership as the verified recipient. Changes primary/project ownership atomically and retains billing identity. Requires a verified browser session.",
    read: false
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[12],
    inputSchema: scope,
    description:
      "Select an active organisation for an existing browser session. Bearer token context is immutable; this action requires the browser session.",
    read: false
  },
  {
    name: ORGANIZATION_MCP_TOOL_NAMES[13],
    inputSchema: cancelInvite,
    description:
      "Resend a pending invitation with its saved grant. Invalidates earlier links and sends a new email; current delegation and the account people cap are rechecked.",
    read: false
  }
].map(({ read, ...entry }) => ({
  ...entry,
  group: "organizations" as const,
  annotations: {
    readOnlyHint: read,
    destructiveHint:
      !read &&
      [
        ORGANIZATION_MCP_TOOL_NAMES[5],
        ORGANIZATION_MCP_TOOL_NAMES[6],
        ORGANIZATION_MCP_TOOL_NAMES[11]
      ].some((name) => name === entry.name),
    idempotentHint:
      read ||
      [ORGANIZATION_MCP_TOOL_NAMES[4], ORGANIZATION_MCP_TOOL_NAMES[9]].some(
        (name) => name === entry.name
      ),
    openWorldHint:
      entry.name === "invite_organization_member" ||
      entry.name === "request_organization_ownership_transfer" ||
      entry.name === "resend_organization_invite"
  }
}));

function forward<S extends z.ZodType>(
  schema: S,
  run: (input: z.output<S>) => Promise<unknown>
): (input: Record<string, unknown>) => Promise<unknown> {
  return async (input) => {
    try {
      return await run(schema.parse(input));
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof OrganizationApiError ? error.code : "invalid_organization_input"}`
      );
    }
  };
}
export function createOrganizationMcpTools(
  api: OrganizationApi
): Record<
  (typeof ORGANIZATION_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  return {
    list_organizations: forward(auth, async (input) => ({
      organizations: await api.listOrganizations(input)
    })),
    list_organization_people: forward(scope, async (input) => ({
      people: await api.listPeople(input)
    })),
    list_organization_invites: forward(scope, async (input) => ({
      invites: await api.listInvites(input)
    })),
    invite_organization_member: forward(invite, async (input) => ({
      invite: await api.invite(input)
    })),
    cancel_organization_invite: forward(cancelInvite, async (input) => ({
      canceled: await api.cancelInvite(input)
    })),
    update_organization_member: forward(updatePerson, async (input) => {
      await api.updatePerson(input);
      return { updated: true };
    }),
    remove_organization_member: forward(person, async (input) => {
      await api.removePerson(input);
      return { removed: true };
    }),
    get_organization_ownership_transfer: forward(scope, async (input) => ({
      transfer: await api.getOwnershipTransfer(input)
    })),
    request_organization_ownership_transfer: forward(transfer, async (input) => ({
      transfer: await api.requestOwnershipTransfer(input)
    })),
    cancel_organization_ownership_transfer: forward(scope, async (input) => ({
      canceled: await api.cancelOwnershipTransfer(input)
    })),
    accept_organization_invite: forward(acceptance, async (input) => api.acceptInvite(input)),
    accept_organization_ownership_transfer: forward(acceptance, async (input) =>
      api.acceptOwnershipTransfer(input)
    ),
    switch_organization: forward(scope, async (input) => api.switchOrganization(input)),
    resend_organization_invite: forward(cancelInvite, async (input) => ({
      invite: await api.resendInvite(input)
    }))
  };
}
