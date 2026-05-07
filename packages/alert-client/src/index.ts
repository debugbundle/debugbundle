import { z } from "zod";

export const AlertChannelSchema = z.enum(["email", "slack", "discord", "webhook"]);
export const AlertConditionTypeSchema = z.enum([
  "new_incident",
  "incident_regressed",
  "error_spike",
  "severity_threshold",
  "regression_after_deploy"
]);

export const AlertSchema = z
  .object({
    alert_id: z.string(),
    project_id: z.string(),
    service_id: z.string().nullable(),
    channel: AlertChannelSchema,
    condition_type: AlertConditionTypeSchema,
    severity_min: z.enum(["low", "medium", "high", "critical"]).nullable(),
    config: z.record(z.string(), z.unknown()),
    is_enabled: z.boolean(),
    created_at: z.string(),
    updated_at: z.string()
  })
  .strict();

export const AlertListResponseSchema = z
  .object({
    alerts: z.array(AlertSchema)
  })
  .strict();

export const AlertResponseSchema = z
  .object({
    alert: AlertSchema
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

export type AlertRecord = z.infer<typeof AlertSchema>;
export type AlertChannel = z.infer<typeof AlertChannelSchema>;
export type AlertConditionType = z.infer<typeof AlertConditionTypeSchema>;

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

export class AlertApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`alert_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function parseApiError(status: number, body: unknown): never {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AlertApiError(status, "unknown_error");
  }

  throw new AlertApiError(status, parsed.data.error);
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

async function expectAlertList(responsePromise: Promise<HttpResponse>): Promise<AlertRecord[]> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = AlertListResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new AlertApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.alerts;
}

async function expectAlert(responsePromise: Promise<HttpResponse>): Promise<AlertRecord> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = AlertResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new AlertApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.alert;
}

export function createAlertApi(client: HttpClient): {
  listAlerts(input: { bearerToken: string; projectId: string; limit?: number }): Promise<AlertRecord[]>;
  createAlert(input: {
    bearerToken: string;
    projectId: string;
    serviceId?: string;
    channel: AlertChannel;
    conditionType: AlertConditionType;
    severityMin?: "low" | "medium" | "high" | "critical";
    config?: Record<string, unknown>;
    isEnabled?: boolean;
  }): Promise<AlertRecord>;
  updateAlert(input: {
    bearerToken: string;
    alertId: string;
    serviceId?: string | null;
    channel?: AlertChannel;
    conditionType?: AlertConditionType;
    severityMin?: "low" | "medium" | "high" | "critical" | null;
    config?: Record<string, unknown> | null;
    isEnabled?: boolean;
  }): Promise<AlertRecord>;
  deleteAlert(input: { bearerToken: string; alertId: string }): Promise<{ alert_id: string }>;
} {
  return {
    async listAlerts(input) {
      return expectAlertList(
        client.request({
          method: "GET",
          path: `/v1/alerts${buildQuery({ project_id: input.projectId, limit: input.limit })}`,
          bearerToken: input.bearerToken
        })
      );
    },

    async createAlert(input) {
      const body: {
        project_id: string;
        service_id?: string;
        channel: AlertChannel;
        condition_type: AlertConditionType;
        severity_min?: "low" | "medium" | "high" | "critical";
        config?: Record<string, unknown>;
        is_enabled?: boolean;
      } = {
        project_id: input.projectId,
        channel: input.channel,
        condition_type: input.conditionType
      };

      if (input.serviceId !== undefined) {
        body.service_id = input.serviceId;
      }
      if (input.severityMin !== undefined) {
        body.severity_min = input.severityMin;
      }
      if (input.config !== undefined) {
        body.config = input.config;
      }
      if (input.isEnabled !== undefined) {
        body.is_enabled = input.isEnabled;
      }

      return expectAlert(
        client.request({
          method: "POST",
          path: "/v1/alerts",
          bearerToken: input.bearerToken,
          body
        })
      );
    },

    async updateAlert(input) {
      const body: {
        service_id?: string | null;
        channel?: AlertChannel;
        condition_type?: AlertConditionType;
        severity_min?: "low" | "medium" | "high" | "critical" | null;
        config?: Record<string, unknown> | null;
        is_enabled?: boolean;
      } = {};

      if (input.serviceId !== undefined) {
        body.service_id = input.serviceId;
      }
      if (input.channel !== undefined) {
        body.channel = input.channel;
      }
      if (input.conditionType !== undefined) {
        body.condition_type = input.conditionType;
      }
      if (input.severityMin !== undefined) {
        body.severity_min = input.severityMin;
      }
      if (input.config !== undefined) {
        body.config = input.config;
      }
      if (input.isEnabled !== undefined) {
        body.is_enabled = input.isEnabled;
      }

      return expectAlert(
        client.request({
          method: "PATCH",
          path: `/v1/alerts/${input.alertId}`,
          bearerToken: input.bearerToken,
          body
        })
      );
    },

    async deleteAlert(input) {
      const response = await client.request({
        method: "DELETE",
        path: `/v1/alerts/${input.alertId}`,
        bearerToken: input.bearerToken
      });

      if (response.status < 200 || response.status >= 300) {
        parseApiError(response.status, response.body);
      }

      return { alert_id: input.alertId };
    }
  };
}