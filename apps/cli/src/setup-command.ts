import { mkdir as mkdirFromFs, readdir as readdirFromFs, readFile as readFileFromFs, rm as rmFromFs, stat as statFromFs, writeFile as writeFileFromFs } from "node:fs/promises";
import { join } from "node:path";

import {
  BUNDLE_SCHEMA_REFERENCE_FILE_PATH,
  CLI_REFERENCE_FILE_PATH,
  CONNECTION_FILE_PATH,
  ENSURED_DIRECTORY_PATHS,
  EVALS_FILE_PATH,
  GENERATED_FILE_PATHS,
  GITIGNORE_FILE_PATH,
  IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH,
  OBSOLETE_GENERATED_SCAFFOLD_PATHS,
  MCP_REFERENCE_FILE_PATH,
  PERFORMANCE_ANALYSIS_RECIPE_FILE_PATH,
  PROFILE_ENRICHMENT_REFERENCE_FILE_PATH,
  PROFILE_FILE_PATH,
  SKILL_DIRECTORY_PATH,
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
import type { CliCommandResult } from "./token-commands.js";

type DirectoryReader = (path: string) => Promise<string[]>;
type FileReader = (path: string) => Promise<string>;
type FileWriter = (path: string, content: string) => Promise<void>;
type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type Remover = (path: string, options: { force: true; recursive: true }) => Promise<void>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean }>;

type SetupCommandDependencies = {
  cwd?: () => string;
  now?: () => Date;
  mkdir?: DirectoryMaker;
  readFile?: FileReader;
  readdir?: DirectoryReader;
  remove?: Remover;
  stat?: StatReader;
  writeFile?: FileWriter;
};

type PackageJsonLike = {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type SetupCheck = {
  name: string;
  status: "ok" | "warning" | "missing" | "error";
  message: string;
};

const MANAGED_AGENTS_START = "<!-- debugbundle:start -->";
const MANAGED_AGENTS_END = "<!-- debugbundle:end -->";
const STATIC_ANALYSIS_WARNING = "Profile generated from static analysis; validate it before relying on framework or ownership details.";

function formatSetupOutput(updatedAgents: boolean, relayRouteMessage?: string): string {
  const lines = [
    "Completed DebugBundle setup.",
    "Created files:",
    ...GENERATED_FILE_PATHS.map((filePath) => `- ${filePath}`),
    "Ensured directories:",
    ...ENSURED_DIRECTORY_PATHS.map((directoryPath) => `- ${directoryPath}`),
    "Updated files:",
    `- ${GITIGNORE_FILE_PATH}`
  ];

  if (updatedAgents) {
    lines.push("- AGENTS.md");
  }

  if (relayRouteMessage !== undefined) {
    lines.push(
      "Scaffolded relay route:",
      `- ${relayRouteMessage}`
    );
  }

  lines.push(
    "Warnings:",
    `- ${STATIC_ANALYSIS_WARNING}`,
    "Next steps:",
    "- Review .debugbundle/profile.json and confirm services, frameworks, and workflows.",
    "- Read .agents/skills/debugbundle/SKILL.md and run the Profile Validation task.",
    "- Run debugbundle process after local events have been captured."
  );

  return lines.join("\n");
}

function buildSetupJsonOutput(checks: SetupCheck[]): string {
  return JSON.stringify({
    status: checks.some((check) => check.status === "error") ? "error" : checks.some((check) => check.status === "warning") ? "warning" : "healthy",
    checks,
    warnings: checks.filter((check) => check.status === "warning").map((check) => check.message),
    errors: checks.filter((check) => check.status === "error").map((check) => check.message),
    suggested_actions: [
      "Review .debugbundle/profile.json and confirm services, frameworks, and workflows.",
      "Read .agents/skills/debugbundle/SKILL.md and run the Profile Validation task.",
      "Run debugbundle process after local events have been captured."
    ],
    auto_fix_available: false
  });
}

function buildManagedAgentsSection(): string {
  return [
    MANAGED_AGENTS_START,
    "## DebugBundle",
    "- Check DebugBundle for existing incidents before investigating bugs.",
    "- Read `.agents/skills/debugbundle/SKILL.md` for the full debugging workflow.",
    "- Use `debugbundle inspect <incident-id>` or MCP `get_bundle` when a user reports an issue.",
    "- Run reproduction artifacts from `.debugbundle/bundles/local/reproductions/` before proposing a fix.",
    "- After a fix is verified, or after an intentional smoke or dogfood incident has served its purpose, resolve it with `debugbundle resolve <incident-id>` or MCP `resolve_incident` so open incidents remain actionable.",
    "- Use `debugbundle doctor` to validate local DebugBundle setup or connectivity issues.",
    MANAGED_AGENTS_END
  ].join("\n");
}

function inferServiceKind(serviceName: string): "frontend" | "backend" | "worker" {
  if (serviceName.includes("worker")) {
    return "worker";
  }

  if (serviceName.includes("web") || serviceName.includes("frontend")) {
    return "frontend";
  }

  return "backend";
}

function inferRuntime(primaryLanguages: string[]): string {
  if (primaryLanguages.includes("TypeScript") || primaryLanguages.includes("JavaScript")) {
    return "Node.js";
  }

  if (primaryLanguages.includes("Python")) {
    return "Python";
  }

  if (primaryLanguages.includes("PHP")) {
    return "PHP";
  }

  return "unknown";
}

function inferFramework(packageJson: PackageJsonLike | null): string {
  const dependencyNames = new Set<string>([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {})
  ]);

  if (dependencyNames.has("next")) {
    return "Next.js";
  }

  if (dependencyNames.has("fastify")) {
    return "Fastify";
  }

  if (dependencyNames.has("express")) {
    return "Express";
  }

  return "unknown";
}

