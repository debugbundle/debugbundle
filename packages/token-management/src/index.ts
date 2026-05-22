import { z } from "zod";

export const ProjectTokenSchema = z
  .object({
    token_id: z.string(),
    project_id: z.string(),
    label: z.string(),
    allowed_origins: z.array(z.string()).default([]),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
    expires_at: z.string().nullable(),
    plaintext: z.string().optional()
  })
  .strict();

export const MemberTokenSchema = z
  .object({
    token_id: z.string(),
    user_id: z.string(),
    organization_id: z.string(),
    label: z.string(),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
    expires_at: z.string().nullable(),
    plaintext: z.string().optional()
  })
  .strict();

export const TokenListResponseSchema = z
  .object({
    tokens: z.array(z.union([ProjectTokenSchema, MemberTokenSchema]))
  })
  .strict();

export const TokenCreateResponseSchema = z
  .object({
    token: z.union([ProjectTokenSchema, MemberTokenSchema])
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

export interface HttpRequestInput {
  method: "GET" | "POST";
  path: string;
  bearerToken: string;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface HttpClient {
  request(input: HttpRequestInput): Promise<HttpResponse>;
}

export class TokenManagementApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`token_management_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function parseApiError(status: number, body: unknown): never {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new TokenManagementApiError(status, "unknown_error");
  }

  throw new TokenManagementApiError(status, parsed.data.error);
}

async function expectTokenList(responsePromise: Promise<HttpResponse>): Promise<Array<z.infer<typeof ProjectTokenSchema> | z.infer<typeof MemberTokenSchema>>> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = TokenListResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new TokenManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.tokens;
}

async function expectToken(responsePromise: Promise<HttpResponse>): Promise<z.infer<typeof ProjectTokenSchema> | z.infer<typeof MemberTokenSchema>> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = TokenCreateResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new TokenManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.token;
}

export function createTokenManagementApi(client: HttpClient): {
  listProjectTokens(input: { bearerToken: string; projectId: string; limit?: number }): Promise<Array<z.infer<typeof ProjectTokenSchema>>>;
  createProjectToken(input: { bearerToken: string; projectId: string; label: string; allowedOrigins?: string[] }): Promise<z.infer<typeof ProjectTokenSchema>>;
  revokeProjectToken(input: { bearerToken: string; projectId: string; tokenId: string }): Promise<z.infer<typeof ProjectTokenSchema>>;
  listMemberTokens(input: { bearerToken: string; limit?: number }): Promise<Array<z.infer<typeof MemberTokenSchema>>>;
  createMemberToken(input: { bearerToken: string; label: string }): Promise<z.infer<typeof MemberTokenSchema>>;
  revokeMemberToken(input: { bearerToken: string; tokenId: string }): Promise<z.infer<typeof MemberTokenSchema>>;
} {
  return {
    async listProjectTokens(input) {
      const query = input.limit === undefined ? "" : `?limit=${input.limit}`;
      const tokens = await expectTokenList(
        client.request({
          method: "GET",
          path: `/v1/projects/${input.projectId}/tokens${query}`,
          bearerToken: input.bearerToken
        })
      );

      return tokens as Array<z.infer<typeof ProjectTokenSchema>>;
    },

    async createProjectToken(input) {
      const token = await expectToken(
        client.request({
          method: "POST",
          path: `/v1/projects/${input.projectId}/tokens`,
          bearerToken: input.bearerToken,
          body: {
            label: input.label,
            ...(input.allowedOrigins === undefined ? {} : { allowed_origins: input.allowedOrigins })
          }
        })
      );

      return token as z.infer<typeof ProjectTokenSchema>;
    },

    async revokeProjectToken(input) {
      const token = await expectToken(
        client.request({
          method: "POST",
          path: `/v1/projects/${input.projectId}/tokens/${input.tokenId}/revoke`,
          bearerToken: input.bearerToken
        })
      );

      return token as z.infer<typeof ProjectTokenSchema>;
    },

    async listMemberTokens(input) {
      const query = input.limit === undefined ? "" : `?limit=${input.limit}`;
      const tokens = await expectTokenList(
        client.request({
          method: "GET",
          path: `/v1/member/tokens${query}`,
          bearerToken: input.bearerToken
        })
      );

      return tokens as Array<z.infer<typeof MemberTokenSchema>>;
    },

    async createMemberToken(input) {
      const token = await expectToken(
        client.request({
          method: "POST",
          path: "/v1/member/tokens",
          bearerToken: input.bearerToken,
          body: {
            label: input.label
          }
        })
      );

      return token as z.infer<typeof MemberTokenSchema>;
    },

    async revokeMemberToken(input) {
      const token = await expectToken(
        client.request({
          method: "POST",
          path: `/v1/member/tokens/${input.tokenId}/revoke`,
          bearerToken: input.bearerToken
        })
      );

      return token as z.infer<typeof MemberTokenSchema>;
    }
  };
}
