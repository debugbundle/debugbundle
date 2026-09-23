import { manageAgentSetup, projectRoot, readManaged, safePath, writeManaged, ensureGitignore } from "../../../packages/agent-setup/src/index.js";
import { agentChecks, appendAgentReport, localScaffoldFailure, buildManagedAgentsSection, legacyHashes, canonicalFiles } from "./agent-setup.js";
import { mkdir as mkdirFromFs, stat as statFromFs } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

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
  "Run debugbundle validate --fix to recreate missing or stale local DebugBundle stubs when safe."
] as const;

const FIXABLE_FILES = [
  {
    name: "connection-config",
    filePath: CONNECTION_FILE_PATH,
    buildContent: buildConnectionConfig,
    checkContent: false
  },
  {
    name: "agent-skill",
    filePath: SKILL_FILE_PATH,
    buildContent: buildSkill,
    checkContent: true
  },
  {
    name: "cli-reference",
    filePath: CLI_REFERENCE_FILE_PATH,
    buildContent: buildCliReference,
    checkContent: true
  },
  {
    name: "mcp-reference",
    filePath: MCP_REFERENCE_FILE_PATH,
    buildContent: buildMcpReference,
    checkContent: true
  },
  {
    name: "bundle-schema-reference",
    filePath: BUNDLE_SCHEMA_REFERENCE_FILE_PATH,
    buildContent: buildBundleSchemaReference,
    checkContent: true
  },
  {
    name: "profile-enrichment-reference",
    filePath: PROFILE_ENRICHMENT_REFERENCE_FILE_PATH,
    buildContent: buildProfileEnrichmentReference,
    checkContent: true
  },
  {
    name: "improvement-analysis-recipe",
    filePath: IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH,
    buildContent: buildImprovementAnalysisRecipe,
    checkContent: true
  },
  {
    name: "performance-analysis-recipe",
    filePath: PERFORMANCE_ANALYSIS_RECIPE_FILE_PATH,
    buildContent: buildPerformanceAnalysisRecipe,
    checkContent: true
  },
  {
    name: "skill-evals",
    filePath: EVALS_FILE_PATH,
    buildContent: buildSkillEvals,
    checkContent: true
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

async function fixMissingFile(rootDirectory: string, filePath: string, buildContent: () => string, dependencies: { mkdir: DirectoryMaker; writeFile?: FileWriter }): Promise<void> {
  const absoluteFilePath = join(rootDirectory, filePath);
  await dependencies.mkdir(dirname(absoluteFilePath), { recursive: true });
  if (dependencies.writeFile) await dependencies.writeFile(absoluteFilePath, buildContent());
  else await writeManaged(rootDirectory, filePath, buildContent(), undefined);
}

async function runValidateCommand(
  input: { fix?: boolean; json?: boolean },
  dependencies: ValidateCommandDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const mkdir = dependencies.mkdir ?? (async (path: string, options: { recursive: true }) => {
    await mkdirFromFs(path, options);
  });
  const readFile = dependencies.readFile ?? (async (filePath: string) => {
    const content = await readManaged(rootDirectory, relative(rootDirectory, filePath));
    if (content === undefined) throw Object.assign(new Error("Missing local scaffold file."), { code: "ENOENT" });
    return content;
  });
  const stat = dependencies.stat ?? statFromFs;
  const rootDirectory = await projectRoot(cwd());
  for (const file of [PROFILE_FILE_PATH, CONNECTION_FILE_PATH, GITIGNORE_FILE_PATH]) await safePath(rootDirectory, file);

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

  const before = await manageAgentSetup({ root: rootDirectory, files: canonicalFiles(), legacyHashes, instruction: buildManagedAgentsSection() });
  const report = input.fix ? await manageAgentSetup({ root: rootDirectory, files: canonicalFiles(), legacyHashes, instruction: buildManagedAgentsSection(), fix: true }) : before;
  for (const fixableFile of FIXABLE_FILES) {
    if (fixableFile.checkContent) {
      const file = report.canonical.find(file => file.path === fixableFile.filePath)!;
      const previous = before.canonical.find(file => file.path === fixableFile.filePath)!;
      const status = file.status === "ok" ? "ok" : file.status === "stale" ? "warning" : file.status === "missing" ? "missing" : "error";
      autoFixAvailable ||= file.status === "missing" || file.status === "stale";
      checks.push({ name: fixableFile.name, status, message: file.status === "ok"
        ? previous.status === "missing" ? `Wrote missing ${file.path}` : previous.status === "stale" ? `Updated stale ${file.path}` : `Found ${file.path}`
        : file.status === "missing" ? `Missing ${file.path}` : file.status === "stale" ? `Stale ${file.path}; run debugbundle validate --fix to refresh it.` : file.message });
      continue;
    }
    if (await pathExists(join(rootDirectory, fixableFile.filePath), stat)) {
      checks.push({ name: fixableFile.name, status: "ok", message: `Found ${fixableFile.filePath}` });
    } else if (input.fix) {
      await fixMissingFile(rootDirectory, fixableFile.filePath, fixableFile.buildContent, { mkdir, ...(dependencies.writeFile ? { writeFile: dependencies.writeFile } : {}) });
      checks.push({ name: fixableFile.name, status: "ok", message: `Wrote missing ${fixableFile.filePath}` });
    } else {
      autoFixAvailable = true;
      checks.push({ name: fixableFile.name, status: "missing", message: `Missing ${fixableFile.filePath}` });
    }
  }
  checks.push(...agentChecks(report).filter(check => check.name !== "canonical-skill"));
  autoFixAvailable ||= report.agents.some(agent => [agent.instruction, agent.discovery].some(state => state === "missing" || state === "stale"));

  const ignore = await ensureGitignore(rootDirectory, buildManagedGitignoreSection(), input.fix === true);
  const gitignoreCheck: ValidateCheck = { name: "gitignore", status: ignore.present ? "ok" : "missing", message: ignore.changed ? `Updated ${GITIGNORE_FILE_PATH}` : `${ignore.present ? "Found" : "Missing"} managed ${GITIGNORE_FILE_PATH} entries` };
  if (gitignoreCheck.status === "missing") {
    autoFixAvailable = true;
  }
  checks.push(gitignoreCheck);

  const status = resolveOverallStatus(checks);
  return {
    exitCode: status === "error" ? 4 : 0,
    output: appendAgentReport(input.json ? buildValidateJsonOutput(checks, profileValidation.errors, autoFixAvailable) : formatValidateOutput(status, checks), report, input.json === true)
  };
}
export async function validateCommand(input: { fix?: boolean; json?: boolean }, dependencies: ValidateCommandDependencies = {}): Promise<CliCommandResult> {
  try { return await runValidateCommand(input, dependencies); }
  catch (error) { return localScaffoldFailure(error, input.json); }
}