function collectDependencyNames(packageJson: PackageJsonLike | null): Set<string> {
  return new Set<string>([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {})
  ]);
}

function hasRelayScaffoldDependencies(packageJson: PackageJsonLike | null): boolean {
  const dependencyNames = collectDependencyNames(packageJson);
  return dependencyNames.has("@debugbundle/sdk-browser") && dependencyNames.has("@debugbundle/sdk-node");
}

function insertImport(contents: string, importLine: string): string {
  if (contents.includes(importLine)) {
    return contents;
  }

  const lines = contents.split("\n");
  let lastImportIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.startsWith("import ")) {
      lastImportIndex = index;
    }
  }

  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, importLine);
    return lines.join("\n");
  }

  return `${importLine}\n${contents}`;
}

function insertAfterMatch(contents: string, matcher: RegExp, lineToInsert: string): string | null {
  if (contents.includes(lineToInsert)) {
    return contents;
  }

  const lines = contents.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && matcher.test(line)) {
      const indentation = line.match(/^\s*/u)?.[0] ?? "";
      lines.splice(index + 1, 0, `${indentation}${lineToInsert}`);
      return lines.join("\n");
    }
  }

  return null;
}

async function findFirstExistingPath(candidatePaths: string[], stat: StatReader): Promise<string | null> {
  for (const candidatePath of candidatePaths) {
    if (await pathExists(candidatePath, stat)) {
      return candidatePath;
    }
  }

  return null;
}

function detectPackageManagers(rootDirectory: string, packageJson: PackageJsonLike | null, existingPaths: Set<string>): string[] {
  const packageManagers = new Set<string>();
  const declaredPackageManager = typeof packageJson?.packageManager === "string"
    ? packageJson.packageManager.split("@")[0]
    : undefined;

  if (declaredPackageManager === "pnpm") {
    packageManagers.add("pnpm");
  }

  if (declaredPackageManager === "npm") {
    packageManagers.add("npm");
  }

  if (declaredPackageManager === "yarn") {
    packageManagers.add("yarn");
  }

  if (existingPaths.has(join(rootDirectory, "pnpm-lock.yaml")) || existingPaths.has(join(rootDirectory, "pnpm-workspace.yaml"))) {
    packageManagers.add("pnpm");
  }

  if (existingPaths.has(join(rootDirectory, "package-lock.json"))) {
    packageManagers.add("npm");
  }

  if (existingPaths.has(join(rootDirectory, "yarn.lock"))) {
    packageManagers.add("yarn");
  }

  if (existingPaths.has(join(rootDirectory, "poetry.lock")) || existingPaths.has(join(rootDirectory, "pyproject.toml"))) {
    packageManagers.add("poetry");
  }

  if (existingPaths.has(join(rootDirectory, "composer.json"))) {
    packageManagers.add("composer");
  }

  return [...packageManagers].sort();
}

