import { apiError } from "./openapi-components.js";
import { z } from "zod";
import {
  OrganizationInviteBodySchema,
  OrganizationInviteSchema,
  OrganizationMemberUpdateSchema,
  OrganizationPersonSchema,
  OrganizationSummarySchema
} from "../../../packages/shared-types/src/index.js";
import {
  anyMemberAuth,
  browserSessionAuth,
  ApiErrorSchema,
  component,
  type OperationSpec
} from "./openapi-model.js";

const params = z.object({ id: z.uuid() });
const tokenBody = z.object({ token: z.string().min(20).max(200) }).strict();
const canceled = component("OrganizationCanceled", z.object({ canceled: z.boolean() }).strict());
const orgResponse = component(
  "OrganizationContext",
  z.object({ organization_id: z.uuid() }).strict()
);
const transferRecord = z
  .object({ transfer_id: z.uuid(), recipient_user_id: z.uuid(), expires_at: z.string() })
  .strict();
const failures = {
  "400": { description: "Invalid input or invitation.", schema: apiError },
  "401": { description: "Authentication is required.", schema: apiError },
  "403": {
    description:
      "Live role, plan, credential scope or verified interactive identity is insufficient.",
    schema: apiError
  },
  "404": { description: "The scoped resource is unavailable.", schema: apiError },
  "409": {
    description: "People limit, pending invitation or ownership state conflicts.",
    schema: apiError
  },
  "429": { description: "Management rate limit exceeded.", schema: apiError },
  "500": { description: "The organisation operation failed safely.", schema: apiError }
};
const metadata = { tags: ["Organizations"], security: anyMemberAuth };
const mailFailure = component(
  "OrganizationMailFailure",
  z.union([
    ApiErrorSchema,
    z.object({ error: z.string(), invite: OrganizationInviteSchema }).strict(),
    z.object({ error: z.string(), transfer: z.object({ transfer_id: z.uuid() }).strict() }).strict()
  ])
);

