import { mkdir as mkdirFromFs, readFile as readFileFromFs, stat as statFromFs, writeFile as writeFileFromFs } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  BUNDLE_SCHEMA_REFERENCE_FILE_PATH,
  CLI_REFERENCE_FILE_PATH,
  CONNECTION_FILE_PATH,
  EVALS_FILE_PATH,
  GITIGNORE_FILE_PATH,
  IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH,
  MCP_REFERENCE_FILE_PATH,
  PERFORMANCE_ANALYSIS_RECIPE_FILE_PATH,
  PROFILE_ENRICHMENT_REFERENCE_FILE_PATH,
  PROFILE_FILE_PATH,
  SKILL_FILE_PATH,
  buildBundleSchemaReference,
  buildCliReference,
  buildConnectionConfig,
  buildImprovementAnalysisRecipe,
  buildManagedGitignoreSection,
  buildMcpReference,
  buildPerformanceAnalysisRecipe,
  buildProfileEnrichmentReference,
  buildSkill,
  buildSkillEvals
} from "./local-scaffold.js";
import { validateProfile } from "./profile-validation.js";
import type { CliCommandResult } from "./token-commands.js";

type FileReader = (path: string) => Promise<string>;
type FileWriter = (path: string, content: string) => Promise<void>;
type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean }>;

type ValidateCheck = {
  name: string;
  status: "ok" | "warning" | "missing" | "error";
  message: string;
};

type ValidateCommandDependencies = {
  cwd?: () => string;
  mkdir?: DirectoryMaker;
  readFile?: FileReader;
  stat?: StatReader;
  writeFile?: FileWriter;
};

const SUGGESTED_ACTIONS = [
  "Run debugbundle setup if .debugbundle/profile.json is missing.",
  "Run debugbundle profile validate for field-level profile errors.",
  "Run debugbundle validate --fix to recreate missing local DebugBundle stubs when safe."
] as const;

const FIXABLE_FILES = [
  {
    name: "connection-config",
    filePath: CONNECTION_FILE_PATH,
    buildContent: buildConnectionConfig
  },
  {
    name: "agent-skill",
    filePath: SKILL_FILE_PATH,
    buildContent: buildSkill
  },
  {
    name: "cli-reference",
    filePath: CLI_REFERENCE_FILE_PATH,
    buildContent: buildCliReference
  },
  {
    name: "mcp-reference",
    filePath: MCP_REFERENCE_FILE_PATH,
    buildContent: buildMcpReference
  },
  {
    name: "bundle-schema-reference",
    filePath: BUNDLE_SCHEMA_REFERENCE_FILE_PATH,
    buildContent: buildBundleSchemaReference
  },
  {
    name: "profile-enrichment-reference",
    filePath: PROFILE_ENRICHMENT_REFERENCE_FILE_PATH,
    buildContent: buildProfileEnrichmentReference
  },
  {
    name: "improvement-analysis-recipe",
    filePath: IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH,
    buildContent: buildImprovementAnalysisRecipe
  },
  {
    name: "performance-analysis-recipe",
    filePath: PERFORMANCE_ANALYSIS_RECIPE_FILE_PATH,
    buildContent: buildPerformanceAnalysisRecipe
  },
  {
    name: "skill-evals",
    filePath: EVALS_FILE_PATH,
    buildContent: buildSkillEvals
  }
] as const;

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

function resolveOverallStatus(checks: ValidateCheck[]): "healthy" | "warning" | "error" {
  if (checks.some((check) => check.status === "error" || check.status === "missing")) {
    return "error";
  }

  if (checks.some((check) => check.status === "warning")) {
    return "warning";
  }

  return "healthy";
}

function formatValidateOutput(status: "healthy" | "warning" | "error", checks: ValidateCheck[]): string {
  return [
    "DebugBundle validation report.",
    `Status: ${status}`,
    "Checks:",
    ...checks.map((check) => `- ${check.name}: ${check.status} - ${check.message}`),
    "Suggested actions:",
    ...SUGGESTED_ACTIONS.map((action) => `- ${action}`)
  ].join("\n");
}

function buildValidateJsonOutput(
  checks: ValidateCheck[],
  profileErrors: Array<{ path: string; message: string }>,
  autoFixAvailable: boolean
): string {
  return JSON.stringify({
    status: resolveOverallStatus(checks),
    checks,
    warnings: checks.filter((check) => check.status === "warning").map((check) => check.message),
    errors: [
      ...profileErrors.map((error) => `${error.path}: ${error.message}`),
      ...checks
        .filter((check) => check.status === "error" || check.status === "missing")
        .flatMap((check) => check.name === "profile-schema" ? [] : [check.message])
    ],
    suggested_actions: [...SUGGESTED_ACTIONS],
    auto_fix_available: autoFixAvailable
  });
}

