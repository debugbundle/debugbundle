import { z } from "zod";

export const IncidentReasonSchema = z
  .object({
    kind: z.enum(["backend_exception", "frontend_exception", "request_failure_5xx", "error_log"]),
    description: z.string(),
    event_type: z.enum(["backend_exception", "frontend_exception", "request_event", "log_event"]),
    event_class: z.literal("incident_signal"),
    matched_policy: z.string()
  })
  .strict();

export const IncidentSchema = z
  .object({
    incident_id: z.string(),
    project_id: z.string(),
    project_name: z.string(),
    service_id: z.string().nullable(),
    service_name: z.string().nullable(),
    latest_deployment_id: z.string().nullable(),
    environment: z.string(),
    fingerprint: z.string(),
    fingerprint_version: z.string(),
    title: z.string(),
    severity: z.string(),
    status: z.string(),
    first_seen_at: z.string(),
    last_seen_at: z.string(),
    occurrence_count: z.number().int(),
    spike_detected_at: z.string().nullable(),
    resolved_at: z.string().nullable().optional(),
    regressed_at: z.string().nullable(),
    matched_fields: z.array(z.string()),
    incident_reason: IncidentReasonSchema.optional()
  })
  .strict();

export const ServiceSchema = z
  .object({
    service_id: z.string(),
    project_id: z.string(),
    name: z.string(),
    runtime: z.string().nullable(),
    framework: z.string().nullable(),
    environment: z.string()
  })
  .strict();

export const LogSchema = z
  .object({
    event_id: z.string(),
    event_type: z.string(),
    occurred_at: z.string(),
    is_sampled: z.boolean(),
    level: z.string().nullable()
  })
  .strict();

export const IncidentsResponseSchema = z
  .object({
    incidents: z.array(IncidentSchema),
    next_cursor: z.string().nullable().optional()
  })
  .strict();

export const IncidentResponseSchema = z
  .object({
    incident: IncidentSchema
  })
  .strict();

export const ServicesResponseSchema = z
  .object({
    services: z.array(ServiceSchema)
  })
  .strict();

export const LogsResponseSchema = z
  .object({
    logs: z.array(LogSchema),
    next_cursor: z.string().nullable().optional()
  })
  .strict();

export const PendingStatusSchema = z
  .object({
    status: z.literal("pending")
  })
  .strict();

export const BundleSchema = z
  .object({
    bundle_version: z.number().int()
  })
  .passthrough();

export const ReproductionArtifactsSchema = z
  .object({
    curl: z.string().nullable().optional(),
    httpie: z.string().nullable().optional(),
    json_spec: z.unknown().nullable().optional()
  })
  .strict();

export const ReproductionSchema = z
  .object({
    possible: z.boolean(),
    confidence: z.number(),
    reason: z.string(),
    artifacts: ReproductionArtifactsSchema.nullable(),
    feasibility_reference: z.unknown().nullable()
  })
  .strict();

export const BundleResponseSchema = z.union([PendingStatusSchema, BundleSchema]);

export const ReproductionResponseSchema = z.union([PendingStatusSchema, ReproductionSchema]);

export const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

