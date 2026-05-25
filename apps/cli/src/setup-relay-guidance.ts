import { join } from "node:path";

import { inferFramework, type DetectedService, type PackageJsonLike } from "./setup-service-discovery.js";

type FileReader = (path: string) => Promise<string>;
type FileWriter = (path: string, content: string) => Promise<void>;
type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean }>;

export type SetupCheck = {
  name: string;
  status: "ok" | "warning" | "missing" | "error";
  message: string;
};

export type RelayGuidance = {
  backend_service: string | null;
  frontend_services: string[];
  runtime: string;
  framework: string;
  action: "scaffolded" | "instructions" | "none";
  route_path: string;
  browser_endpoint: string;
  summary: string;
  instructions: string[];
};

type ResolveRelaySetupDependencies = {
  mkdir: DirectoryMaker;
  readFile: FileReader;
  stat: StatReader;
  writeFile: FileWriter;
};

const RELAY_ROUTE_PATH = "/debugbundle/browser";
const WORDPRESS_RELAY_ROUTE_PATH = "/wp-json/debugbundle/v1/browser";

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

async function readPackageJsonForService(
  rootDirectory: string,
  servicePath: string | undefined,
  readFile: FileReader
): Promise<PackageJsonLike | null> {
  const normalizedServicePath = servicePath === "." ? "" : (servicePath ?? "");
  return readJsonFile<PackageJsonLike>(join(rootDirectory, normalizedServicePath, "package.json"), readFile);
}

function collectDependencyNames(packageJson: PackageJsonLike | null): Set<string> {
  return new Set<string>([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {})
  ]);
}

