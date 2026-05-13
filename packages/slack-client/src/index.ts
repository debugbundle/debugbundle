import { z } from "zod";

export const SlackDestinationRecordSchema = z
  .object({
    slack_destination_id: z.string(),
    organization_id: z.string(),
    slack_team_id: z.string(),
    slack_team_name: z.string().nullable(),
    slack_channel_id: z.string(),
    slack_channel_name: z.string().nullable(),
    installed_by_member_id: z.string().nullable(),
    is_active: z.boolean(),
    created_at: z.string(),
    updated_at: z.string()
  })
  .strict();

export const SlackDestinationListResponseSchema = z
  .object({
    destinations: z.array(SlackDestinationRecordSchema)
  })
  .strict();

export const SlackInstallUrlResponseSchema = z
  .object({
    install_url: z.string().url()
  })
  .strict();

export const SlackDestinationTestResponseSchema = z
  .object({
    delivered: z.boolean()
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

export type SlackDestinationRecord = z.infer<typeof SlackDestinationRecordSchema>;

export interface HttpRequestInput {
  method: "GET" | "POST" | "DELETE";
  path: string;
  bearerToken: string;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface HttpClient {
  request(input: HttpRequestInput): Promise<HttpResponse>;
}

export class SlackApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`slack_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function parseApiError(status: number, body: unknown): never {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new SlackApiError(status, "unknown_error");
  }

  throw new SlackApiError(status, parsed.data.error);
}

function buildQuery(input: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query.length === 0 ? "" : `?${query}`;
}

export function createSlackApi(client: HttpClient): {
  getSlackInstallUrl(input: { bearerToken: string; projectId: string; returnTo?: string }): Promise<string>;
  listSlackDestinations(input: { bearerToken: string; projectId: string }): Promise<SlackDestinationRecord[]>;
  testSlackDestination(input: { bearerToken: string; projectId: string; destinationId: string }): Promise<{ delivered: true }>;
  deleteSlackDestination(input: { bearerToken: string; projectId: string; destinationId: string }): Promise<{ slack_destination_id: string }>;
} {
  return {
    async getSlackInstallUrl(input) {
      const response = await client.request({
        method: "GET",
        path: `/v1/slack/app/install-url${buildQuery({
          project_id: input.projectId,
          return_to: input.returnTo
        })}`,
        bearerToken: input.bearerToken
      });

      if (response.status < 200 || response.status >= 300) {
        parseApiError(response.status, response.body);
      }

      const parsed = SlackInstallUrlResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new SlackApiError(response.status, "invalid_response_shape");
      }

      return parsed.data.install_url;
    },

    async listSlackDestinations(input) {
      const response = await client.request({
        method: "GET",
        path: `/v1/projects/${input.projectId}/slack/destinations`,
        bearerToken: input.bearerToken
      });

      if (response.status < 200 || response.status >= 300) {
        parseApiError(response.status, response.body);
      }

      const parsed = SlackDestinationListResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new SlackApiError(response.status, "invalid_response_shape");
      }

      return parsed.data.destinations;
    },

    async testSlackDestination(input) {
      const response = await client.request({
        method: "POST",
        path: `/v1/projects/${input.projectId}/slack/destinations/${input.destinationId}/test`,
        bearerToken: input.bearerToken
      });

      if (response.status < 200 || response.status >= 300) {
        parseApiError(response.status, response.body);
      }

      const parsed = SlackDestinationTestResponseSchema.safeParse(response.body);
      if (!parsed.success || parsed.data.delivered !== true) {
        throw new SlackApiError(response.status, "invalid_response_shape");
      }

      return { delivered: true };
    },

    async deleteSlackDestination(input) {
      const response = await client.request({
        method: "DELETE",
        path: `/v1/projects/${input.projectId}/slack/destinations/${input.destinationId}`,
        bearerToken: input.bearerToken
      });

      if (response.status < 200 || response.status >= 300) {
        parseApiError(response.status, response.body);
      }

      return { slack_destination_id: input.destinationId };
    }
  };
}
