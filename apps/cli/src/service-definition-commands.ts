import { z } from "zod";
import {
  ServiceDefinitionCreateSchema,
  ServiceDefinitionUpdateSchema,
  type ServiceDefinitionCreate,
  type ServiceDefinitionUpdate
} from "../../../packages/shared-types/src/project-services.js";
import { createProjectServicesApi } from "../../../packages/project-management-client/src/project-services.js";
import {
  ProjectManagementApiError,
  type HttpClient
} from "../../../packages/project-management-client/src/index.js";
import { createCliHttpClient } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult } from "./token-commands.js";

type Scope = { projectId: string; authFilePath?: string; json?: boolean };
export type ServiceDefinitionCommandInput = Scope &
  (
    | { action: "list"; limit?: number | undefined; cursor?: string | undefined }
    | { action: "get"; serviceDefinitionId: string }
    | { action: "create"; service: ServiceDefinitionCreate }
    | { action: "update"; serviceDefinitionId: string; update: ServiceDefinitionUpdate }
  );
export async function serviceDefinitionWithAuthCommand(
  input: ServiceDefinitionCommandInput,
  dependencies: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => HttpClient;
  } = {}
): Promise<CliCommandResult> {
  try {
    const auth = await (dependencies.readAuthState ?? readCliAuthState)(
      input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }
    );
    const api = createProjectServicesApi(
      (dependencies.createHttpClient ?? createCliHttpClient)({ baseUrl: auth.base_url })
    );
    const scope = { bearerToken: auth.bearer_token, projectId: input.projectId };
    const response =
      input.action === "list"
        ? await api.listServiceDefinitions({
            ...scope,
            ...(input.limit === undefined ? {} : { limit: input.limit }),
            ...(input.cursor === undefined ? {} : { cursor: input.cursor })
          })
        : {
            service:
              input.action === "get"
                ? await api.getServiceDefinition({
                    ...scope,
                    serviceDefinitionId: input.serviceDefinitionId
                  })
                : input.action === "create"
                  ? await api.createServiceDefinition({ ...scope, service: input.service })
                  : await api.updateServiceDefinition({
                      ...scope,
                      serviceDefinitionId: input.serviceDefinitionId,
                      update: input.update
                    })
          };
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify(response)
        : "services" in response
          ? [
              ...response.services.map(
                (s) =>
                  `${s.service_definition_id} ${s.name} (${s.environments.join(", ") || "no environments yet"})`
              ),
              ...(response.next_cursor === null ? [] : [`Next cursor: ${response.next_cursor}`])
            ].join("\n") || "No services found."
          : `${response.service.service_definition_id} ${response.service.name}`
    };
  } catch (error) {
    return {
      exitCode:
        error instanceof ProjectManagementApiError
          ? error.status === 401
            ? 2
            : error.status === 404
              ? 3
              : error.status === 400
                ? 4
                : 1
          : 2,
      output:
        error instanceof ProjectManagementApiError
          ? error.message
          : "Could not load authentication or complete the service command."
    };
  }
}

export async function handleServiceDefinitionCommand(
  argv: ParsedArgv,
  run = serviceDefinitionWithAuthCommand
): Promise<CliCommandResult> {
  const action = requirePositional(argv, 1, "service action");
  if (!["list", "get", "create", "update"].includes(action))
    throw new CliInputError("Use services list, get, create, or update.");
  const write = action === "create" || action === "update";
  expectNoUnknownOptions(argv, [
    "project-id",
    "auth-file",
    "json",
    ...(action === "list" ? ["limit", "cursor"] : []),
    ...(write
      ? [
          "name",
          "description",
          "repository-url",
          "repository-root",
          "clear-description",
          "clear-repository"
        ]
      : [])
  ]);
  ensureNoExtraPositionals(argv, action === "get" || action === "update" ? 3 : 2);
  const projectId = readStringOption(argv, "project-id");
  if (!z.string().guid().safeParse(projectId).success)
    throw new CliInputError("A valid --project-id is required.");
  const scope = appendCommonAuthOptions(argv, { projectId: projectId! });
  if (action === "list") {
    const rawLimit = readStringOption(argv, "limit");
    const cursor = readStringOption(argv, "cursor");
    const parsed = z
      .object({
        limit: z.number().int().min(1).max(200).optional(),
        cursor: z.string().guid().optional()
      })
      .safeParse({
        ...(rawLimit === undefined ? {} : { limit: Number(rawLimit) }),
        ...(cursor === undefined ? {} : { cursor })
      });
    if (!parsed.success) throw new CliInputError("Invalid service pagination.");
    return run({ ...scope, action, ...parsed.data });
  }
  const serviceDefinitionId =
    action === "get" || action === "update"
      ? requirePositional(argv, 2, "service-definition-id")
      : undefined;
  if (
    serviceDefinitionId !== undefined &&
    !z.string().guid().safeParse(serviceDefinitionId).success
  )
    throw new CliInputError("Invalid service-definition-id.");
  if (action === "get") return run({ ...scope, action, serviceDefinitionId: serviceDefinitionId! });
  const data: Record<string, unknown> = {};
  for (const [option, field] of [
    ["name", "name"],
    ["description", "description"],
    ["repository-url", "repository_url"],
    ["repository-root", "repository_root"]
  ]) {
    const value = readStringOption(argv, option!);
    if (value !== undefined) data[field!] = value;
  }
  if (readBooleanOption(argv, "clear-repository")) {
    if (data["repository_url"] !== undefined || data["repository_root"] !== undefined)
      throw new CliInputError("Use repository values or --clear-repository.");
    data["repository_url"] = null;
    data["repository_root"] = null;
  }
  if (readBooleanOption(argv, "clear-description")) {
    if (data["description"] !== undefined)
      throw new CliInputError("Use --description or --clear-description.");
    data["description"] = null;
  }
  if (action === "create") {
    const parsed = ServiceDefinitionCreateSchema.safeParse(data);
    if (!parsed.success)
      throw new CliInputError(
        "Invalid service metadata; provide --name and safe repository context."
      );
    return run({ ...scope, action, service: parsed.data });
  }
  const parsed = ServiceDefinitionUpdateSchema.safeParse(data);
  if (!parsed.success) throw new CliInputError("Provide valid service metadata to update.");
  return run({
    ...scope,
    action: "update",
    serviceDefinitionId: serviceDefinitionId!,
    update: parsed.data
  });
}
