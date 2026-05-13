import { z } from "zod";

export const WeeklyReportChannelSchema = z.enum(["email", "slack"]);
export const WeeklyReportDayOfWeekSchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
]);

export const WeeklyReportScheduleSchema = z
  .object({
    day_of_week: WeeklyReportDayOfWeekSchema,
    hour_of_day: z.number().int().min(0).max(23),
    timezone: z.string().min(1)
  })
  .strict();

export const WeeklyReportChannelRecordSchema = z
  .object({
    channel_id: z.string(),
    project_id: z.string(),
    channel: WeeklyReportChannelSchema,
    config: z.record(z.string(), z.unknown()),
    schedule: WeeklyReportScheduleSchema,
    is_enabled: z.boolean(),
    created_at: z.string(),
    updated_at: z.string()
  })
  .strict();

export const WeeklyReportChannelListResponseSchema = z
  .object({
    channels: z.array(WeeklyReportChannelRecordSchema)
  })
  .strict();

export const WeeklyReportChannelResponseSchema = z
  .object({
    channel: WeeklyReportChannelRecordSchema
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

export type WeeklyReportChannelRecord = z.infer<typeof WeeklyReportChannelRecordSchema>;
export type WeeklyReportChannel = z.infer<typeof WeeklyReportChannelSchema>;
export type WeeklyReportDayOfWeek = z.infer<typeof WeeklyReportDayOfWeekSchema>;

type WeeklyReportCreateInput = {
  bearerToken: string;
  projectId: string;
  schedule: { dayOfWeek: WeeklyReportDayOfWeek; hourOfDay: number; timezone: string };
  isEnabled?: boolean;
} & ({ channel: "email"; config: { to: string[] } } | { channel: "slack"; config: { webhookUrl: string } | { slackDestinationId: string } });

type WeeklyReportUpdateInput = {
  bearerToken: string;
  channelId: string;
  config?: { to: string[] } | { webhookUrl: string } | { slackDestinationId: string };
  schedule?: { dayOfWeek: WeeklyReportDayOfWeek; hourOfDay: number; timezone: string };
  isEnabled?: boolean;
};

export interface HttpRequestInput {
  method: "GET" | "POST" | "PATCH" | "DELETE";
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

export class WeeklyReportApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`weekly_report_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function parseApiError(status: number, body: unknown): never {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new WeeklyReportApiError(status, "unknown_error");
  }

  throw new WeeklyReportApiError(status, parsed.data.error);
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

async function expectChannelList(responsePromise: Promise<HttpResponse>): Promise<WeeklyReportChannelRecord[]> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = WeeklyReportChannelListResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new WeeklyReportApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.channels;
}

async function expectChannel(responsePromise: Promise<HttpResponse>): Promise<WeeklyReportChannelRecord> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = WeeklyReportChannelResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new WeeklyReportApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.channel;
}

export function createWeeklyReportApi(client: HttpClient): {
  listWeeklyReportChannels(input: { bearerToken: string; projectId: string; limit?: number }): Promise<WeeklyReportChannelRecord[]>;
  createWeeklyReportChannel(input: WeeklyReportCreateInput): Promise<WeeklyReportChannelRecord>;
  updateWeeklyReportChannel(input: WeeklyReportUpdateInput): Promise<WeeklyReportChannelRecord>;
  deleteWeeklyReportChannel(input: { bearerToken: string; channelId: string }): Promise<{ channel_id: string }>;
} {
  return {
    async listWeeklyReportChannels(input) {
      return expectChannelList(
        client.request({
          method: "GET",
          path: `/v1/weekly-report-channels${buildQuery({ project_id: input.projectId, limit: input.limit })}`,
          bearerToken: input.bearerToken
        })
      );
    },

    async createWeeklyReportChannel(input) {
      const config =
        input.channel === "email"
          ? { to: input.config.to }
          : "webhookUrl" in input.config
            ? { webhook_url: input.config.webhookUrl }
            : { slack_destination_id: input.config.slackDestinationId };

      return expectChannel(
        client.request({
          method: "POST",
          path: "/v1/weekly-report-channels",
          bearerToken: input.bearerToken,
          body: {
            project_id: input.projectId,
            channel: input.channel,
            config,
            schedule: {
              day_of_week: input.schedule.dayOfWeek,
              hour_of_day: input.schedule.hourOfDay,
              timezone: input.schedule.timezone
            },
            ...(input.isEnabled !== undefined ? { is_enabled: input.isEnabled } : {})
          }
        })
      );
    },

    async updateWeeklyReportChannel(input) {
      const body: Record<string, unknown> = {};
      if (input.config !== undefined) {
        body["config"] =
          "to" in input.config
            ? { to: input.config.to }
            : "webhookUrl" in input.config
              ? { webhook_url: input.config.webhookUrl }
              : { slack_destination_id: input.config.slackDestinationId };
      }
      if (input.schedule !== undefined) {
        body["schedule"] = {
          day_of_week: input.schedule.dayOfWeek,
          hour_of_day: input.schedule.hourOfDay,
          timezone: input.schedule.timezone
        };
      }
      if (input.isEnabled !== undefined) {
        body["is_enabled"] = input.isEnabled;
      }

      return expectChannel(
        client.request({
          method: "PATCH",
          path: `/v1/weekly-report-channels/${input.channelId}`,
          bearerToken: input.bearerToken,
          body
        })
      );
    },

    async deleteWeeklyReportChannel(input) {
      const response = await client.request({
        method: "DELETE",
        path: `/v1/weekly-report-channels/${input.channelId}`,
        bearerToken: input.bearerToken
      });

      if (response.status < 200 || response.status >= 300) {
        parseApiError(response.status, response.body);
      }

      return { channel_id: input.channelId };
    }
  };
}