function hasDependency(packageJson: PackageJsonLike | null, dependencyName: string): boolean {
  return collectDependencyNames(packageJson).has(dependencyName);
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

function buildSharedRelayInstructions(frontendServices: string[], browserEndpoint: string): string[] {
  return [
    `Point the browser SDK in ${frontendServices.join(", ")} to ${browserEndpoint}; for split frontend/backend hosts, use the API origin instead of assuming same-origin hosting.`,
    "Keep the project token server-side and configure explicit allowed origins for the frontend host names that should be able to send browser events.",
    "Leave the relay path outside auth and CSRF enforcement, but keep origin validation, Content-Type checks, body size limits, schema validation, credential stripping, and per-IP rate limiting enabled.",
    "Use local-only relay delivery to write .debugbundle/local/events during local development, and use connected durable spool writes before forwarding in connected environments.",
    "Trigger a real browser-side smoke event, then run debugbundle process --json and confirm the event appears before marking setup complete."
  ];
}

function defaultRelaySummary(backendService: DetectedService, routePath: string): string {
  return backendService.framework === "unknown"
    ? `Add a ${backendService.runtime} relay route at ${routePath}.`
    : `Add a ${backendService.runtime} ${backendService.framework} relay route at ${routePath}.`;
}

function buildInstructionOnlyGuidance(
  backendService: DetectedService,
  frontendServices: DetectedService[],
  runtimeInstruction: string,
  options?: {
    browserEndpoint?: string;
    routePath?: string;
    summary?: string;
  }
): RelayGuidance {
  const routePath = options?.routePath ?? RELAY_ROUTE_PATH;
  const browserEndpoint = options?.browserEndpoint ?? routePath;
  return {
    backend_service: backendService.name,
    frontend_services: frontendServices.map((service) => service.name),
    runtime: backendService.runtime,
    framework: backendService.framework,
    action: "instructions",
    route_path: routePath,
    browser_endpoint: browserEndpoint,
    summary: options?.summary ?? defaultRelaySummary(backendService, routePath),
    instructions: [runtimeInstruction, ...buildSharedRelayInstructions(frontendServices.map((service) => service.name), browserEndpoint)]
  };
}

async function scaffoldFastifyRelayRoute(
  rootDirectory: string,
  servicePath: string,
  dependencies: ResolveRelaySetupDependencies,
  frontendServices: DetectedService[],
  backendService: DetectedService
): Promise<RelayGuidance> {
  const candidatePath = await findFirstExistingPath([
    join(rootDirectory, servicePath, "src", "server.ts"),
    join(rootDirectory, servicePath, "src", "main.ts"),
    join(rootDirectory, servicePath, "server.ts")
  ], dependencies.stat);

  if (candidatePath === null) {
    return buildInstructionOnlyGuidance(
      backendService,
      frontendServices,
      `Register debugBundleRelayPlugin from @debugbundle/sdk-node/relay/fastify on POST ${RELAY_ROUTE_PATH} inside ${servicePath}.`
    );
  }

  const relativePath = candidatePath.replace(`${rootDirectory}/`, "");
  const originalContents = await dependencies.readFile(candidatePath);
  const withImport = insertImport(originalContents, 'import { debugBundleRelayPlugin } from "@debugbundle/sdk-node/relay/fastify";');
  const withRegistration = insertAfterMatch(withImport, /const\s+app\s*=\s*(?:Fastify|fastify)\(/u, "app.register(debugBundleRelayPlugin);");
  if (withRegistration === null) {
    return buildInstructionOnlyGuidance(
      backendService,
      frontendServices,
      `Register debugBundleRelayPlugin from @debugbundle/sdk-node/relay/fastify on POST ${RELAY_ROUTE_PATH} inside ${relativePath}.`
    );
  }

  if (withRegistration !== originalContents) {
    await dependencies.writeFile(candidatePath, withRegistration);
  }

  return {
    backend_service: backendService.name,
    frontend_services: frontendServices.map((service) => service.name),
    runtime: backendService.runtime,
    framework: backendService.framework,
    action: "scaffolded",
    route_path: RELAY_ROUTE_PATH,
    browser_endpoint: RELAY_ROUTE_PATH,
    summary: `Scaffolded a Fastify relay route in ${relativePath}.`,
    instructions: [
      `Review the generated Fastify relay registration in ${relativePath} and confirm the app should expose POST ${RELAY_ROUTE_PATH}.`,
      ...buildSharedRelayInstructions(frontendServices.map((service) => service.name), RELAY_ROUTE_PATH)
    ]
  };
}

async function scaffoldExpressRelayRoute(
  rootDirectory: string,
  servicePath: string,
  dependencies: ResolveRelaySetupDependencies,
  frontendServices: DetectedService[],
  backendService: DetectedService
): Promise<RelayGuidance> {
  const candidatePath = await findFirstExistingPath([
    join(rootDirectory, servicePath, "src", "server.ts"),
    join(rootDirectory, servicePath, "src", "app.ts"),
    join(rootDirectory, servicePath, "server.ts")
  ], dependencies.stat);

  if (candidatePath === null) {
    return buildInstructionOnlyGuidance(
      backendService,
      frontendServices,
      `Register debugBundleRelay() from @debugbundle/sdk-node/relay/express on POST ${RELAY_ROUTE_PATH} inside ${servicePath}.`
    );
  }

  const relativePath = candidatePath.replace(`${rootDirectory}/`, "");
  const originalContents = await dependencies.readFile(candidatePath);
  const withImport = insertImport(originalContents, 'import { debugBundleRelay } from "@debugbundle/sdk-node/relay/express";');
  const withRegistration = insertAfterMatch(withImport, /const\s+app\s*=\s*express\(/u, `app.use("${RELAY_ROUTE_PATH}", debugBundleRelay());`);
  if (withRegistration === null) {
    return buildInstructionOnlyGuidance(
      backendService,
      frontendServices,
      `Register debugBundleRelay() from @debugbundle/sdk-node/relay/express on POST ${RELAY_ROUTE_PATH} inside ${relativePath}.`
    );
  }

  if (withRegistration !== originalContents) {
    await dependencies.writeFile(candidatePath, withRegistration);
  }

  return {
    backend_service: backendService.name,
    frontend_services: frontendServices.map((service) => service.name),
    runtime: backendService.runtime,
    framework: backendService.framework,
    action: "scaffolded",
    route_path: RELAY_ROUTE_PATH,
    browser_endpoint: RELAY_ROUTE_PATH,
    summary: `Scaffolded an Express relay route in ${relativePath}.`,
    instructions: [
      `Review the generated Express relay registration in ${relativePath} and confirm the app should expose POST ${RELAY_ROUTE_PATH}.`,
      ...buildSharedRelayInstructions(frontendServices.map((service) => service.name), RELAY_ROUTE_PATH)
    ]
  };
}

async function scaffoldNextJsRelayRoute(
  rootDirectory: string,
  servicePath: string,
  dependencies: ResolveRelaySetupDependencies,
  frontendServices: DetectedService[],
  backendService: DetectedService
): Promise<RelayGuidance> {
  const candidateAppRoot = await findFirstExistingPath([
    join(rootDirectory, servicePath, "app"),
    join(rootDirectory, servicePath, "src", "app")
  ], dependencies.stat);

  if (candidateAppRoot === null) {
    return buildInstructionOnlyGuidance(
      backendService,
      frontendServices,
      `Add app/debugbundle/browser/route.ts in ${servicePath} and export debugBundleRelay as POST from @debugbundle/sdk-node/relay/nextjs.`
    );
  }

  const routeDirectory = join(candidateAppRoot, "debugbundle", "browser");
  const routePath = join(routeDirectory, "route.ts");
  await dependencies.mkdir(routeDirectory, { recursive: true });
  await dependencies.writeFile(routePath, 'export { debugBundleRelay as POST } from "@debugbundle/sdk-node/relay/nextjs";\n');

  return {
    backend_service: backendService.name,
    frontend_services: frontendServices.map((service) => service.name),
    runtime: backendService.runtime,
    framework: backendService.framework,
    action: "scaffolded",
    route_path: RELAY_ROUTE_PATH,
    browser_endpoint: RELAY_ROUTE_PATH,
    summary: `Scaffolded a Next.js relay route in ${routePath.replace(`${rootDirectory}/`, "")}.`,
    instructions: [
      `Review the generated Next.js route file and confirm the app should expose POST ${RELAY_ROUTE_PATH}.`,
      ...buildSharedRelayInstructions(frontendServices.map((service) => service.name), RELAY_ROUTE_PATH)
    ]
  };
}

async function resolveNodeRelayGuidance(
  rootDirectory: string,
  backendService: DetectedService,
  frontendServices: DetectedService[],
  dependencies: ResolveRelaySetupDependencies
): Promise<RelayGuidance> {
  const servicePath = backendService.paths[0] === "." ? "" : (backendService.paths[0] ?? "");
  const packageJson = await readPackageJsonForService(rootDirectory, servicePath, dependencies.readFile);

  if (!hasDependency(packageJson, "@debugbundle/sdk-node")) {
    return buildInstructionOnlyGuidance(
      backendService,
      frontendServices,
      `Install @debugbundle/sdk-node in ${servicePath}, then mount the relay helper for ${backendService.framework} at POST ${RELAY_ROUTE_PATH}.`
    );
  }

  if (backendService.framework === "Fastify") {
    return scaffoldFastifyRelayRoute(rootDirectory, servicePath, dependencies, frontendServices, backendService);
  }

  if (backendService.framework === "Express") {
    return scaffoldExpressRelayRoute(rootDirectory, servicePath, dependencies, frontendServices, backendService);
  }

  if (backendService.framework === "Next.js") {
    return scaffoldNextJsRelayRoute(rootDirectory, servicePath, dependencies, frontendServices, backendService);
  }

  return buildInstructionOnlyGuidance(
    backendService,
    frontendServices,
    `Mount the generic @debugbundle/sdk-node relay handler at POST ${RELAY_ROUTE_PATH} inside ${servicePath}; use the server framework integration guide for ${backendService.framework}.`
  );
}

function resolveNonNodeRelayGuidance(backendService: DetectedService, frontendServices: DetectedService[]): RelayGuidance {
  if (backendService.runtime === "Python") {
    const runtimeInstruction = backendService.framework === "Django"
      ? `Use debugbundle.create_django_relay_view(...) and mount it at POST ${RELAY_ROUTE_PATH} in the ${backendService.name} URL configuration.`
      : backendService.framework === "Flask"
        ? `Use debugbundle.create_flask_relay_handler(...) and register POST ${RELAY_ROUTE_PATH} on the ${backendService.name} Flask app.`
        : `Use debugbundle.create_fastapi_relay_handler(...) and register POST ${RELAY_ROUTE_PATH} on the ${backendService.name} FastAPI app.`;
    return buildInstructionOnlyGuidance(backendService, frontendServices, runtimeInstruction);
  }

  if (backendService.runtime === "PHP") {
    const runtimeInstruction = backendService.framework === "Laravel"
      ? `Register DebugBundle\\Framework\\Laravel\\DebugBundleRelayMiddleware so ${backendService.name} serves POST ${RELAY_ROUTE_PATH}.`
      : backendService.framework === "WordPress"
        ? `Install and enable the DebugBundle WordPress plugin so ${backendService.name} serves POST ${WORDPRESS_RELAY_ROUTE_PATH}; configure the plugin-managed project token and allowed origins in WordPress admin.`
      : backendService.framework === "Symfony"
        ? `Register DebugBundle\\Framework\\Symfony\\DebugBundleRelayController for POST ${RELAY_ROUTE_PATH} in ${backendService.name}.`
        : `Use DebugBundle\\Relay\\BrowserRelayHandler and route POST ${RELAY_ROUTE_PATH} through the ${backendService.name} backend.`;
    return buildInstructionOnlyGuidance(
      backendService,
      frontendServices,
      runtimeInstruction,
      backendService.framework === "WordPress"
        ? {
            routePath: WORDPRESS_RELAY_ROUTE_PATH,
            browserEndpoint: WORDPRESS_RELAY_ROUTE_PATH,
            summary: `Use the DebugBundle WordPress plugin relay route at ${WORDPRESS_RELAY_ROUTE_PATH}.`
          }
        : undefined
    );
  }

  if (backendService.runtime === "Go") {
    return buildInstructionOnlyGuidance(
      backendService,
      frontendServices,
      `Mount debugbundlehttp.RelayHandler(client, relay.Options{}) at POST ${RELAY_ROUTE_PATH} in the ${backendService.name} Go server or router.`
    );
  }

  if (backendService.runtime === "Ruby") {
    const runtimeInstruction = backendService.framework === "Rails"
      ? `Enable the Rails relay route in config.debugbundle and keep config.debugbundle.relay_path = "${RELAY_ROUTE_PATH}" for ${backendService.name}.`
      : `Use DebugBundle::Rack::RelayMiddleware or DebugBundle::Relay::Handler so ${backendService.name} serves POST ${RELAY_ROUTE_PATH}.`;
    return buildInstructionOnlyGuidance(backendService, frontendServices, runtimeInstruction);
  }

  if (backendService.runtime === "Java") {
    const runtimeInstruction = backendService.framework === "Spring Boot"
      ? `Use the debugbundle-spring-boot-starter and keep relay.enabled=true so ${backendService.name} serves POST ${RELAY_ROUTE_PATH}; permit the route in Spring Security if it guards all POSTs.`
      : `Register the matching DebugBundle relay servlet or JAX-RS adapter so ${backendService.name} serves POST ${RELAY_ROUTE_PATH}.`;
    return buildInstructionOnlyGuidance(backendService, frontendServices, runtimeInstruction);
  }

  return buildInstructionOnlyGuidance(
    backendService,
    frontendServices,
    `Add a backend-owned relay endpoint at POST ${RELAY_ROUTE_PATH} for ${backendService.name} and follow the runtime-specific SDK relay guide for ${backendService.runtime}.`
  );
}

function summarizeRelayCheck(relayGuidance: RelayGuidance[]): SetupCheck | null {
  if (relayGuidance.length === 0) {
    return null;
  }

  const scaffolded = relayGuidance.filter((guidance) => guidance.action === "scaffolded");
  if (scaffolded.length === relayGuidance.length) {
    const normalizedSummary = scaffolded[0]?.summary
      .replace(/^Scaffolded (?:an|a) .*? in /u, "Scaffolded browser relay route in ")
      .replace(/\.$/u, "");
    return {
      name: "relay-route",
      status: "ok",
      message:
        scaffolded.length === 1
          ? normalizedSummary ?? "Scaffolded browser relay route"
          : `Scaffolded browser relay routes for ${scaffolded.length} backend services.`
    };
  }

  return {
    name: "relay-route",
    status: "warning",
    message: `Generated runtime-specific relay instructions for ${relayGuidance.length} backend services.`
  };
}

export function determineRelayAction(relayGuidance: RelayGuidance[]): "scaffolded" | "instructions" | "none" {
  if (relayGuidance.some((guidance) => guidance.action === "instructions")) {
    return "instructions";
  }

  if (relayGuidance.some((guidance) => guidance.action === "scaffolded")) {
    return "scaffolded";
  }

  return "none";
}

export async function resolveRelaySetup(
  rootDirectory: string,
  services: DetectedService[],
  selectedTargetNames: string[],
  rootPackageJson: PackageJsonLike | null,
  dependencies: ResolveRelaySetupDependencies
): Promise<{ relayCheck: SetupCheck | null; relayGuidance: RelayGuidance[] }> {
  const selectedServices = services.filter((service) => selectedTargetNames.includes(service.name));
  let frontendServices = selectedServices.filter((service) => service.kind === "frontend");
  let backendServices = selectedServices.filter((service) => service.kind !== "frontend");

  if (frontendServices.length > 0) {
    const frontendServicesWithBrowserSdk = (
      await Promise.all(
        frontendServices.map(async (service) => {
          const packageJson = await readPackageJsonForService(rootDirectory, service.paths[0], dependencies.readFile);
          return hasDependency(packageJson, "@debugbundle/sdk-browser") ? service : null;
        })
      )
    ).filter((service): service is DetectedService => service !== null);

    frontendServices = frontendServicesWithBrowserSdk;
  }

  if (frontendServices.length === 0 && backendServices.length === 0 && rootPackageJson !== null && hasDependency(rootPackageJson, "@debugbundle/sdk-node") && hasDependency(rootPackageJson, "@debugbundle/sdk-browser")) {
    const rootServiceName = rootPackageJson.name ?? "root-service";
    frontendServices = [
      {
        name: rootServiceName,
        kind: "frontend",
        runtime: "Node.js",
        framework: "Browser",
        paths: ["."],
        owns_routes: [],
        depends_on: []
      }
    ];
    backendServices = [
      {
        name: rootServiceName,
        kind: "backend",
        runtime: "Node.js",
        framework: inferFramework(rootPackageJson),
        paths: ["."],
        owns_routes: [],
        depends_on: []
      }
    ];
  }

  if (frontendServices.length === 0 || backendServices.length === 0) {
    return {
      relayCheck: null,
      relayGuidance: []
    };
  }

  const relayGuidance: RelayGuidance[] = [];
  for (const backendService of backendServices) {
    if (backendService.runtime === "Node.js") {
      relayGuidance.push(await resolveNodeRelayGuidance(rootDirectory, backendService, frontendServices, dependencies));
      continue;
    }

    relayGuidance.push(resolveNonNodeRelayGuidance(backendService, frontendServices));
  }

  return {
    relayCheck: summarizeRelayCheck(relayGuidance),
    relayGuidance
  };
}