import { z } from "zod";

export const WebhookEventTypeSchema = z.enum([
  "bundle.created",
  "bundle.updated",
  "bundle.reopened",
  "bundle.resolved",
  "verification.passed",
  "verification.failed",
  "improvement_bundle.created",
  "incident.spike_detected"
]);

export const WebhookSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const WebhookLinksSchema = z
  .object({
    bundle: z.string().min(1),
    reproduction: z.string().min(1).optional()
  })
  .strict();

export const BundleLifecycleWebhookPayloadSchema = z
  .object({
    event: z.enum(["bundle.created", "bundle.updated", "bundle.resolved", "improvement_bundle.created"]),
    occurred_at: z.string().datetime(),
    project_id: z.string().min(1),
    bundle_id: z.string().min(1),
    bundle_type: z.enum(["failure", "improvement"]),
    severity: WebhookSeveritySchema,
    service: z.string().min(1),
    environment: z.string().min(1),
    verification: z.boolean(),
    summary: z.string().min(1),
    links: WebhookLinksSchema
  })
  .strict();

export const IncidentLifecycleWebhookPayloadSchema = z
  .object({
    event_type: z.enum(["bundle.reopened", "incident.spike_detected"]),
    incident_id: z.string().min(1),
    project_id: z.string().min(1),
    occurred_at: z.string().datetime(),
    service_name: z.string().min(1),
    environment: z.string().min(1),
    severity: WebhookSeveritySchema,
    regression_after_deploy: z.boolean(),
    deploy_version: z.string().nullable(),
    deploy_commit_sha: z.string().nullable(),
    deploy_branch: z.string().nullable(),
    deploy_deployed_at: z.string().datetime().nullable(),
    minutes_since_deploy: z.number().nullable()
  })
  .strict();

export const VerificationWebhookTestPayloadSchema = z
  .object({
    delivery_id: z.string().min(1),
    event: z.enum(["verification.passed", "verification.failed"]),
    event_type: z.enum(["verification.passed", "verification.failed"]),
    occurred_at: z.string().datetime(),
    project_id: z.string().min(1),
    webhook_id: z.string().min(1),
    incident_id: z.string().min(1),
    test: z.literal(true),
    data: z
      .object({
        message: z.string().min(1)
      })
      .strict()
  })
  .strict();

export const WebhookEventPayloadSchema = z.union([
  BundleLifecycleWebhookPayloadSchema,
  IncidentLifecycleWebhookPayloadSchema,
  VerificationWebhookTestPayloadSchema
]);

export const WebhookFiltersSchema = z
  .object({
    environment: z.array(z.string()).optional(),
    service: z.array(z.string()).optional(),
    severity_min: z.enum(["low", "medium", "high", "critical"]).optional(),
    bundle_type: z.array(z.enum(["failure", "improvement"])).optional(),
    verification: z.boolean().optional()
  })
  .strict();

export const WebhookSchema = z
  .object({
    webhook_id: z.string(),
    project_id: z.string(),
    created_by_user_id: z.string(),
    url: z.string(),
    events: z.array(WebhookEventTypeSchema),
    filters: WebhookFiltersSchema,
    is_enabled: z.boolean(),
    created_at: z.string(),
    updated_at: z.string()
  })
  .strict();

export const WebhookCreateSchema = WebhookSchema.extend({
  signing_secret: z.string()
}).strict();

export const WebhookListResponseSchema = z
  .object({
    webhooks: z.array(WebhookSchema)
  })
  .strict();

export const WebhookResponseSchema = z
  .object({
    webhook: WebhookSchema
  })
  .strict();

export const WebhookCreateResponseSchema = z
  .object({
    webhook: WebhookCreateSchema
  })
  .strict();

export const WebhookDeliverySchema = z
  .object({
    delivery_id: z.string(),
    event_type: WebhookEventTypeSchema,
    status: z.enum(["pending", "retrying", "delivered", "failed", "disabled"]),
    attempt_count: z.number(),
    next_attempt_at: z.string().nullable(),
    last_response_code: z.number().nullable(),
    last_attempted_at: z.string().nullable(),
    last_error: z.string().nullable()
  })
  .strict();

export const WebhookDeliveriesResponseSchema = z
  .object({
    deliveries: z.array(WebhookDeliverySchema)
  })
  .strict();

export const WebhookTestResponseSchema = z
  .object({
    delivery: WebhookDeliverySchema
  })
  .strict();

