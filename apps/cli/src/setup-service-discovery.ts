import { basename, join } from "node:path";

export type PackageJsonLike = {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type DetectedService = {
  name: string;
  kind: "frontend" | "backend" | "worker";
  runtime: string;
  framework: string;
  paths: string[];
  owns_routes: string[];
  depends_on: string[];
};

type DirectoryReader = (path: string) => Promise<string[]>;
type FileReader = (path: string) => Promise<string>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean }>;

const IGNORED_ROOT_DIRECTORIES = new Set<string>([
  "apps",
  "contracts",
  "coverage",
  "deploy",
  "examples",
  "node_modules",
  "packages",
  "rules",
  "scripts",
  "sdks",
  "site",
  "spec",
  "starter-kit",
  "tests"
]);

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

function collectDependencyNames(packageJson: PackageJsonLike | null): Set<string> {
  return new Set<string>([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {})
  ]);
}

function inferRuntimeFromLanguages(primaryLanguages: string[]): string {
  if (primaryLanguages.includes("TypeScript") || primaryLanguages.includes("JavaScript")) {
    return "Node.js";
  }

  if (primaryLanguages.includes("Python")) {
    return "Python";
  }

  if (primaryLanguages.includes("PHP")) {
    return "PHP";
  }

  if (primaryLanguages.includes("Java")) {
    return "Java";
  }

  if (primaryLanguages.includes("Ruby")) {
    return "Ruby";
  }

  if (primaryLanguages.includes("Go")) {
    return "Go";
  }

  return "unknown";
}