export function organizationOperations(): OperationSpec[] {
  return [
    {
      ...metadata,
      method: "get",
      path: "/v1/organizations",
      operationId: "listOrganizations",
      summary: "List live organisation memberships",
      responses: {
        ...failures,
        "200": {
          description:
            "Live memberships, limited to the declared credential organisation when scoped.",
          schema: component(
            "OrganizationList",
            z.object({ organizations: z.array(OrganizationSummarySchema) }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/organizations/switch",
      operationId: "switchOrganization",
      summary: "Select an existing browser session's organisation",
      security: browserSessionAuth,
      requestBody: component(
        "SwitchOrganizationBody",
        z.object({ organization_id: z.uuid() }).strict()
      ),
      responses: {
        ...failures,
        "200": {
          description: "Browser context switched; bearer tokens are unchanged.",
          schema: orgResponse
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: "/v1/organizations/{id}/people",
      operationId: "listOrganizationPeople",
      summary: "List Business people and retained grants",
      params,
      responses: {
        ...failures,
        "200": {
          description: "Deduplicated retained identities and grant state.",
          schema: component(
            "OrganizationPeople",
            z.object({ people: z.array(OrganizationPersonSchema) }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "patch",
      path: "/v1/organizations/{id}/people/{userId}",
      operationId: "updateOrganizationMember",
      summary: "Change Business member grants or suspension",
      params: params.extend({ userId: z.uuid() }),
      requestBody: component("OrganizationMemberUpdate", OrganizationMemberUpdateSchema),
      responses: {
        ...failures,
        "200": {
          description: "Member updated; Owner and peer Admin restrictions remain enforced.",
          schema: component(
            "OrganizationMemberUpdated",
            z.object({ updated: z.literal(true) }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "delete",
      path: "/v1/organizations/{id}/people/{userId}",
      operationId: "removeOrganizationMember",
      summary: "Remove org/direct grants and org-issued credentials",
      params: params.extend({ userId: z.uuid() }),
      responses: {
        ...failures,
        "200": {
          description: "Access removed without deleting the identity or unrelated organisations.",
          schema: component(
            "OrganizationMemberRemoved",
            z.object({ removed: z.literal(true) }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: "/v1/organizations/{id}/invites",
      operationId: "listOrganizationInvites",
      summary: "List pending Business invitations",
      params,
      responses: {
        ...failures,
        "200": {
          description: "Pending non-secret invitation metadata.",
          schema: component(
            "OrganizationInvites",
            z.object({ invites: z.array(OrganizationInviteSchema) }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/organizations/{id}/invites",
      operationId: "inviteOrganizationMember",
      summary: "Reserve a distinct-person place and email an invitation",
      params,
      requestBody: component("OrganizationInviteBody", OrganizationInviteBodySchema),
      responses: {
        ...failures,
        "201": {
          description:
            "Invitation created and accepted by the configured mail transport; acceptance requires a verified recipient.",
          schema: component(
            "OrganizationInviteCreated",
            z.object({ invite: OrganizationInviteSchema }).strict()
          )
        },
        "503": {
          description:
            "Mail unavailable or delivery uncertain; returned pending metadata never contains the acceptance token.",
          schema: mailFailure
        }
      }
    },
    {
      ...metadata,
      method: "delete",
      path: "/v1/organizations/{id}/invites/{inviteId}",
      operationId: "cancelOrganizationInvite",
      summary: "Cancel a pending organisation invitation",
      params: params.extend({ inviteId: z.uuid() }),
      responses: { ...failures, "200": { description: "Invitation canceled.", schema: canceled } }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/organizations/{id}/invites/{inviteId}/resend",
      operationId: "resendOrganizationInvite",
      summary: "Send a fresh invitation link with the saved grant",
      params: params.extend({ inviteId: z.uuid() }),
      responses: {
        ...failures,
        "200": {
          description: "Invitation refreshed; previous links are invalidated.",
          schema: component(
            "OrganizationInviteRefreshed",
            z.object({ invite: OrganizationInviteSchema }).strict()
          )
        },
        "503": {
          description:
            "Mail unavailable or uncertain; pending metadata contains no acceptance plaintext.",
          schema: mailFailure
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/organizations/invites/accept",
      operationId: "acceptOrganizationInvite",
      summary: "Accept as the verified matching recipient",
      security: browserSessionAuth,
      requestBody: component("OrganizationInvitationAcceptance", tokenBody),
      responses: {
        ...failures,
        "200": {
          description: "Membership accepted; existing stronger grants are preserved.",
          schema: orgResponse
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: "/v1/organizations/{id}/ownership-transfer",
      operationId: "getOrganizationOwnershipTransfer",
      summary: "View pending ownership transfer as Owner",
      params,
      responses: {
        ...failures,
        "200": {
          description: "Non-secret pending transfer or null.",
          schema: component(
            "OrganizationTransferStatus",
            z.object({ transfer: transferRecord.nullable() }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/organizations/{id}/ownership-transfer",
      operationId: "requestOrganizationOwnershipTransfer",
      summary: "Request recipient acceptance as verified Owner",
      params,
      security: browserSessionAuth,
      requestBody: component(
        "OrganizationOwnershipTransferBody",
        z.object({ recipient_user_id: z.uuid() }).strict()
      ),
      responses: {
        ...failures,
        "201": {
          description: "Transfer request sent; ownership remains unchanged until acceptance.",
          schema: component(
            "OrganizationTransferRequested",
            z.object({ transfer: z.object({ transfer_id: z.uuid() }).strict() }).strict()
          )
        },
        "503": {
          description: "Mail unavailable or uncertain; no ownership change occurred.",
          schema: mailFailure
        }
      }
    },
    {
      ...metadata,
      method: "delete",
      path: "/v1/organizations/{id}/ownership-transfer",
      operationId: "cancelOrganizationOwnershipTransfer",
      summary: "Cancel a pending transfer as verified Owner",
      params,
      security: browserSessionAuth,
      responses: {
        ...failures,
        "200": { description: "Pending transfer cancellation status.", schema: canceled }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/organizations/ownership-transfer/accept",
      operationId: "acceptOrganizationOwnershipTransfer",
      summary: "Accept ownership as the verified recipient",
      security: browserSessionAuth,
      requestBody: component("OrganizationOwnershipAcceptance", tokenBody),
      responses: {
        ...failures,
        "200": {
          description:
            "Primary and physical project ownership changed atomically; personal credentials retain their owners.",
          schema: orgResponse
        }
      }
    }
  ];
}
