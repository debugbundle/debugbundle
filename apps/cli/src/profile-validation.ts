import { readFile as readFileFromFs, stat as statFromFs } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { PROFILE_FILE_PATH } from "./local-scaffold.js";

type FileReader = (path: string) => Promise<string>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean }>;

export type ProfileValidationError = {
  path: string;
  message: string;
};

type ValidateProfileDependencies = {
  readFile?: FileReader;
  stat?: StatReader;
};

const ServiceSchema = z.object({
  name: z.string(),
  kind: z.enum(["frontend", "backend", "worker"]),
  runtime: z.string(),
  framework: z.string(),
  paths: z.array(z.string()),
  owns_routes: z.array(z.string()),
  depends_on: z.array(z.string())
});

export const ProfileSchema = z.object({
  profile_version: z.literal("v1"),
  project: z.object({
    name: z.string(),
    repo_url: z.string(),
    primary_languages: z.array(z.string()),
    package_managers: z.array(z.string()),
    deployment_targets: z.array(z.string())
  }),
  services: z.array(ServiceSchema),
  infrastructure: z.object({
    databases: z.array(z.string()),
    queues: z.array(z.string()),
    object_storage: z.array(z.string()),
    external_services: z.array(z.string())
  }),
  critical_paths: z.array(z.object({
    name: z.string(),
    owner_service: z.string(),
    notes: z.string()
  })),
  repo: z.object({
    root_paths: z.array(z.string()),
    generated_paths: z.array(z.string()),
    do_not_edit_paths: z.array(z.string())
  }),
  developer_workflows: z.object({
    install: z.string(),
    build: z.string(),
    test: z.string(),
    lint: z.string()
  }),
  debugbundle: z.object({
    profile_owner: z.string(),
    last_reviewed_at: z.string().datetime({ offset: true }),
    validation_status: z.enum(["static-analysis-only", "agent-validated"]),
    skill_path: z.string(),
    notes: z.string()
  })
});

async function pathExists(path: string, stat: StatReader): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function formatZodErrors(error: z.ZodError): ProfileValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}

export async function validateProfile(
  rootDirectory: string,
  dependencies: ValidateProfileDependencies = {}
): Promise<{
  valid: boolean;
  errors: ProfileValidationError[];
}> {
  const readFile = dependencies.readFile ?? ((filePath: string) => readFileFromFs(filePath, "utf8"));
  const stat = dependencies.stat ?? statFromFs;
  const profilePath = join(rootDirectory, PROFILE_FILE_PATH);

  if (!(await pathExists(profilePath, stat))) {
    return {
      valid: false,
      errors: [
        {
          path: PROFILE_FILE_PATH,
          message: `Missing ${PROFILE_FILE_PATH}`
        }
      ]
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await readFile(profilePath));
  } catch {
    return {
      valid: false,
      errors: [
        {
          path: PROFILE_FILE_PATH,
          message: `Invalid ${PROFILE_FILE_PATH}`
        }
      ]
    };
  }

  const parsedProfile = ProfileSchema.safeParse(parsedJson);
  if (!parsedProfile.success) {
    return {
      valid: false,
      errors: formatZodErrors(parsedProfile.error)
    };
  }

  return {
    valid: true,
    errors: []
  };
}