import { z } from "zod";
import { ProjectColorTagSchema, type ProjectColorTag } from "../../shared-types/src/index.js";

const ProjectColorTagResponseSchema = z.unknown().transform((value, context): ProjectColorTag | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = ProjectColorTagSchema.safeParse(value);
  if (!parsed.success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid project color tag"
    });
    return z.NEVER;
  }

  return parsed.data;
});

export const ProjectMetricsSchema = z
  .object({
    open_incidents: z.number().int().nonnegative().default(0),
    regressed_incidents: z.number().int().nonnegative().default(0),
    attention_incidents_today: z.number().int().nonnegative().default(0),
    opened_incidents_today: z.number().int().nonnegative().default(0),
    opened_incidents_month: z.number().int().nonnegative().default(0),
    monthly_bundle_requests: z.number().int().nonnegative(),
    monthly_raw_ingested_events: z.number().int().nonnegative(),
    retained_bundles: z.number().int().nonnegative(),
    monthly_alert_deliveries: z.number().int().nonnegative()
  });

export const ProjectRecordSchema = z
  .object({
    project_id: z.string(),
    organization_id: z.string(),
    owner_user_id: z.string(),
    owner_email: z.string().email(),
    relationship: z.enum(["owned", "shared"]),
    sharing_state: z.enum(["private", "shared_by_you", "shared_with_you"]),
    effective_role: z.enum(["owner", "admin", "member"]),
    shared_access_suspended: z.boolean().optional(),
    name: z.string(),
    slug: z.string(),
    environment_default: z.string(),
    color_tag: ProjectColorTagResponseSchema,
    organization_plan: z.enum(["free", "solo", "team"]),
    metrics: ProjectMetricsSchema,
    created_at: z.string(),
    updated_at: z.string()
  });

type ParsedProjectRecord = z.infer<typeof ProjectRecordSchema>;
export type ProjectRecord = Omit<ParsedProjectRecord, "color_tag"> & {
  color_tag: ProjectColorTag | null;
};

export const ProjectListResponseSchema = z
  .object({
    projects: z.array(ProjectRecordSchema)
  });

export const ProjectCreateResponseSchema = z
  .object({
    project: ProjectRecordSchema
  });

export const DeletedProjectRecordSchema = z
  .object({
    project_id: z.string(),
    organization_id: z.string(),
    owner_user_id: z.string(),
    owner_email: z.string().email(),
    relationship: z.enum(["owned", "shared"]),
    sharing_state: z.enum(["private", "shared_by_you", "shared_with_you"]),
    effective_role: z.enum(["owner", "admin", "member"]),
    shared_access_suspended: z.boolean().optional(),
    name: z.string(),
    slug: z.string(),
    environment_default: z.string(),
    color_tag: ProjectColorTagResponseSchema,
    organization_plan: z.enum(["free", "solo", "team"]),
    created_at: z.string(),
    updated_at: z.string()
  });

type ParsedDeletedProjectRecord = z.infer<typeof DeletedProjectRecordSchema>;
export type DeletedProjectRecord = Omit<ParsedDeletedProjectRecord, "color_tag"> & {
  color_tag: ProjectColorTag | null;
};

export const ProjectDeleteResponseSchema = z
  .object({
    project: DeletedProjectRecordSchema
  });

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

function normalizeProjectRecord(project: ParsedProjectRecord): ProjectRecord {
  return {
    ...project,
    color_tag: project.color_tag
  };
}

function normalizeDeletedProjectRecord(project: ParsedDeletedProjectRecord): DeletedProjectRecord {
  return {
    ...project,
    color_tag: project.color_tag
  };
}

async function expectProjects(responsePromise: Promise<HttpResponse>): Promise<ProjectRecord[]> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = ProjectListResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new ProjectManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.projects.map(normalizeProjectRecord);
}

async function expectProject(responsePromise: Promise<HttpResponse>): Promise<ProjectRecord> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = ProjectCreateResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new ProjectManagementApiError(response.status, "invalid_response_shape");
  }

  return normalizeProjectRecord(parsed.data.project);
}

async function expectDeletedProject(responsePromise: Promise<HttpResponse>): Promise<DeletedProjectRecord> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = ProjectDeleteResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new ProjectManagementApiError(response.status, "invalid_response_shape");
  }

  return normalizeDeletedProjectRecord(parsed.data.project);
}

export function createProjectManagementApi(client: HttpClient): {
  listProjects(input: { bearerToken: string; limit?: number }): Promise<ProjectRecord[]>;
  createProject(input: {
    bearerToken: string;
    name: string;
    slug: string;
    environmentDefault?: string;
    colorTag?: z.infer<typeof ProjectColorTagSchema> | null;
  }): Promise<ProjectRecord>;
  updateProject(input: {
    bearerToken: string;
    projectId: string;
    name?: string;
    slug?: string;
    environmentDefault?: string;
    colorTag?: z.infer<typeof ProjectColorTagSchema> | null;
  }): Promise<ProjectRecord>;
  deleteProject(input: { bearerToken: string; projectId: string }): Promise<DeletedProjectRecord>;
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
            ...(input.environmentDefault === undefined ? {} : { environment_default: input.environmentDefault }),
            ...(input.colorTag === undefined ? {} : { color_tag: input.colorTag })
          }
        })
      );
    },

    async updateProject(input) {
      const body: Record<string, string | null> = {};
      if (input.name !== undefined) {
        body["name"] = input.name;
      }
      if (input.slug !== undefined) {
        body["slug"] = input.slug;
      }
      if (input.environmentDefault !== undefined) {
        body["environment_default"] = input.environmentDefault;
      }
      if (input.colorTag !== undefined) {
        body["color_tag"] = input.colorTag;
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