async function fixMissingFile(rootDirectory: string, filePath: string, buildContent: () => string, dependencies: { mkdir: DirectoryMaker; writeFile: FileWriter }): Promise<void> {
  const absoluteFilePath = join(rootDirectory, filePath);
  await dependencies.mkdir(dirname(absoluteFilePath), { recursive: true });
  await dependencies.writeFile(absoluteFilePath, buildContent());
}

async function ensureManagedGitignore(rootDirectory: string, input: { fix?: boolean }, dependencies: { readFile: FileReader; writeFile: FileWriter }): Promise<ValidateCheck> {
  const gitignorePath = join(rootDirectory, GITIGNORE_FILE_PATH);
  const managedSection = buildManagedGitignoreSection().trimEnd();

  let existingContents = "";
  try {
    existingContents = await dependencies.readFile(gitignorePath);
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const hasManagedEntries = existingContents.includes(".debugbundle/local/*")
    && existingContents.includes("!.debugbundle/local/connection.json")
    && existingContents.includes(".debugbundle/bundles/");

  if (hasManagedEntries) {
    return {
      name: "gitignore",
      status: "ok",
      message: `Found managed ${GITIGNORE_FILE_PATH} entries`
    };
  }

  if (input.fix === true) {
    const nextContents = existingContents.trimEnd().length > 0
      ? `${existingContents.trimEnd()}\n\n${managedSection}\n`
      : `${managedSection}\n`;
    await dependencies.writeFile(gitignorePath, nextContents);
    return {
      name: "gitignore",
      status: "ok",
      message: `Updated ${GITIGNORE_FILE_PATH}`
    };
  }

  return {
    name: "gitignore",
    status: "missing",
    message: `Missing managed ${GITIGNORE_FILE_PATH} entries`
  };
}

export async function validateCommand(
  input: { fix?: boolean; json?: boolean },
  dependencies: ValidateCommandDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const mkdir = dependencies.mkdir ?? (async (path: string, options: { recursive: true }) => {
    await mkdirFromFs(path, options);
  });
  const readFile = dependencies.readFile ?? ((filePath: string) => readFileFromFs(filePath, "utf8"));
  const stat = dependencies.stat ?? statFromFs;
  const writeFile = dependencies.writeFile ?? (async (filePath: string, content: string) => writeFileFromFs(filePath, content, "utf8"));
  const rootDirectory = cwd();

  const profileValidation = await validateProfile(rootDirectory, { readFile, stat });
  const checks: ValidateCheck[] = [
    profileValidation.valid
      ? {
          name: "profile-schema",
          status: "ok",
          message: `Validated ${PROFILE_FILE_PATH}`
        }
      : {
          name: "profile-schema",
          status: "error",
          message: `Profile validation failed with ${profileValidation.errors.length} errors.`
        }
  ];

  let autoFixAvailable = false;

  for (const fixableFile of FIXABLE_FILES) {
    const absoluteFilePath = join(rootDirectory, fixableFile.filePath);
    if (await pathExists(absoluteFilePath, stat)) {
      checks.push({
        name: fixableFile.name,
        status: "ok",
        message: `Found ${fixableFile.filePath}`
      });
      continue;
    }

    if (input.fix === true) {
      await fixMissingFile(rootDirectory, fixableFile.filePath, fixableFile.buildContent, { mkdir, writeFile });
      checks.push({
        name: fixableFile.name,
        status: "ok",
        message: `Wrote missing ${fixableFile.filePath}`
      });
      continue;
    }

    autoFixAvailable = true;
    checks.push({
      name: fixableFile.name,
      status: "missing",
      message: `Missing ${fixableFile.filePath}`
    });
  }

  const gitignoreCheck = await ensureManagedGitignore(rootDirectory, input, { readFile, writeFile });
  if (gitignoreCheck.status === "missing") {
    autoFixAvailable = true;
  }
  checks.push(gitignoreCheck);

  const status = resolveOverallStatus(checks);
  return {
    exitCode: status === "error" ? 4 : 0,
    output: input.json ? buildValidateJsonOutput(checks, profileValidation.errors, autoFixAvailable) : formatValidateOutput(status, checks)
  };
}