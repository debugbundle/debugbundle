import { z } from "zod";
import {
  OrganizationInviteBodySchema,
  OrganizationInviteSchema,
  OrganizationMemberUpdateSchema,
  OrganizationPersonSchema,
  OrganizationSummarySchema,
  type OrganizationInvite,
  type OrganizationInviteBody,
  type OrganizationMemberUpdate,
  type OrganizationPerson,
  type OrganizationSummary
} from "../../shared-types/src/index.js";

export interface OrganizationHttpClient {
  request(input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
}
export class OrganizationApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`organization_api_error:${status}:${code}`);
    this.name = "OrganizationApiError";
  }
}
export type OrganizationAuth = { bearerToken: string };
export type OrganizationScope = OrganizationAuth & { organizationId: string };
export interface PendingOwnershipTransfer {
  transfer_id: string;
  recipient_user_id: string;
  expires_at: string;
}
export interface OrganizationApi {
  listOrganizations(input: OrganizationAuth): Promise<OrganizationSummary[]>;
  listPeople(input: OrganizationScope): Promise<OrganizationPerson[]>;
  listInvites(input: OrganizationScope): Promise<OrganizationInvite[]>;
  invite(
    input: OrganizationScope & { invitation: OrganizationInviteBody }
  ): Promise<OrganizationInvite>;
  cancelInvite(input: OrganizationScope & { inviteId: string }): Promise<boolean>;
  resendInvite(input: OrganizationScope & { inviteId: string }): Promise<OrganizationInvite>;
  updatePerson(
    input: OrganizationScope & { userId: string; changes: OrganizationMemberUpdate }
  ): Promise<void>;
  removePerson(input: OrganizationScope & { userId: string }): Promise<void>;
  getOwnershipTransfer(input: OrganizationScope): Promise<PendingOwnershipTransfer | null>;
  requestOwnershipTransfer(
    input: OrganizationScope & { recipientUserId: string }
  ): Promise<{ transfer_id: string }>;
  cancelOwnershipTransfer(input: OrganizationScope): Promise<boolean>;
  acceptInvite(input: OrganizationAuth & { token: string }): Promise<{ organization_id: string }>;
  acceptOwnershipTransfer(
    input: OrganizationAuth & { token: string }
  ): Promise<{ organization_id: string }>;
  switchOrganization(input: OrganizationScope): Promise<{ organization_id: string }>;
}
const orgResponse = z.object({ organization_id: z.uuid() }).strict();
const canceled = z.object({ canceled: z.boolean() }).strict();
const transfer = z
  .object({ transfer_id: z.uuid(), recipient_user_id: z.uuid(), expires_at: z.string() })
  .strict();

function id(value: string): string {
  if (!z.uuid().safeParse(value).success)
    throw new OrganizationApiError(400, "invalid_resource_id");
  return encodeURIComponent(value);
}
function path(input: OrganizationScope): string {
  return `/v1/organizations/${id(input.organizationId)}`;
}

export function createOrganizationApi(client: OrganizationHttpClient): OrganizationApi {
  async function request<T>(
    input: OrganizationAuth,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    resource: string,
    schema: z.ZodType<T>,
    body?: unknown
  ): Promise<T> {
    const response = await client.request({
      method,
      path: resource,
      bearerToken: input.bearerToken,
      ...(body === undefined ? {} : { body })
    });
    if (response.status < 200 || response.status >= 300) {
      const error = z.object({ error: z.string() }).safeParse(response.body);
      throw new OrganizationApiError(
        response.status,
        error.success ? error.data.error : "unknown_error"
      );
    }
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) throw new OrganizationApiError(502, "invalid_response");
    return parsed.data;
  }
  return {
    async listOrganizations(input) {
      return (
        await request(
          input,
          "GET",
          "/v1/organizations",
          z.object({ organizations: z.array(OrganizationSummarySchema) }).strict()
        )
      ).organizations;
    },
    async listPeople(input) {
      return (
        await request(
          input,
          "GET",
          `${path(input)}/people`,
          z.object({ people: z.array(OrganizationPersonSchema) }).strict()
        )
      ).people;
    },
    async listInvites(input) {
      return (
        await request(
          input,
          "GET",
          `${path(input)}/invites`,
          z.object({ invites: z.array(OrganizationInviteSchema) }).strict()
        )
      ).invites;
    },
    async invite(input) {
      const body = OrganizationInviteBodySchema.safeParse(input.invitation);
      if (!body.success) throw new OrganizationApiError(400, "invalid_payload");
      return (
        await request(
          input,
          "POST",
          `${path(input)}/invites`,
          z.object({ invite: OrganizationInviteSchema }).strict(),
          body.data
        )
      ).invite;
    },
    async cancelInvite(input) {
      return (
        await request(input, "DELETE", `${path(input)}/invites/${id(input.inviteId)}`, canceled)
      ).canceled;
    },
    async resendInvite(input) {
      return (
        await request(
          input,
          "POST",
          `${path(input)}/invites/${id(input.inviteId)}/resend`,
          z.object({ invite: OrganizationInviteSchema }).strict()
        )
      ).invite;
    },
    async updatePerson(input) {
      const body = OrganizationMemberUpdateSchema.safeParse(input.changes);
      if (!body.success) throw new OrganizationApiError(400, "invalid_payload");
      await request(
        input,
        "PATCH",
        `${path(input)}/people/${id(input.userId)}`,
        z.object({ updated: z.literal(true) }).strict(),
        body.data
      );
    },
    async removePerson(input) {
      await request(
        input,
        "DELETE",
        `${path(input)}/people/${id(input.userId)}`,
        z.object({ removed: z.literal(true) }).strict()
      );
    },
    async getOwnershipTransfer(input) {
      return (
        await request(
          input,
          "GET",
          `${path(input)}/ownership-transfer`,
          z.object({ transfer: transfer.nullable() }).strict()
        )
      ).transfer;
    },
    async requestOwnershipTransfer(input) {
      return (
        await request(
          input,
          "POST",
          `${path(input)}/ownership-transfer`,
          z.object({ transfer: z.object({ transfer_id: z.uuid() }).strict() }).strict(),
          { recipient_user_id: id(input.recipientUserId) }
        )
      ).transfer;
    },
    async cancelOwnershipTransfer(input) {
      return (await request(input, "DELETE", `${path(input)}/ownership-transfer`, canceled))
        .canceled;
    },
    async acceptInvite(input) {
      return request(input, "POST", "/v1/organizations/invites/accept", orgResponse, {
        token: input.token
      });
    },
    async acceptOwnershipTransfer(input) {
      return request(input, "POST", "/v1/organizations/ownership-transfer/accept", orgResponse, {
        token: input.token
      });
    },
    async switchOrganization(input) {
      return request(input, "POST", "/v1/organizations/switch", orgResponse, {
        organization_id: id(input.organizationId)
      });
    }
  };
}
