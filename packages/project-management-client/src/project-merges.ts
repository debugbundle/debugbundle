import { z } from "zod";
import {
  ProjectMergeRequestSchema,
  ProjectMergeApplySchema,
  ProjectMergePlanSchema,
  ProjectMergeOperationSchema,
  ProjectMergeVerificationSchema,
  ProjectMergeSelectorSchema,
  type ProjectMergeRequest,
  type ProjectMergeApply,
  type ProjectMergePlan,
  type ProjectMergeOperation,
  type ProjectMergeVerification
} from "../../shared-types/src/project-consolidation.js";
import { ProjectManagementApiError, type HttpClient } from "./index.js";
const auth = z.object({ bearerToken: z.string().min(1) });
const identity = auth.extend({ operation_id: z.string().guid() }).strict();
type Auth = z.infer<typeof auth>;
type Identity = z.infer<typeof identity>;
export class ProjectMergeApiError extends ProjectManagementApiError {
  constructor(
    status: number,
    code: string,
    readonly operation_id: string | null = null
  ) {
    super(status, code);
  }
}
export interface ProjectMergesApi {
  previewProjectMerge(input: Auth & { request: ProjectMergeRequest }): Promise<ProjectMergePlan>;
  applyProjectMerge(input: Auth & ProjectMergeApply): Promise<ProjectMergeOperation>;
  getProjectMerge(
    input: Auth & z.infer<typeof ProjectMergeSelectorSchema>
  ): Promise<ProjectMergeOperation>;
  verifyProjectMerge(input: Identity): Promise<ProjectMergeVerification>;
  resumeProjectMerge(input: Identity): Promise<ProjectMergeOperation>;
  cancelProjectMerge(input: Identity): Promise<ProjectMergeOperation>;
}
export function createProjectMergesApi(client: HttpClient): ProjectMergesApi {
  async function send<Result>(
    bearerToken: string,
    method: "GET" | "POST",
    suffix: string,
    schema: z.ZodType<Result>,
    body?: unknown
  ): Promise<Result> {
    const response = await client.request({
      method,
      path: `/v1/project-merges${suffix}`,
      bearerToken,
      ...(body === undefined ? {} : { body })
    });
    if (response.status < 200 || response.status >= 300) {
      const error = z
        .object({ error: z.string(), operation_id: z.string().guid().optional() })
        .safeParse(response.body);
      throw new ProjectMergeApiError(
        response.status,
        error.success ? error.data.error : "unknown_error",
        error.success ? (error.data.operation_id ?? null) : null
      );
    }
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) throw new ProjectMergeApiError(response.status, "invalid_response_shape");
    return parsed.data;
  }
  function validate<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ProjectMergeApiError(400, "invalid_merge_request");
    return parsed.data;
  }
  return {
    async previewProjectMerge(input) {
      const data = validate(auth.extend({ request: ProjectMergeRequestSchema }).strict(), input);
      return send(data.bearerToken, "POST", "/preview", ProjectMergePlanSchema, data.request);
    },
    async applyProjectMerge(input) {
      const data = validate(auth.extend(ProjectMergeApplySchema.shape).strict(), input);
      const { bearerToken, ...body } = data;
      return send(bearerToken, "POST", "", ProjectMergeOperationSchema, body);
    },
    async getProjectMerge(input) {
      const { bearerToken, ...selector } = input;
      validate(auth.strict(), { bearerToken });
      const parsed = validate(ProjectMergeSelectorSchema, selector);
      return send(
        bearerToken,
        "GET",
        "operation_id" in parsed
          ? `/${parsed.operation_id}`
          : `?${new URLSearchParams({ idempotency_key: parsed.idempotency_key })}`,
        ProjectMergeOperationSchema
      );
    },
    async verifyProjectMerge(input) {
      const data = validate(identity, input);
      return send(
        data.bearerToken,
        "GET",
        `/${data.operation_id}/verification`,
        ProjectMergeVerificationSchema
      );
    },
    async resumeProjectMerge(input) {
      const data = validate(identity, input);
      return send(
        data.bearerToken,
        "POST",
        `/${data.operation_id}/resume`,
        ProjectMergeOperationSchema
      );
    },
    async cancelProjectMerge(input) {
      const data = validate(identity, input);
      return send(
        data.bearerToken,
        "POST",
        `/${data.operation_id}/cancel`,
        ProjectMergeOperationSchema
      );
    }
  };
}
