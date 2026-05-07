import { readdir as readdirFromFs, readFile as readFileFromFs, stat as statFromFs } from "node:fs/promises";
import { join, relative } from "node:path";

import { z } from "zod";

import { BundleV1Schema, type BundleV1 } from "../../../packages/shared-types/src/index.js";
import {
  IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH,
  PROFILE_FILE_PATH
} from "./local-scaffold.js";
import { validateProfile } from "./profile-validation.js";
import type { CliCommandResult } from "./token-commands.js";

type FileReader = (path: string) => Promise<string>;
type DirectoryReader = (path: string) => Promise<string[]>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean }>;

type AnalyzeCommandDependencies = {
  cwd?: () => string;
  readFile?: FileReader;
  readdir?: DirectoryReader;
  stat?: StatReader;
};

type AnalyzeRecipe = {
  goal: string;
};

const LOCAL_BUNDLE_DIRECTORY_PATH = ".debugbundle/bundles/local";
const SUPPORTED_ANALYSIS_TYPES = ["improvement"] as const;
const SOURCE_FILE_PATTERN = /\.(cjs|cts|js|jsx|mjs|mts|py|ts|tsx)$/u;
const REPO_WALK_IGNORE_NAMES = new Set([".git", ".debugbundle", "coverage", "dist", "node_modules"]);
const MAX_RELEVANT_SOURCE_FILES = 5;
const AnalyzeProfileSchema = z.object({
  services: z.array(
    z.object({
      name: z.string(),
      paths: z.array(z.string())
    })
  ),
  developer_workflows: z.object({
    test: z.string()
  })
}).passthrough();

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function buildErrorResult(
  input: { json?: boolean },
  exitCode: number,
  error: { error: string; message: string; suggested_actions: string[] }
): CliCommandResult {
  return {
    exitCode,
    output: input.json
      ? JSON.stringify(error)
      : [
          error.message,
          "Suggested actions:",
          ...error.suggested_actions.map((action) => `- ${action}`)
        ].join("\n")
  };
}

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

async function loadAnalyzeProfile(rootDirectory: string, dependencies: {
  readFile: FileReader;
  stat: StatReader;
}): Promise<z.infer<typeof AnalyzeProfileSchema>> {
  const validation = await validateProfile(rootDirectory, dependencies);
  if (!validation.valid) {
    throw new Error("invalid_profile");
  }

  return AnalyzeProfileSchema.parse(
    JSON.parse(await dependencies.readFile(join(rootDirectory, PROFILE_FILE_PATH)))
  );
}

async function loadAnalyzeRecipe(rootDirectory: string, readFile: FileReader): Promise<AnalyzeRecipe> {
  const parsed = JSON.parse(await readFile(join(rootDirectory, IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH))) as unknown;
  return z.object({ goal: z.string() }).parse(parsed);
}

async function loadLocalBundles(rootDirectory: string, dependencies: {
  readFile: FileReader;
  readdir: DirectoryReader;
  stat: StatReader;
}): Promise<BundleV1[]> {
  const latestDirectory = join(rootDirectory, LOCAL_BUNDLE_DIRECTORY_PATH);
  if (!(await pathExists(latestDirectory, dependencies.stat))) {
    return [];
  }

  const candidateFiles = (await dependencies.readdir(latestDirectory))
    .filter((entry) => entry.endsWith(".json"))
    .sort();
  const bundles: BundleV1[] = [];

  for (const fileName of candidateFiles) {
    const parsed = BundleV1Schema.safeParse(
      JSON.parse(await dependencies.readFile(join(latestDirectory, fileName)))
    );
    if (parsed.success) {
      bundles.push(parsed.data);
    }
  }

  return bundles.sort((left, right) => {
    if (left.captured_at !== right.captured_at) {
      return right.captured_at.localeCompare(left.captured_at);
    }

    return left.bundle_id.localeCompare(right.bundle_id);
  });
}

async function collectRelevantSourceFiles(
  rootDirectory: string,
  candidatePaths: string[],
  dependencies: { readdir: DirectoryReader; stat: StatReader }
): Promise<string[]> {
  const relevantFiles = new Set<string>();

  async function walk(relativePath: string): Promise<void> {
    if (relevantFiles.size >= MAX_RELEVANT_SOURCE_FILES) {
      return;
    }

    const absolutePath = join(rootDirectory, relativePath);
    if (!(await pathExists(absolutePath, dependencies.stat))) {
      return;
    }

    const entries = (await dependencies.readdir(absolutePath)).sort();
    for (const entry of entries) {
      if (REPO_WALK_IGNORE_NAMES.has(entry)) {
        continue;
      }

      const absoluteEntryPath = join(absolutePath, entry);
      const entryStats = await dependencies.stat(absoluteEntryPath);
      const nextRelativePath = relative(rootDirectory, absoluteEntryPath).replace(/\\/gu, "/");

      if (entryStats.isDirectory()) {
        await walk(nextRelativePath);
      } else if (SOURCE_FILE_PATTERN.test(entry)) {
        relevantFiles.add(nextRelativePath);
      }

      if (relevantFiles.size >= MAX_RELEVANT_SOURCE_FILES) {
        return;
      }
    }
  }

  for (const candidatePath of [...candidatePaths].sort()) {
    await walk(candidatePath);
    if (relevantFiles.size >= MAX_RELEVANT_SOURCE_FILES) {
      break;
    }
  }

  return [...relevantFiles].sort();
}