export interface HttpRequestInput {
  method: "GET" | "POST";
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

export class RetrievalApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`retrieval_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function parseApiError(status: number, body: unknown): never {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new RetrievalApiError(status, "unknown_error");
  }

  throw new RetrievalApiError(status, parsed.data.error);
}

async function expectParsed<TParsed>(
  responsePromise: Promise<HttpResponse>,
  schema: z.ZodType<TParsed>
): Promise<TParsed> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = schema.safeParse(response.body);
  if (!parsed.success) {
    throw new RetrievalApiError(response.status, "invalid_response_shape");
  }

  return parsed.data;
}

async function expectServices(responsePromise: Promise<HttpResponse>): Promise<Array<z.infer<typeof ServiceSchema>>> {
  const parsed = await expectParsed(responsePromise, ServicesResponseSchema);
  return parsed.services;
}

export function createRetrievalApi(client: HttpClient): {
  listIncidents(input: {
    bearerToken: string;
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ incidents: Array<z.infer<typeof IncidentSchema>>; next_cursor: string | null }>;
  getIncident(input: { bearerToken: string; incidentId: string }): Promise<z.infer<typeof IncidentSchema>>;
  resolveIncident(input: { bearerToken: string; incidentId: string }): Promise<z.infer<typeof IncidentSchema>>;
  reopenIncident(input: { bearerToken: string; incidentId: string }): Promise<z.infer<typeof IncidentSchema>>;
  getBundle(input: { bearerToken: string; incidentId: string }): Promise<z.infer<typeof PendingStatusSchema> | z.infer<typeof BundleSchema>>;
  listLogs(input: {
    bearerToken: string;
    incidentId: string;
    level?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ logs: Array<z.infer<typeof LogSchema>>; next_cursor: string | null }>;
  getReproduction(input: { bearerToken: string; incidentId: string }): Promise<z.infer<typeof PendingStatusSchema> | z.infer<typeof ReproductionSchema>>;
  listServices(input: { bearerToken: string; projectId: string; limit?: number }): Promise<Array<z.infer<typeof ServiceSchema>>>;
} {
  return {
    async listIncidents(input) {
      const query = new URLSearchParams();
      if (input.projectId !== undefined) {
        query.set("project_id", input.projectId);
      }
      if (input.environment !== undefined) {
        query.set("environment", input.environment);
      }
      if (input.service !== undefined) {
        query.set("service", input.service);
      }
      if (input.status !== undefined) {
        query.set("status", input.status);
      }
      if (input.severity !== undefined) {
        query.set("severity", input.severity);
      }
      if (input.cursor !== undefined) {
        query.set("cursor", input.cursor);
      }
      if (input.limit !== undefined) {
        query.set("limit", String(input.limit));
      }

      const path = query.size > 0 ? `/v1/incidents?${query.toString()}` : "/v1/incidents";
      const parsed = await expectParsed(
        client.request({
          method: "GET",
          path,
          bearerToken: input.bearerToken
        }),
        IncidentsResponseSchema
      );

      return {
        incidents: parsed.incidents,
        next_cursor: parsed.next_cursor ?? null
      };
    },
    async getIncident(input) {
      const parsed = await expectParsed(
        client.request({
          method: "GET",
          path: `/v1/incidents/${input.incidentId}`,
          bearerToken: input.bearerToken
        }),
        IncidentResponseSchema
      );

      return parsed.incident;
    },
    async resolveIncident(input) {
      const parsed = await expectParsed(
        client.request({
          method: "POST",
          path: `/v1/incidents/${input.incidentId}/resolve`,
          bearerToken: input.bearerToken
        }),
        IncidentResponseSchema
      );

      return parsed.incident;
    },
    async reopenIncident(input) {
      const parsed = await expectParsed(
        client.request({
          method: "POST",
          path: `/v1/incidents/${input.incidentId}/reopen`,
          bearerToken: input.bearerToken
        }),
        IncidentResponseSchema
      );

      return parsed.incident;
    },
    async getBundle(input) {
      const bundle = await expectParsed(
        client.request({
          method: "GET",
          path: `/v1/incidents/${input.incidentId}/bundle`,
          bearerToken: input.bearerToken
        }),
        BundleResponseSchema
      );

      return bundle;
    },
    async listLogs(input) {
      const query = new URLSearchParams({ incident_id: input.incidentId });
      if (input.level !== undefined) {
        query.set("level", input.level);
      }
      if (input.cursor !== undefined) {
        query.set("cursor", input.cursor);
      }
      if (input.limit !== undefined) {
        query.set("limit", String(input.limit));
      }

      const parsed = await expectParsed(
        client.request({
          method: "GET",
          path: `/v1/logs?${query.toString()}`,
          bearerToken: input.bearerToken
        }),
        LogsResponseSchema
      );

      return {
        logs: parsed.logs,
        next_cursor: parsed.next_cursor ?? null
      };
    },
    async getReproduction(input) {
      const reproduction = await expectParsed(
        client.request({
          method: "GET",
          path: `/v1/incidents/${input.incidentId}/reproduction`,
          bearerToken: input.bearerToken
        }),
        ReproductionResponseSchema
      );

      return reproduction;
    },
    async listServices(input) {
      const query = new URLSearchParams({ project_id: input.projectId });
      if (input.limit !== undefined) {
        query.set("limit", String(input.limit));
      }

      return expectServices(
        client.request({
          method: "GET",
          path: `/v1/services?${query.toString()}`,
          bearerToken: input.bearerToken
        })
      );
    }
  };
}