export const RetryWebhookDeliveryResponseSchema = z
  .object({
    delivery_id: z.string(),
    event_type: WebhookEventTypeSchema
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

export type WebhookRecord = z.infer<typeof WebhookSchema>;
export type WebhookCreatedRecord = z.infer<typeof WebhookCreateSchema>;
export type WebhookFilters = z.infer<typeof WebhookFiltersSchema>;
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

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

export class WebhookApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`webhook_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function parseApiError(status: number, body: unknown): never {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new WebhookApiError(status, "unknown_error");
  }

  throw new WebhookApiError(status, parsed.data.error);
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

async function expectWebhookList(responsePromise: Promise<HttpResponse>): Promise<WebhookRecord[]> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = WebhookListResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new WebhookApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.webhooks;
}

async function expectWebhook(responsePromise: Promise<HttpResponse>): Promise<WebhookRecord> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = WebhookResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new WebhookApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.webhook;
}

async function expectCreatedWebhook(responsePromise: Promise<HttpResponse>): Promise<WebhookCreatedRecord> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = WebhookCreateResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new WebhookApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.webhook;
}

async function expectWebhookDeliveries(responsePromise: Promise<HttpResponse>): Promise<WebhookDelivery[]> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = WebhookDeliveriesResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new WebhookApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.deliveries;
}

async function expectWebhookTestDelivery(responsePromise: Promise<HttpResponse>): Promise<WebhookDelivery> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = WebhookTestResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new WebhookApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.delivery;
}

async function expectRetryDelivery(responsePromise: Promise<HttpResponse>): Promise<{ delivery_id: string; event_type: string }> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = RetryWebhookDeliveryResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new WebhookApiError(response.status, "invalid_response_shape");
  }

  return parsed.data;
}

export function createWebhookApi(client: HttpClient): {
  listWebhooks(input: { bearerToken: string; projectId: string; limit?: number }): Promise<WebhookRecord[]>;
  createWebhook(input: {
    bearerToken: string;
    projectId: string;
    url: string;
    events: string[];
    filters?: Record<string, unknown>;
    isEnabled?: boolean;
  }): Promise<WebhookCreatedRecord>;
  getWebhook(input: { bearerToken: string; projectId: string; webhookId: string }): Promise<WebhookRecord>;
  updateWebhook(input: {
    bearerToken: string;
    projectId: string;
    webhookId: string;
    url?: string;
    events?: string[];
    filters?: Record<string, unknown>;
    isEnabled?: boolean;
  }): Promise<WebhookRecord>;
  deleteWebhook(input: { bearerToken: string; projectId: string; webhookId: string }): Promise<{ webhook_id: string }>;
  testWebhook(input: {
    bearerToken: string;
    projectId: string;
    webhookId: string;
    eventType?: "verification.passed" | "verification.failed";
  }): Promise<WebhookDelivery>;
  listWebhookDeliveries(input: { bearerToken: string; projectId: string; webhookId: string; limit?: number }): Promise<WebhookDelivery[]>;
  retryWebhookDelivery(input: { bearerToken: string; projectId: string; webhookId: string; deliveryId: string }): Promise<{ delivery_id: string; event_type: string }>;
} {
  return {
    async listWebhooks(input) {
      return expectWebhookList(
        client.request({
          method: "GET",
          path: `/v1/webhooks${buildQuery({ project_id: input.projectId, limit: input.limit })}`,
          bearerToken: input.bearerToken
        })
      );
    },

    async createWebhook(input) {
      const body: {
        project_id: string;
        url: string;
        events: string[];
        filters?: Record<string, unknown>;
        is_enabled?: boolean;
      } = {
        project_id: input.projectId,
        url: input.url,
        events: input.events
      };

      if (input.filters !== undefined) {
        body.filters = input.filters;
      }
      if (input.isEnabled !== undefined) {
        body.is_enabled = input.isEnabled;
      }

      return expectCreatedWebhook(
        client.request({
          method: "POST",
          path: "/v1/webhooks",
          bearerToken: input.bearerToken,
          body
        })
      );
    },

    async getWebhook(input) {
      return expectWebhook(
        client.request({
          method: "GET",
          path: `/v1/webhooks/${input.webhookId}${buildQuery({ project_id: input.projectId })}`,
          bearerToken: input.bearerToken
        })
      );
    },

    async updateWebhook(input) {
      const body: {
        url?: string;
        events?: string[];
        filters?: Record<string, unknown>;
        is_enabled?: boolean;
      } = {};

      if (input.url !== undefined) {
        body.url = input.url;
      }
      if (input.events !== undefined) {
        body.events = input.events;
      }
      if (input.filters !== undefined) {
        body.filters = input.filters;
      }
      if (input.isEnabled !== undefined) {
        body.is_enabled = input.isEnabled;
      }

      return expectWebhook(
        client.request({
          method: "PATCH",
          path: `/v1/webhooks/${input.webhookId}${buildQuery({ project_id: input.projectId })}`,
          bearerToken: input.bearerToken,
          body
        })
      );
    },

    async deleteWebhook(input) {
      const response = await client.request({
        method: "DELETE",
        path: `/v1/webhooks/${input.webhookId}${buildQuery({ project_id: input.projectId })}`,
        bearerToken: input.bearerToken
      });

      if (response.status < 200 || response.status >= 300) {
        parseApiError(response.status, response.body);
      }

      return {
        webhook_id: input.webhookId
      };
    },

    async testWebhook(input) {
      const body: {
        event_type?: "verification.passed" | "verification.failed";
      } = {};

      if (input.eventType !== undefined) {
        body.event_type = input.eventType;
      }

      return expectWebhookTestDelivery(
        client.request({
          method: "POST",
          path: `/v1/webhooks/${input.webhookId}/test${buildQuery({ project_id: input.projectId })}`,
          bearerToken: input.bearerToken,
          body
        })
      );
    },

    async listWebhookDeliveries(input) {
      return expectWebhookDeliveries(
        client.request({
          method: "GET",
          path: `/v1/webhooks/${input.webhookId}/deliveries${buildQuery({ project_id: input.projectId, limit: input.limit })}`,
          bearerToken: input.bearerToken
        })
      );
    },

    async retryWebhookDelivery(input) {
      return expectRetryDelivery(
        client.request({
          method: "POST",
          path: `/v1/webhooks/${input.webhookId}/deliveries/${input.deliveryId}/retry${buildQuery({ project_id: input.projectId })}`,
          bearerToken: input.bearerToken,
          body: {}
        })
      );
    }
  };
}
