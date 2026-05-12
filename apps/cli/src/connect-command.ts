import { readFile as readFileFromFs, stat as statFromFs, writeFile as writeFileFromFs } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  createProjectManagementApi,
  ProjectManagementApiError,
  type HttpClient as ProjectManagementHttpClient
} from "../../../packages/project-management-client/src/index.js";
import { createTokenManagementApi, TokenManagementApiError, type HttpClient as TokenManagementHttpClient } from "../../../packages/token-management/src/index.js";
import { CliAuthStateError, readCliAuthState, type CliAuthState } from "./auth-state.js";
import { createCliHttpClient } from "./auth-context.js";
import { readConnectionConfig, type ConnectionConfig } from "./connection-config.js";
import { isInteractiveTerminal } from "./interactive-auth.js";
import { loginCommand as defaultLoginCommand } from "./login-command.js";
import { CONNECTION_FILE_PATH, PROFILE_FILE_PATH } from "./local-scaffold.js";
import { validateProfile } from "./profile-validation.js";
import type { CliCommandResult } from "./token-commands.js";

type FileReader = (path: string) => Promise<string>;
type FileWriter = (path: string, content: string, encoding: "utf8") => Promise<void>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean }>;

type ConnectCheck = {
  name: string;
  status: "ok" | "warning" | "missing" | "error";
  message: string;
};

type ProjectRecord = {
  project_id: string;
  name: string;
  slug: string;
};

type ConnectCommandDependencies = {
  cwd?: () => string;
  readFile?: FileReader;
  stat?: StatReader;
  writeFile?: FileWriter;
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  createHttpClient?: (input: { baseUrl: string }) => ProjectManagementHttpClient & TokenManagementHttpClient;
  createProjectManagementApi?: typeof createProjectManagementApi;
  createTokenManagementApi?: typeof createTokenManagementApi;
  fetchImpl?: typeof fetch;
  isInteractiveTerminal?: () => boolean;
  loginCommand?: typeof defaultLoginCommand;
};

const ProfileNameSchema = z
  .object({
    project: z.object({
      name: z.string().min(1)
    })
  })
  .passthrough();

function formatConnectOutput(input: { project: ProjectRecord; projectTokenPlaintext: string; createdProject: boolean }): string {
  return [
    "Connected DebugBundle project to cloud.",
    `${input.createdProject ? "Created" : "Selected"} cloud project: ${input.project.name} (${input.project.project_id})`,
    `Updated ${CONNECTION_FILE_PATH} with production cloud delivery defaults.`,
    "Local investigation artifacts remain available under .debugbundle/local/.",
    "Project token:",
    input.projectTokenPlaintext,
    "Next steps:",
    `- Set DEBUGBUNDLE_PROJECT_TOKEN=${input.projectTokenPlaintext} in your production environment.`,
    "- Redeploy connected environments after updating their DebugBundle configuration.",
    "- Use debugbundle incidents --source cloud after deployment to confirm hosted ingestion."
  ].join("\n");
}

function buildConnectJsonOutput(checks: ConnectCheck[], suggestedActions: string[]): string {
  return JSON.stringify({
    status: checks.some((check) => check.status === "error")
      ? "error"
      : checks.some((check) => check.status === "warning")
        ? "warning"
        : "healthy",
    checks,
    warnings: checks.filter((check) => check.status === "warning").map((check) => check.message),
    errors: checks.filter((check) => check.status === "error" || check.status === "missing").map((check) => check.message),
    suggested_actions: suggestedActions,
    auto_fix_available: false
  });
}

function slugifyProjectName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function mapErrorToExitCode(error: unknown): number {
  if (error instanceof CliAuthStateError) {
    return 2;
  }

  if (error instanceof ProjectManagementApiError || error instanceof TokenManagementApiError) {
    if (error.status === 400) {
      return 4;
    }
    if (error.status === 401 || error.status === 403) {
      return 2;
    }
    if (error.status === 404) {
      return 3;
    }
  }

  return 1;
}

function buildUpdatedConnectionConfig(projectId: string, baseUrl: string): ConnectionConfig {
  return {
    mode: "connected",
    cloud_project_id: projectId,
    cloud_base_url: baseUrl,
    environments: {
      local: { delivery: "local-only" },
      development: { delivery: "local-only" },
      staging: { delivery: "local-only" },
      production: { delivery: "cloud-enabled" }
    }
  };
}

