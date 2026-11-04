import { z } from "zod";
import {
  ServiceDefinitionSchema,
  ServiceDefinitionPageSchema,
  ServiceDefinitionCreateSchema,
  ServiceDefinitionUpdateSchema,
  type ServiceDefinition,
  type ServiceDefinitionPage,
  type ServiceDefinitionCreate,
  type ServiceDefinitionUpdate
} from "../../shared-types/src/project-services.js";
import { ProjectManagementApiError, type HttpClient } from "./index.js";

const Scope = z.object({ bearerToken: z.string().min(1), projectId: z.string().guid() });
type Scope = z.infer<typeof Scope>;
type Identity = Scope & { serviceDefinitionId: string };
export interface ProjectServicesApi {
  listServiceDefinitions(
    input: Scope & { limit?: number | undefined; cursor?: string | undefined }
  ): Promise<ServiceDefinitionPage>;
  getServiceDefinition(input: Identity): Promise<ServiceDefinition>;
  createServiceDefinition(
    input: Scope & { service: ServiceDefinitionCreate }
  ): Promise<ServiceDefinition>;
  updateServiceDefinition(
    input: Identity & { update: ServiceDefinitionUpdate }
  ): Promise<ServiceDefinition>;
}

export function createProjectServicesApi(client: HttpClient): ProjectServicesApi {
  async function request<Result>(
    input: Scope,
    method: "GET" | "POST" | "PATCH",
    suffix: string,
    schema: z.ZodType<Result>,
    body?: unknown
  ): Promise<Result> {
    const response = await client.request({
      method,
      path: `/v1/projects/${input.projectId}/service-definitions${suffix}`,
      bearerToken: input.bearerToken,
      ...(body === undefined ? {} : { body })
    });
    if (response.status < 200 || response.status >= 300) {
      const error = z.object({ error: z.string() }).safeParse(response.body);
      throw new ProjectManagementApiError(
        response.status,
        error.success ? error.data.error : "unknown_error"
      );
    }
    const parsed = schema.safeParse(response.body);
    if (!parsed.success)
      throw new ProjectManagementApiError(response.status, "invalid_response_shape");
    return parsed.data;
  }
  function validate<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ProjectManagementApiError(400, "invalid_service_request");
    return parsed.data;
  }
  const identity = Scope.extend({ serviceDefinitionId: z.string().guid() });
  const record = z.object({ service: ServiceDefinitionSchema });
  return {
    async listServiceDefinitions(input) {
      const data = validate(
        Scope.extend({
          limit: z.number().int().min(1).max(200).optional(),
          cursor: z.string().guid().optional()
        }).strict(),
        input
      );
      const query = new URLSearchParams();
      if (data.limit !== undefined) query.set("limit", String(data.limit));
      if (data.cursor !== undefined) query.set("cursor", data.cursor);
      return request(data, "GET", query.size ? `?${query}` : "", ServiceDefinitionPageSchema);
    },
    async getServiceDefinition(input) {
      const data = validate(identity.strict(), input);
      return (await request(data, "GET", `/${data.serviceDefinitionId}`, record)).service;
    },
    async createServiceDefinition(input) {
      const data = validate(
        Scope.extend({ service: ServiceDefinitionCreateSchema }).strict(),
        input
      );
      return (await request(data, "POST", "", record, data.service)).service;
    },
    async updateServiceDefinition(input) {
      const data = validate(
        identity.extend({ update: ServiceDefinitionUpdateSchema }).strict(),
        input
      );
      return (await request(data, "PATCH", `/${data.serviceDefinitionId}`, record, data.update))
        .service;
    }
  };
}