function buildImprovementBundle(input: {
  sourceBundle: BundleV1;
  bundleCount: number;
  relevantSourceFiles: string[];
  recipe: AnalyzeRecipe;
  testWorkflow: string;
}): BundleV1 {
  const sourceFilesDescription = input.relevantSourceFiles.length > 0
    ? input.relevantSourceFiles.join(", ")
    : "no relevant repository source files were detected";
  const primarySourceFile = input.relevantSourceFiles[0] ?? input.sourceBundle.service.name;

  return BundleV1Schema.parse({
    ...input.sourceBundle,
    bundle_id: `analysis_improvement_${input.sourceBundle.bundle_id}`,
    bundle_type: "improvement",
    sdk: {
      name: "debugbundle-cli",
      version: "0.1.0"
    },
    summary: {
      ...input.sourceBundle.summary,
      title: `Improvement analysis for ${input.sourceBundle.summary.title}`,
      description: `${input.recipe.goal} Reviewed ${input.bundleCount} local ${pluralize(input.bundleCount, "bundle", "bundles")} from ${LOCAL_BUNDLE_DIRECTORY_PATH}. Relevant source files: ${sourceFilesDescription}.`,
      likely_cause: input.sourceBundle.summary.likely_cause ?? `Start with ${primarySourceFile} because it aligns with the failing service path in the local profile.`,
      confidence: Math.max(input.sourceBundle.summary.confidence, 0.68),
      recommended_action: `Apply the narrowest fix in ${primarySourceFile} first, then run ${input.testWorkflow}.`,
      error_type: input.sourceBundle.summary.error_type ?? "local_improvement_analysis"
    },
    links: {
      ...input.sourceBundle.links,
      docs: IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH
    },
    metadata: {
      ...input.sourceBundle.metadata,
      created_at: input.sourceBundle.captured_at,
      updated_at: input.sourceBundle.captured_at,
      generator_version: "cli-analyze-v1",
      generation_number: input.sourceBundle.metadata.generation_number + 1
    }
  });
}

export async function analyzeCommand(
  input: { type?: string; local?: boolean; json?: boolean },
  dependencies: AnalyzeCommandDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const readFile = dependencies.readFile ?? ((filePath: string) => readFileFromFs(filePath, "utf8"));
  const readdir = dependencies.readdir ?? ((directoryPath: string) => readdirFromFs(directoryPath));
  const stat = dependencies.stat ?? statFromFs;
  const analysisType = input.type ?? "improvement";

  if (!SUPPORTED_ANALYSIS_TYPES.includes(analysisType as (typeof SUPPORTED_ANALYSIS_TYPES)[number])) {
    return buildErrorResult(input, 4, {
      error: "unsupported_analysis_type",
      message: `Unsupported analysis type \"${analysisType}\". Local analysis currently supports improvement only.`,
      suggested_actions: [
        "Run debugbundle analyze --type improvement --local for deterministic local analysis.",
          "Use the generated scaffold recipes under .agents/skills/debugbundle/assets/schemas/ as the current local analysis contract."
      ]
    });
  }

  try {
    const rootDirectory = cwd();
    const profile = await loadAnalyzeProfile(rootDirectory, { readFile, stat });
    const recipe = await loadAnalyzeRecipe(rootDirectory, readFile);
    const localBundles = await loadLocalBundles(rootDirectory, { readFile, readdir, stat });

    if (localBundles.length === 0) {
      return buildErrorResult(input, 3, {
        error: "local_bundle_not_found",
        message: "No local bundle artifacts were found under .debugbundle/bundles/local.",
        suggested_actions: [
          "Fetch or generate a local DebugBundle bundle before running debugbundle analyze.",
          "Run debugbundle setup if the local .debugbundle scaffold is missing."
        ]
      });
    }

    const sourceBundle = localBundles[0];
    if (sourceBundle === undefined) {
      return buildErrorResult(input, 3, {
        error: "local_bundle_not_found",
        message: "No local bundle artifacts were found under .debugbundle/bundles/local.",
        suggested_actions: [
          "Fetch or generate a local DebugBundle bundle before running debugbundle analyze.",
          "Run debugbundle setup if the local .debugbundle scaffold is missing."
        ]
      });
    }

    const relevantSourceFiles = await collectRelevantSourceFiles(
      rootDirectory,
      profile.services.flatMap((service) => service.paths),
      { readdir, stat }
    );
    const analysisBundle = buildImprovementBundle({
      sourceBundle,
      bundleCount: localBundles.length,
      relevantSourceFiles,
      recipe,
      testWorkflow: profile.developer_workflows.test
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(analysisBundle) : `${JSON.stringify(analysisBundle, null, 2)}\n`
    };
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_profile") {
      return buildErrorResult(input, 4, {
        error: "invalid_profile",
        message: `Invalid ${PROFILE_FILE_PATH}.`,
        suggested_actions: [
          "Run debugbundle profile validate to inspect field-level profile errors.",
          "Run debugbundle validate --fix to restore any missing local DebugBundle stubs."
        ]
      });
    }

    throw error;
  }
}