async function readValidatedProfileName(rootDirectory: string, dependencies: { readFile: FileReader; stat: StatReader }): Promise<{ ok: true; name: string } | { ok: false; errors: string[] }> {
  const validation = await validateProfile(rootDirectory, dependencies);
  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors.map((error) => `${error.path}: ${error.message}`)
    };
  }

  const parsed = ProfileNameSchema.safeParse(JSON.parse(await dependencies.readFile(join(rootDirectory, PROFILE_FILE_PATH))));
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${PROFILE_FILE_PATH}.${issue.path.join(".")}: ${issue.message}`)
    };
  }

  return { ok: true, name: parsed.data.project.name };
}

function buildValidationFailureResult(input: { json?: boolean; checks: ConnectCheck[]; errors: string[] }): CliCommandResult {
  const checks = [...input.checks, ...input.errors.map((message) => ({ name: "profile", status: "error" as const, message }))];
  return {
    exitCode: 4,
    output: input.json
      ? buildConnectJsonOutput(checks, ["Run debugbundle setup if the local scaffold is missing or invalid."])
      : ["DebugBundle connect failed.", ...input.errors.map((message) => `- ${message}`)].join("\n")
  };
}

export async function connectCommand(
  input: { authFilePath?: string; json?: boolean },
  dependencies: ConnectCommandDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const readFile = dependencies.readFile ?? ((path: string) => readFileFromFs(path, "utf8"));
  const stat = dependencies.stat ?? statFromFs;
  const writeFile = dependencies.writeFile ?? writeFileFromFs;
  const readAuthState = dependencies.readAuthState ?? ((authInput: { authFilePath?: string }) => readCliAuthState(authInput));
  const createHttpClient = dependencies.createHttpClient ?? ((clientInput: { baseUrl: string }) => {
    const httpClientDependencies: { fetchImpl?: typeof fetch } = {};
    if (dependencies.fetchImpl !== undefined) {
      httpClientDependencies.fetchImpl = dependencies.fetchImpl;
    }

    return createCliHttpClient(clientInput, httpClientDependencies);
  });
  const createProjectApi = dependencies.createProjectManagementApi ?? createProjectManagementApi;
  const createTokenApi = dependencies.createTokenManagementApi ?? createTokenManagementApi;
  const loginCommand = dependencies.loginCommand ?? defaultLoginCommand;
  const rootDirectory = cwd();

  const initialChecks: ConnectCheck[] = [];
  const profileValidation = await readValidatedProfileName(rootDirectory, { readFile, stat });
  if (!profileValidation.ok) {
    const validationFailureInput: { json?: boolean; checks: ConnectCheck[]; errors: string[] } = {
      checks: initialChecks,
      errors: profileValidation.errors
    };
    if (input.json !== undefined) {
      validationFailureInput.json = input.json;
    }

    return buildValidationFailureResult(validationFailureInput);
  }

  initialChecks.push({
    name: "profile",
    status: "ok",
    message: `Validated ${PROFILE_FILE_PATH}`
  });

  let connectionConfig: ConnectionConfig;
  try {
    connectionConfig = await readConnectionConfig(rootDirectory, readFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 4,
      output: input.json
        ? buildConnectJsonOutput([
            ...initialChecks,
            {
              name: "connection-config",
              status: "error",
              message
            }
          ], ["Run debugbundle validate --fix if the local connection config is missing."])
        : `DebugBundle connect failed.\n- ${message}`
    };
  }

  if (connectionConfig.mode === "connected" && connectionConfig.cloud_project_id !== null) {
    const checks: ConnectCheck[] = [
      ...initialChecks,
      {
        name: "connection-config",
        status: "ok",
        message: `Project is already connected to ${connectionConfig.cloud_project_id}.`
      }
    ];
    return {
      exitCode: 0,
      output: input.json
        ? buildConnectJsonOutput(checks, ["Use debugbundle incidents --source cloud to inspect hosted incidents."])
        : `Project is already connected to cloud project ${connectionConfig.cloud_project_id}.`
    };
  }

  initialChecks.push({
    name: "connection-config",
    status: "ok",
    message: `Found ${CONNECTION_FILE_PATH}`
  });

  try {
    let authState: CliAuthState;
    try {
      authState = await readAuthState({ ...(input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }) });
    } catch (error) {
      const shouldAttemptInteractiveLogin =
        error instanceof CliAuthStateError &&
        error.code === "auth_state_missing" &&
        input.json !== true &&
        (dependencies.isInteractiveTerminal ?? isInteractiveTerminal)();

      if (!shouldAttemptInteractiveLogin) {
        throw error;
      }

      const loginResult = await loginCommand({
        ...(input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath })
      });
      if (loginResult.exitCode !== 0) {
        return loginResult;
      }

      authState = await readAuthState({ ...(input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }) });
    }

    const httpClient = createHttpClient({ baseUrl: authState.base_url });
    const projectApi = createProjectApi(httpClient);
    const tokenApi = createTokenApi(httpClient);
    const projectSlug = slugifyProjectName(profileValidation.name);

    if (projectSlug.length === 0) {
      const validationFailureInput: { json?: boolean; checks: ConnectCheck[]; errors: string[] } = {
        checks: initialChecks,
        errors: ["Cannot derive a cloud project slug from .debugbundle/profile.json project.name."]
      };
      if (input.json !== undefined) {
        validationFailureInput.json = input.json;
      }

      return buildValidationFailureResult(validationFailureInput);
    }

    const existingProjects = await projectApi.listProjects({
      bearerToken: authState.bearer_token,
      limit: 100
    });

    const matchingProject = existingProjects.find((project) => project.slug === projectSlug);
    const project = matchingProject ?? await projectApi.createProject({
      bearerToken: authState.bearer_token,
      name: profileValidation.name,
      slug: projectSlug,
      environmentDefault: "production"
    });

    const token = await tokenApi.createProjectToken({
      bearerToken: authState.bearer_token,
      projectId: project.project_id,
      label: "debugbundle-connect"
    });

    const plaintext = token.plaintext;
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      return {
        exitCode: 1,
        output: input.json
          ? buildConnectJsonOutput([
              ...initialChecks,
              {
                name: "project-token",
                status: "error",
                message: "Project token creation did not return plaintext credentials."
              }
            ], ["Retry debugbundle connect after confirming token creation permissions."])
          : "DebugBundle connect failed.\n- Project token creation did not return plaintext credentials."
      };
    }

    await writeFile(
      join(rootDirectory, CONNECTION_FILE_PATH),
      `${JSON.stringify(buildUpdatedConnectionConfig(project.project_id, authState.base_url), null, 2)}\n`,
      "utf8"
    );

    const checks: ConnectCheck[] = [
      ...initialChecks,
      {
        name: "cloud-project",
        status: "ok",
        message: `${matchingProject === undefined ? "Created" : "Selected"} cloud project ${project.project_id} (${project.slug}).`
      },
      {
        name: "project-token",
        status: "ok",
        message: `Created project token ${token.token_id} (plaintext: ${plaintext}).`
      },
      {
        name: "delivery-policy",
        status: "ok",
        message: `Updated ${CONNECTION_FILE_PATH} for connected mode with production cloud delivery and staging left local-only.`
      },
      {
        name: "local-artifacts",
        status: "ok",
        message: "Local investigation artifacts remain available under .debugbundle/local/."
      }
    ];

    const suggestedActions = [
      `Set DEBUGBUNDLE_PROJECT_TOKEN=${plaintext} in your production environment.`,
      "Redeploy connected environments after updating their DebugBundle configuration.",
      "Use debugbundle incidents --source cloud after deployment to confirm hosted ingestion."
    ];

    return {
      exitCode: 0,
      output: input.json
        ? buildConnectJsonOutput(checks, suggestedActions)
        : formatConnectOutput({
            project: {
              project_id: project.project_id,
              name: project.name,
              slug: project.slug
            },
            projectTokenPlaintext: plaintext,
            createdProject: matchingProject === undefined
          })
    };
  } catch (error) {
    const exitCode = mapErrorToExitCode(error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode,
      output: input.json
        ? buildConnectJsonOutput([
            ...initialChecks,
            {
              name: "cloud-connection",
              status: "error",
              message
            }
          ], [
            exitCode === 2
              ? "Run debugbundle login to choose an auth flow, or use debugbundle login --github, debugbundle login --github-device, or debugbundle login <dbundle_mem_...> before connecting the project to cloud."
              : "Resolve the cloud API error and retry debugbundle connect."
          ])
        : `DebugBundle connect failed.\n- ${message}`
    };
  }
}
