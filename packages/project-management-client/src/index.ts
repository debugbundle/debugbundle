import { z } from "zod";

export const ProjectMetricsSchema = z
  .object({
    monthly_bundle_requests: z.number().int().nonnegative(),
    monthly_raw_ingested_events: z.number().int().nonnegative(),
    retained_bundles: z.number().int().nonnegative(),
    monthly_alert_deliveries: z.number().int().nonnegative()
  })
  .strict();

export const ProjectRecordSchema = z
  .object({
    project_id: z.string(),
    organization_id: z.string(),
    owner_user_id: z.string(),
    owner_email: z.string().email(),
    relationship: z.enum(["owned", "shared"]),
    effective_role: z.enum(["owner", "admin", "member"]),
    name: z.string(),
    slug: z.string(),
    environment_default: z.string(),
    organization_plan: z.enum(["free", "solo", "team"]),
    metrics: ProjectMetricsSchema,
    created_at: z.string(),
    updated_at: z.string()
  })
  .strict();

export const ProjectListResponseSchema = z
  .object({
    projects: z.array(ProjectRecordSchema)
  })
  .strict();

export const ProjectCreateResponseSchema = z
  .object({
    project: ProjectRecordSchema
  })
  .strict();

export const DeletedProjectRecordSchema = z
  .object({
    project_id: z.string(),
    organization_id: z.string(),
    owner_user_id: z.string(),
    owner_email: z.string().email(),
    relationship: z.enum(["owned", "shared"]),
    effective_role: z.enum(["owner", "admin", "member"]),
    name: z.string(),
    slug: z.string(),
    environment_default: z.string(),
    organization_plan: z.enum(["free", "solo", "team"]),
    created_at: z.string(),
    updated_at: z.string()
  })
  .strict();

export const ProjectDeleteResponseSchema = z
  .object({
    project: DeletedProjectRecordSchema
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

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

export class ProjectManagementApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`project_management_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function parseApiError(status: number, body: unknown): never {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProjectManagementApiError(status, "unknown_error");
  }

  throw new ProjectManagementApiError(status, parsed.data.error);
}

async function expectProjects(responsePromise: Promise<HttpResponse>): Promise<Array<z.infer<typeof ProjectRecordSchema>>> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = ProjectListResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new ProjectManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.projects;
}

async function expectProject(responsePromise: Promise<HttpResponse>): Promise<z.infer<typeof ProjectRecordSchema>> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = ProjectCreateResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new ProjectManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.project;
}

async function expectDeletedProject(responsePromise: Promise<HttpResponse>): Promise<z.infer<typeof DeletedProjectRecordSchema>> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = ProjectDeleteResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new ProjectManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.project;
}

export function createProjectManagementApi(client: HttpClient): {
  listProjects(input: { bearerToken: string; limit?: number }): Promise<Array<z.infer<typeof ProjectRecordSchema>>>;
  createProject(input: {
    bearerToken: string;
    name: string;
    slug: string;
    environmentDefault?: string;
  }): Promise<z.infer<typeof ProjectRecordSchema>>;
  updateProject(input: {
    bearerToken: string;
    projectId: string;
    name?: string;
    slug?: string;
    environmentDefault?: string;
  }): Promise<z.infer<typeof ProjectRecordSchema>>;
  deleteProject(input: { bearerToken: string; projectId: string }): Promise<z.infer<typeof DeletedProjectRecordSchema>>;
} {
  return {
    async listProjects(input) {
      const query = input.limit === undefined ? "" : `?limit=${input.limit}`;
      return expectProjects(
        client.request({
          method: "GET",
          path: `/v1/projects${query}`,
          bearerToken: input.bearerToken
        })
      );
    },

    async createProject(input) {
      return expectProject(
        client.request({
          method: "POST",
          path: "/v1/projects",
          bearerToken: input.bearerToken,
          body: {
            name: input.name,
            slug: input.slug,
            ...(input.environmentDefault === undefined ? {} : { environment_default: input.environmentDefault })
          }
        })
      );
    },

    async updateProject(input) {
      const body: Record<string, string> = {};
      if (input.name !== undefined) {
        body["name"] = input.name;
      }
      if (input.slug !== undefined) {
        body["slug"] = input.slug;
      }
      if (input.environmentDefault !== undefined) {
        body["environment_default"] = input.environmentDefault;
      }

      return expectProject(
        client.request({
          method: "PATCH",
          path: `/v1/projects/${input.projectId}`,
          bearerToken: input.bearerToken,
          body
        })
      );
    },

    async deleteProject(input) {
      return expectDeletedProject(
        client.request({
          method: "DELETE",
          path: `/v1/projects/${input.projectId}`,
          bearerToken: input.bearerToken
        })
      );
    }
  };
}