function detectPrimaryLanguages(rootDirectory: string, existingPaths: Set<string>): string[] {
  const languages = new Set<string>();

  if (existingPaths.has(join(rootDirectory, "tsconfig.json")) || existingPaths.has(join(rootDirectory, "tsconfig.base.json"))) {
    languages.add("TypeScript");
  } else if (existingPaths.has(join(rootDirectory, "package.json"))) {
    languages.add("JavaScript");
  }

  if (existingPaths.has(join(rootDirectory, "pyproject.toml"))) {
    languages.add("Python");
  }

  if (existingPaths.has(join(rootDirectory, "composer.json"))) {
    languages.add("PHP");
  }

  return [...languages].sort();
}

function detectDeploymentTargets(rootDirectory: string, existingPaths: Set<string>): string[] {
  const targets = new Set<string>();

  if (existingPaths.has(join(rootDirectory, "docker-compose.yml")) || existingPaths.has(join(rootDirectory, "deploy", "selfhost", "docker-compose.yml"))) {
    targets.add("docker-compose");
  }

  return [...targets].sort();
}

function detectDeveloperWorkflow(packageJson: PackageJsonLike | null, workflowName: "build" | "test" | "lint", existingPaths: Set<string>, rootDirectory: string): string {
  const packageScript = packageJson?.scripts?.[workflowName];
  if (typeof packageScript === "string" && packageScript.length > 0) {
    return packageScript;
  }

  if (existingPaths.has(join(rootDirectory, "Makefile"))) {
    return `make ${workflowName}`;
  }

  return "manual";
}

function detectInstallWorkflow(packageManagers: string[], existingPaths: Set<string>, rootDirectory: string): string {
  if (packageManagers.includes("pnpm")) {
    return "pnpm install";
  }

  if (packageManagers.includes("npm")) {
    return "npm install";
  }

  if (packageManagers.includes("yarn")) {
    return "yarn install";
  }

  if (packageManagers.includes("poetry")) {
    return "poetry install";
  }

  if (packageManagers.includes("composer")) {
    return "composer install";
  }

  if (existingPaths.has(join(rootDirectory, "Makefile"))) {
    return "make install";
  }

  return "manual";
}

async function readJsonFile<T>(filePath: string, readFile: FileReader): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath)) as T;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function pathExists(filePath: string, stat: StatReader): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function detectServices(
  rootDirectory: string,
  readdir: DirectoryReader,
  stat: StatReader,
  packageJson: PackageJsonLike | null,
  primaryLanguages: string[]
): Promise<Array<{ name: string; kind: "frontend" | "backend" | "worker"; runtime: string; framework: string; paths: string[]; owns_routes: string[]; depends_on: string[] }>> {
  const appsDirectory = join(rootDirectory, "apps");
  if (!(await pathExists(appsDirectory, stat))) {
    return [];
  }

  const entries = (await readdir(appsDirectory)).sort();
  const runtime = inferRuntime(primaryLanguages);
  const framework = inferFramework(packageJson);
  const services: Array<{ name: string; kind: "frontend" | "backend" | "worker"; runtime: string; framework: string; paths: string[]; owns_routes: string[]; depends_on: string[] }> = [];

  for (const entry of entries) {
    const entryPath = join(appsDirectory, entry);
    const entryStats = await stat(entryPath);
    if (!entryStats.isDirectory()) {
      continue;
    }

    services.push({
      name: entry,
      kind: inferServiceKind(entry),
      runtime,
      framework,
      paths: [`apps/${entry}`],
      owns_routes: [],
      depends_on: []
    });
  }

  return services;
}

async function detectRootPaths(rootDirectory: string, readdir: DirectoryReader, stat: StatReader): Promise<string[]> {
  const entries = (await readdir(rootDirectory)).sort();
  const rootPaths: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") {
      continue;
    }

    const entryStats = await stat(join(rootDirectory, entry));
    if (entryStats.isDirectory()) {
      rootPaths.push(entry);
    }
  }

  return rootPaths;
}