async function fileContains(filePath: string, matcher: RegExp, readFile: FileReader): Promise<boolean> {
  try {
    return matcher.test(await readFile(filePath));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export function inferFramework(packageJson: PackageJsonLike | null): string {
  const dependencyNames = collectDependencyNames(packageJson);

  if (dependencyNames.has("next")) {
    return "Next.js";
  }

  if (dependencyNames.has("vite")) {
    return "Vite";
  }

  if (dependencyNames.has("fastify")) {
    return "Fastify";
  }

  if (dependencyNames.has("express")) {
    return "Express";
  }

  return "unknown";
}

export function hasRelayScaffoldDependencies(packageJson: PackageJsonLike | null): boolean {
  const dependencyNames = collectDependencyNames(packageJson);
  return dependencyNames.has("@debugbundle/sdk-browser") && dependencyNames.has("@debugbundle/sdk-node");
}

async function inferRuntime(
  rootDirectory: string,
  servicePath: string,
  packageJson: PackageJsonLike | null,
  stat: StatReader,
  primaryLanguages: string[],
  allowFallback: boolean
): Promise<string> {
  if (packageJson !== null) {
    return "Node.js";
  }

  for (const fileName of ["tsconfig.json", "tsconfig.base.json"]) {
    if (await pathExists(join(rootDirectory, servicePath, fileName), stat)) {
      return "Node.js";
    }
  }

  if (await pathExists(join(rootDirectory, servicePath, "requirements.txt"), stat) || await pathExists(join(rootDirectory, servicePath, "pyproject.toml"), stat) || await pathExists(join(rootDirectory, servicePath, "manage.py"), stat)) {
    return "Python";
  }

  if (
    await pathExists(join(rootDirectory, servicePath, "composer.json"), stat)
    || await pathExists(join(rootDirectory, servicePath, "artisan"), stat)
    || await pathExists(join(rootDirectory, servicePath, "wp-config.php"), stat)
  ) {
    return "PHP";
  }

  if (await pathExists(join(rootDirectory, servicePath, "go.mod"), stat)) {
    return "Go";
  }

  if (await pathExists(join(rootDirectory, servicePath, "Gemfile"), stat) || await pathExists(join(rootDirectory, servicePath, "Gemfile.lock"), stat)) {
    return "Ruby";
  }

  if (
    await pathExists(join(rootDirectory, servicePath, "pom.xml"), stat)
    || await pathExists(join(rootDirectory, servicePath, "build.gradle"), stat)
    || await pathExists(join(rootDirectory, servicePath, "build.gradle.kts"), stat)
  ) {
    return "Java";
  }

  if (await pathExists(join(rootDirectory, servicePath, "Cargo.toml"), stat)) {
    return "Rust";
  }

  return allowFallback ? inferRuntimeFromLanguages(primaryLanguages) : "unknown";
}

async function inferPythonFramework(rootDirectory: string, servicePath: string, readFile: FileReader, stat: StatReader): Promise<string> {
  if (await pathExists(join(rootDirectory, servicePath, "manage.py"), stat)) {
    return "Django";
  }

  for (const fileName of ["requirements.txt", "pyproject.toml"]) {
    const filePath = join(rootDirectory, servicePath, fileName);
    try {
      const contents = await readFile(filePath);
      if (/fastapi/iu.test(contents)) {
        return "FastAPI";
      }

      if (/flask/iu.test(contents)) {
        return "Flask";
      }
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }

  return "unknown";
}

async function inferPhpFramework(rootDirectory: string, servicePath: string, readFile: FileReader, stat: StatReader): Promise<string> {
  if (await pathExists(join(rootDirectory, servicePath, "artisan"), stat)) {
    return "Laravel";
  }

  if (await pathExists(join(rootDirectory, servicePath, "wp-config.php"), stat)) {
    return "WordPress";
  }

  if (await fileContains(join(rootDirectory, servicePath, "composer.json"), /laravel\/framework/iu, readFile)) {
    return "Laravel";
  }

  if (await fileContains(join(rootDirectory, servicePath, "composer.json"), /symfony\/(framework-bundle|http-kernel)/iu, readFile)) {
    return "Symfony";
  }

  return "unknown";
}

async function inferRubyFramework(rootDirectory: string, servicePath: string, readFile: FileReader, stat: StatReader): Promise<string> {
  if (await pathExists(join(rootDirectory, servicePath, "config", "application.rb"), stat)) {
    return "Rails";
  }

  if (await fileContains(join(rootDirectory, servicePath, "Gemfile"), /gem\s+["']rails["']/iu, readFile)) {
    return "Rails";
  }

  if (
    await pathExists(join(rootDirectory, servicePath, "config.ru"), stat)
    || await fileContains(join(rootDirectory, servicePath, "Gemfile"), /gem\s+["']rack["']/iu, readFile)
  ) {
    return "Rack";
  }

  return "unknown";
}

async function inferJavaFramework(rootDirectory: string, servicePath: string, readFile: FileReader, stat: StatReader): Promise<string> {
  for (const fileName of ["pom.xml", "build.gradle", "build.gradle.kts"]) {
    if (await fileContains(join(rootDirectory, servicePath, fileName), /spring-boot/iu, readFile)) {
      return "Spring Boot";
    }
  }

  if (
    await pathExists(join(rootDirectory, servicePath, "src", "main", "webapp"), stat)
    || await pathExists(join(rootDirectory, servicePath, "src", "main", "webapp", "WEB-INF", "web.xml"), stat)
  ) {
    return "Servlet";
  }

  return "unknown";
}

async function inferServiceFramework(
  rootDirectory: string,
  servicePath: string,
  runtime: string,
  packageJson: PackageJsonLike | null,
  readFile: FileReader,
  stat: StatReader,
  fallbackPackageJson: PackageJsonLike | null,
  allowFallback: boolean
): Promise<string> {
  const localFramework = inferFramework(packageJson);
  if (localFramework !== "unknown") {
    return localFramework;
  }

  if (runtime === "Python") {
    const framework = await inferPythonFramework(rootDirectory, servicePath, readFile, stat);
    if (framework !== "unknown") {
      return framework;
    }
  }

  if (runtime === "PHP") {
    const framework = await inferPhpFramework(rootDirectory, servicePath, readFile, stat);
    if (framework !== "unknown") {
      return framework;
    }
  }

  if (runtime === "Ruby") {
    const framework = await inferRubyFramework(rootDirectory, servicePath, readFile, stat);
    if (framework !== "unknown") {
      return framework;
    }
  }

  if (runtime === "Java") {
    const framework = await inferJavaFramework(rootDirectory, servicePath, readFile, stat);
    if (framework !== "unknown") {
      return framework;
    }
  }

  return allowFallback ? inferFramework(fallbackPackageJson) : "unknown";
}

function inferServiceKind(serviceName: string, servicePath: string, framework: string, packageJson: PackageJsonLike | null): "frontend" | "backend" | "worker" {
  const dependencyNames = collectDependencyNames(packageJson);
  const lowerName = `${serviceName} ${servicePath}`.toLowerCase();

  if (lowerName.includes("worker")) {
    return "worker";
  }

  if (
    framework === "Next.js" ||
    framework === "Vite" ||
    lowerName.includes("frontend") ||
    lowerName.includes("client") ||
    (lowerName.includes("web") && !lowerName.includes("webhook")) ||
    dependencyNames.has("@debugbundle/sdk-browser") ||
    dependencyNames.has("react") ||
    dependencyNames.has("react-dom") ||
    dependencyNames.has("vue") ||
    dependencyNames.has("svelte") ||
    dependencyNames.has("@angular/core")
  ) {
    return "frontend";
  }

  return "backend";
}

async function buildDetectedService(
  rootDirectory: string,
  servicePath: string,
  readFile: FileReader,
  stat: StatReader,
  fallbackPackageJson: PackageJsonLike | null,
  primaryLanguages: string[],
  allowFallback: boolean
): Promise<DetectedService | null> {
  const packageJson = await readJsonFile<PackageJsonLike>(join(rootDirectory, servicePath, "package.json"), readFile);
  const runtime = await inferRuntime(rootDirectory, servicePath, packageJson, stat, primaryLanguages, allowFallback);

  if (runtime === "unknown" && !allowFallback) {
    return null;
  }

  const framework = await inferServiceFramework(rootDirectory, servicePath, runtime, packageJson, readFile, stat, fallbackPackageJson, allowFallback);
  const name = packageJson?.name ?? basename(servicePath);

  return {
    name,
    kind: inferServiceKind(name, servicePath, framework, packageJson),
    runtime,
    framework,
    paths: [servicePath],
    owns_routes: [],
    depends_on: []
  };
}

async function detectRootServicePaths(rootDirectory: string, readdir: DirectoryReader, stat: StatReader): Promise<string[]> {
  const entries = (await readdir(rootDirectory)).sort();
  const servicePaths: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".") || IGNORED_ROOT_DIRECTORIES.has(entry)) {
      continue;
    }

    const entryPath = join(rootDirectory, entry);
    const entryStats = await stat(entryPath);
    if (!entryStats.isDirectory()) {
      continue;
    }

    if (
      await pathExists(join(entryPath, "package.json"), stat) ||
      await pathExists(join(entryPath, "requirements.txt"), stat) ||
      await pathExists(join(entryPath, "pyproject.toml"), stat) ||
      await pathExists(join(entryPath, "manage.py"), stat) ||
      await pathExists(join(entryPath, "composer.json"), stat) ||
      await pathExists(join(entryPath, "artisan"), stat) ||
      await pathExists(join(entryPath, "wp-config.php"), stat) ||
      await pathExists(join(entryPath, "go.mod"), stat) ||
      await pathExists(join(entryPath, "Gemfile"), stat) ||
      await pathExists(join(entryPath, "Gemfile.lock"), stat) ||
      await pathExists(join(entryPath, "pom.xml"), stat) ||
      await pathExists(join(entryPath, "build.gradle"), stat) ||
      await pathExists(join(entryPath, "build.gradle.kts"), stat) ||
      await pathExists(join(entryPath, "Cargo.toml"), stat)
    ) {
      servicePaths.push(entry);
    }
  }

  return servicePaths;
}

export async function detectServices(
  rootDirectory: string,
  readdir: DirectoryReader,
  readFile: FileReader,
  stat: StatReader,
  packageJson: PackageJsonLike | null,
  primaryLanguages: string[]
): Promise<DetectedService[]> {
  const services: DetectedService[] = [];
  const appsDirectory = join(rootDirectory, "apps");

  if (await pathExists(appsDirectory, stat)) {
    const entries = (await readdir(appsDirectory)).sort();
    for (const entry of entries) {
      const entryPath = join(appsDirectory, entry);
      const entryStats = await stat(entryPath);
      if (!entryStats.isDirectory()) {
        continue;
      }

      const detectedService = await buildDetectedService(
        rootDirectory,
        `apps/${entry}`,
        readFile,
        stat,
        packageJson,
        primaryLanguages,
        true
      );

      if (detectedService !== null) {
        services.push(detectedService);
      }
    }
  }

  for (const servicePath of await detectRootServicePaths(rootDirectory, readdir, stat)) {
    const detectedService = await buildDetectedService(
      rootDirectory,
      servicePath,
      readFile,
      stat,
      packageJson,
      primaryLanguages,
      false
    );

    if (detectedService !== null) {
      services.push(detectedService);
    }
  }

  return services;
}