async function detectInfrastructure(rootDirectory: string, readFile: FileReader): Promise<{ databases: string[]; queues: string[]; object_storage: string[]; external_services: string[] }> {
  const composeContents: string[] = [];

  for (const candidatePath of [
    join(rootDirectory, "docker-compose.yml"),
    join(rootDirectory, "deploy", "selfhost", "docker-compose.yml")
  ]) {
    try {
      composeContents.push(await readFile(candidatePath));
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  const combinedContents = composeContents.join("\n");
  const databases = new Set<string>();
  const queues = new Set<string>();
  const objectStorage = new Set<string>();

  if (/postgres/i.test(combinedContents)) {
    databases.add("PostgreSQL");
  }

  if (/redis/i.test(combinedContents)) {
    queues.add("Redis");
  }

  if (/localstack|s3/i.test(combinedContents)) {
    objectStorage.add("S3-compatible");
  }

  return {
    databases: [...databases].sort(),
    queues: [...queues].sort(),
    object_storage: [...objectStorage].sort(),
    external_services: []
  };
}

async function scaffoldFastifyRelayRoute(
  rootDirectory: string,
  dependencies: { readFile: FileReader; stat: StatReader; writeFile: FileWriter }
): Promise<SetupCheck> {
  const candidatePath = await findFirstExistingPath([
    join(rootDirectory, "src", "server.ts"),
    join(rootDirectory, "src", "main.ts"),
    join(rootDirectory, "apps", "api", "src", "server.ts"),
    join(rootDirectory, "apps", "api", "src", "main.ts")
  ], dependencies.stat);

  if (candidatePath === null) {
    return {
      name: "relay-route",
      status: "warning",
      message: "Detected Fastify plus DebugBundle browser/node SDKs, but no supported Fastify server entry file was found."
    };
  }

  const relativePath = candidatePath.replace(`${rootDirectory}/`, "");
  const originalContents = await dependencies.readFile(candidatePath);
  const withImport = insertImport(originalContents, 'import { debugBundleRelayPlugin } from "@debugbundle/sdk-node/relay/fastify";');
  const withRegistration = insertAfterMatch(withImport, /const\s+app\s*=\s*(?:Fastify|fastify)\(/u, "app.register(debugBundleRelayPlugin);");
  if (withRegistration === null) {
    return {
      name: "relay-route",
      status: "warning",
      message: `Detected Fastify plus DebugBundle browser/node SDKs, but could not place the relay registration in ${relativePath}.`
    };
  }

  if (withRegistration !== originalContents) {
    await dependencies.writeFile(candidatePath, withRegistration);
  }

  return {
    name: "relay-route",
    status: "ok",
    message: `Scaffolded browser relay route in ${relativePath}`
  };
}

async function scaffoldExpressRelayRoute(
  rootDirectory: string,
  dependencies: { readFile: FileReader; stat: StatReader; writeFile: FileWriter }
): Promise<SetupCheck> {
  const candidatePath = await findFirstExistingPath([
    join(rootDirectory, "src", "server.ts"),
    join(rootDirectory, "src", "app.ts"),
    join(rootDirectory, "server.ts"),
    join(rootDirectory, "apps", "api", "src", "server.ts")
  ], dependencies.stat);

  if (candidatePath === null) {
    return {
      name: "relay-route",
      status: "warning",
      message: "Detected Express plus DebugBundle browser/node SDKs, but no supported Express server entry file was found."
    };
  }

  const relativePath = candidatePath.replace(`${rootDirectory}/`, "");
  const originalContents = await dependencies.readFile(candidatePath);
  const withImport = insertImport(originalContents, 'import { debugBundleRelay } from "@debugbundle/sdk-node/relay/express";');
  const withRegistration = insertAfterMatch(withImport, /const\s+app\s*=\s*express\(/u, 'app.use("/debugbundle/browser", debugBundleRelay());');
  if (withRegistration === null) {
    return {
      name: "relay-route",
      status: "warning",
      message: `Detected Express plus DebugBundle browser/node SDKs, but could not place the relay registration in ${relativePath}.`
    };
  }

  if (withRegistration !== originalContents) {
    await dependencies.writeFile(candidatePath, withRegistration);
  }

  return {
    name: "relay-route",
    status: "ok",
    message: `Scaffolded browser relay route in ${relativePath}`
  };
}

async function scaffoldNextJsRelayRoute(
  rootDirectory: string,
  dependencies: { mkdir: DirectoryMaker; stat: StatReader; writeFile: FileWriter }
): Promise<SetupCheck> {
  const candidateAppRoot = await findFirstExistingPath([
    join(rootDirectory, "app"),
    join(rootDirectory, "src", "app"),
    join(rootDirectory, "apps", "web", "app"),
    join(rootDirectory, "apps", "web", "src", "app")
  ], dependencies.stat);

  if (candidateAppRoot === null) {
    return {
      name: "relay-route",
      status: "warning",
      message: "Detected Next.js plus DebugBundle browser/node SDKs, but no supported App Router directory was found."
    };
  }

  const routeDirectory = join(candidateAppRoot, "debugbundle", "browser");
  const routePath = join(routeDirectory, "route.ts");
  await dependencies.mkdir(routeDirectory, { recursive: true });
  await dependencies.writeFile(routePath, 'export { debugBundleRelay as POST } from "@debugbundle/sdk-node/relay/nextjs";\n');

  return {
    name: "relay-route",
    status: "ok",
    message: `Scaffolded browser relay route in ${routePath.replace(`${rootDirectory}/`, "")}`
  };
}

async function scaffoldRelayRoute(
  rootDirectory: string,
  packageJson: PackageJsonLike | null,
  dependencies: {
    mkdir: DirectoryMaker;
    readFile: FileReader;
    stat: StatReader;
    writeFile: FileWriter;
  }
): Promise<SetupCheck | null> {
  if (!hasRelayScaffoldDependencies(packageJson)) {
    return null;
  }

  const framework = inferFramework(packageJson);
  if (framework === "Fastify") {
    return scaffoldFastifyRelayRoute(rootDirectory, dependencies);
  }

  if (framework === "Express") {
    return scaffoldExpressRelayRoute(rootDirectory, dependencies);
  }

  if (framework === "Next.js") {
    return scaffoldNextJsRelayRoute(rootDirectory, dependencies);
  }

  return {
    name: "relay-route",
    status: "warning",
    message: "Detected DebugBundle browser/node SDKs, but no supported backend framework was found for relay scaffolding."
  };
}

async function updateAgentsFile(rootDirectory: string, readFile: FileReader, writeFile: FileWriter): Promise<boolean> {
  const agentsPath = join(rootDirectory, "AGENTS.md");
  let existingContents: string;

  try {
    existingContents = await readFile(agentsPath);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }

  const managedSection = buildManagedAgentsSection();
  const nextContents = existingContents.includes(MANAGED_AGENTS_START)
    ? existingContents.replace(/<!-- debugbundle:start -->[\s\S]*?<!-- debugbundle:end -->/u, managedSection)
    : `${existingContents.trimEnd()}\n\n${managedSection}\n`;

  await writeFile(agentsPath, nextContents);
  return true;
}

async function updateGitignore(rootDirectory: string, readFile: FileReader, writeFile: FileWriter): Promise<void> {
  const gitignorePath = join(rootDirectory, GITIGNORE_FILE_PATH);
  const managedSection = buildManagedGitignoreSection().trimEnd();

  let existingContents = "";
  try {
    existingContents = await readFile(gitignorePath);
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const nextContents = existingContents.includes("# DebugBundle (managed by debugbundle setup)")
    ? existingContents.replace(/# DebugBundle \(managed by debugbundle setup\)[\s\S]*?(?=\n# |$)/u, managedSection)
    : existingContents.trimEnd().length > 0
      ? `${existingContents.trimEnd()}\n\n${managedSection}\n`
      : `${managedSection}\n`;

  await writeFile(gitignorePath, nextContents);
}

async function removeObsoleteGeneratedScaffold(rootDirectory: string, remove: Remover): Promise<void> {
  for (const obsoletePath of OBSOLETE_GENERATED_SCAFFOLD_PATHS) {
    await remove(join(rootDirectory, obsoletePath), { recursive: true, force: true });
  }
}

async function buildProfile(rootDirectory: string, dependencies: Required<Pick<SetupCommandDependencies, "now" | "readFile" | "readdir" | "stat">>): Promise<{
  profile_version: string;
  project: {
    name: string;
    repo_url: string;
    primary_languages: string[];
    package_managers: string[];
    deployment_targets: string[];
  };
  services: Array<{ name: string; kind: "frontend" | "backend" | "worker"; runtime: string; framework: string; paths: string[]; owns_routes: string[]; depends_on: string[] }>;
  infrastructure: {
    databases: string[];
    queues: string[];
    object_storage: string[];
    external_services: string[];
  };
  critical_paths: Array<{ name: string; owner_service: string; notes: string }>;
  repo: {
    root_paths: string[];
    generated_paths: string[];
    do_not_edit_paths: string[];
  };
  developer_workflows: {
    install: string;
    build: string;
    test: string;
    lint: string;
  };
  debugbundle: {
    profile_owner: string;
    last_reviewed_at: string;
    validation_status: "static-analysis-only" | "agent-validated";
    skill_path: string;
    notes: string;
  };
}> {
  const packageJson = await readJsonFile<PackageJsonLike>(join(rootDirectory, "package.json"), dependencies.readFile);
  const existingPaths = new Set<string>([
    join(rootDirectory, "package.json"),
    join(rootDirectory, "pnpm-lock.yaml"),
    join(rootDirectory, "pnpm-workspace.yaml"),
    join(rootDirectory, "package-lock.json"),
    join(rootDirectory, "yarn.lock"),
    join(rootDirectory, "poetry.lock"),
    join(rootDirectory, "pyproject.toml"),
    join(rootDirectory, "composer.json"),
    join(rootDirectory, "docker-compose.yml"),
    join(rootDirectory, "deploy", "selfhost", "docker-compose.yml"),
    join(rootDirectory, "Makefile"),
    join(rootDirectory, "tsconfig.json"),
    join(rootDirectory, "tsconfig.base.json")
  ]);

  const confirmedExistingPaths = new Set<string>();
  for (const candidatePath of existingPaths) {
    if (await pathExists(candidatePath, dependencies.stat)) {
      confirmedExistingPaths.add(candidatePath);
    }
  }

  const primaryLanguages = detectPrimaryLanguages(rootDirectory, confirmedExistingPaths);
  const packageManagers = detectPackageManagers(rootDirectory, packageJson, confirmedExistingPaths);

  return {
    profile_version: "v1",
    project: {
      name: packageJson?.name ?? "unknown-project",
      repo_url: "",
      primary_languages: primaryLanguages,
      package_managers: packageManagers,
      deployment_targets: detectDeploymentTargets(rootDirectory, confirmedExistingPaths)
    },
    services: await detectServices(rootDirectory, dependencies.readdir, dependencies.stat, packageJson, primaryLanguages),
    infrastructure: await detectInfrastructure(rootDirectory, dependencies.readFile),
    critical_paths: [],
    repo: {
      root_paths: await detectRootPaths(rootDirectory, dependencies.readdir, dependencies.stat),
      generated_paths: [".debugbundle", SKILL_DIRECTORY_PATH],
      do_not_edit_paths: [
        ".debugbundle/bundles",
        ".debugbundle/local/events",
        ".debugbundle/local/state.json",
        ".debugbundle/local/browser-relay-spool"
      ]
    },
    developer_workflows: {
      install: detectInstallWorkflow(packageManagers, confirmedExistingPaths, rootDirectory),
      build: detectDeveloperWorkflow(packageJson, "build", confirmedExistingPaths, rootDirectory),
      test: detectDeveloperWorkflow(packageJson, "test", confirmedExistingPaths, rootDirectory),
      lint: detectDeveloperWorkflow(packageJson, "lint", confirmedExistingPaths, rootDirectory)
    },
    debugbundle: {
      profile_owner: "unassigned",
      last_reviewed_at: dependencies.now().toISOString(),
      validation_status: "static-analysis-only",
      skill_path: SKILL_DIRECTORY_PATH,
      notes: "Generated by debugbundle setup. Review and validate this profile before relying on it for architecture decisions."
    }
  };
}

export async function setupCommand(
  input: { json?: boolean; nonInteractive?: boolean },
  dependencies: SetupCommandDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const mkdir = dependencies.mkdir ?? (async (path: string, options: { recursive: true }) => { await mkdirFromFs(path, options); });
  const readFile = dependencies.readFile ?? (async (path: string) => readFileFromFs(path, "utf8"));
  const readdir = dependencies.readdir ?? (async (path: string) => readdirFromFs(path));
  const remove = dependencies.remove ?? (async (path: string, options: { force: true; recursive: true }) => rmFromFs(path, options));
  const stat = dependencies.stat ?? (async (path: string) => statFromFs(path));
  const writeFile = dependencies.writeFile ?? (async (path: string, content: string) => writeFileFromFs(path, content, "utf8"));
  const now = dependencies.now ?? (() => new Date());
  const rootDirectory = cwd();
  const packageJson = await readJsonFile<PackageJsonLike>(join(rootDirectory, "package.json"), readFile);

  try {
    for (const directoryPath of ENSURED_DIRECTORY_PATHS) {
      await mkdir(join(rootDirectory, directoryPath), { recursive: true });
    }

    await removeObsoleteGeneratedScaffold(rootDirectory, remove);

    const profile = await buildProfile(rootDirectory, {
      now,
      readFile,
      readdir,
      stat
    });

    await writeFile(join(rootDirectory, PROFILE_FILE_PATH), `${JSON.stringify(profile, null, 2)}\n`);
    await writeFile(join(rootDirectory, CONNECTION_FILE_PATH), buildConnectionConfig());
    await writeFile(join(rootDirectory, SKILL_FILE_PATH), buildSkill());
    await writeFile(join(rootDirectory, CLI_REFERENCE_FILE_PATH), buildCliReference());
    await writeFile(join(rootDirectory, MCP_REFERENCE_FILE_PATH), buildMcpReference());
    await writeFile(join(rootDirectory, BUNDLE_SCHEMA_REFERENCE_FILE_PATH), buildBundleSchemaReference());
    await writeFile(join(rootDirectory, PROFILE_ENRICHMENT_REFERENCE_FILE_PATH), buildProfileEnrichmentReference());
    await writeFile(join(rootDirectory, IMPROVEMENT_ANALYSIS_RECIPE_FILE_PATH), buildImprovementAnalysisRecipe());
    await writeFile(join(rootDirectory, PERFORMANCE_ANALYSIS_RECIPE_FILE_PATH), buildPerformanceAnalysisRecipe());
    await writeFile(join(rootDirectory, EVALS_FILE_PATH), buildSkillEvals());

    const relayRouteCheck = await scaffoldRelayRoute(rootDirectory, packageJson, {
      mkdir,
      readFile,
      stat,
      writeFile
    });

    await updateGitignore(rootDirectory, readFile, writeFile);
    const updatedAgents = await updateAgentsFile(rootDirectory, readFile, writeFile);

    const checks: SetupCheck[] = [
      {
        name: "profile",
        status: "ok",
        message: `Wrote ${PROFILE_FILE_PATH}`
      },
      {
        name: "connection-config",
        status: "ok",
        message: `Wrote ${CONNECTION_FILE_PATH}`
      },
      {
        name: "agent-skill",
        status: "ok",
        message: `Wrote ${SKILL_FILE_PATH}`
      },
      {
        name: "skill-references",
        status: "ok",
        message: `Wrote ${SKILL_DIRECTORY_PATH}/references/*`
      },
      {
        name: "analysis-recipes",
        status: "ok",
        message: `Wrote ${SKILL_DIRECTORY_PATH}/assets/schemas/*`
      },
      {
        name: "skill-evals",
        status: "ok",
        message: `Wrote ${EVALS_FILE_PATH}`
      },
      {
        name: "gitignore",
        status: "ok",
        message: `Updated ${GITIGNORE_FILE_PATH}`
      },
      ...(relayRouteCheck === null ? [] : [relayRouteCheck]),
      updatedAgents
        ? {
            name: "agents-integration",
            status: "ok",
            message: "Updated AGENTS.md"
          }
        : {
            name: "agents-integration",
            status: "warning",
            message: "AGENTS.md not found; skipped managed DebugBundle section."
          },
      {
        name: "profile-validation",
        status: "warning",
        message: STATIC_ANALYSIS_WARNING
      }
    ];

    return {
      exitCode: 0,
      output: input.json
        ? buildSetupJsonOutput(checks)
        : formatSetupOutput(
            updatedAgents,
            relayRouteCheck?.status === "ok" ? relayRouteCheck.message.replace("Scaffolded browser relay route in ", "") : undefined
          )
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

