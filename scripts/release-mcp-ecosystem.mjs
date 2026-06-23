#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "..");
const manifestPath = join(repoRoot, "apps", "mcp", "ecosystem-release-manifest.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(argv) {
  const parsed = {
    command: "plan",
    version: undefined,
    targets: undefined,
    json: false,
    dryRun: false
  };

  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--json") {
      parsed.json = true;
      continue;
    }

    if (token === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (token === "--version") {
      parsed.version = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--targets") {
      parsed.targets = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "-h" || token === "--help") {
      parsed.command = "help";
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`unknown_option:${token}`);
    }

    positionals.push(token);
  }

  if (positionals.length > 0) {
    parsed.command = positionals[0];
  }

  return parsed;
}

function normalizePackageVersion(rawVersion) {
  if (typeof rawVersion !== "string") {
    throw new Error("missing_package_version");
  }

  return rawVersion.replace(/^[~^]/u, "");
}

function listTargetEntries(manifest, selectedTargets) {
  const allTargets = Object.entries(manifest.publishTargets);

  if (selectedTargets === undefined) {
    return allTargets;
  }

  const selectedKeys = new Set(
    selectedTargets
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
  );

  return allTargets.filter(([key]) => selectedKeys.has(key));
}

function buildContext(manifest, version, selectedTargets) {
  const packageJsonPath = join(repoRoot, manifest.package.packageJsonPath);
  const serverJsonPath = join(repoRoot, manifest.package.serverJsonPath);
  const packageJson = readJson(packageJsonPath);
  const serverJson = readJson(serverJsonPath);
  const stageRoot = join(repoRoot, ".tmp", "mcp-ecosystem", version);
  const tarballDirectory = join(stageRoot, "tarball");
  const stagePackageDirectory = join(stageRoot, "package");
  const reportPath = join(stageRoot, "report.json");
  const bundlePath = join(stageRoot, manifest.mcpb.bundleFileName);
  const packageIdentifier = `${manifest.package.name}@${version}`;
  const targetEntries = listTargetEntries(manifest, selectedTargets);

  if (packageJson.version !== version) {
    throw new Error(`package_version_mismatch:${packageJson.version}:${version}`);
  }

  if (serverJson.version !== version) {
    throw new Error(`server_json_version_mismatch:${serverJson.version}:${version}`);
  }

  return {
    manifest,
    version,
    packageJson,
    serverJson,
    packageJsonPath,
    serverJsonPath,
    stageRoot,
    tarballDirectory,
    stagePackageDirectory,
    reportPath,
    bundlePath,
    packageIdentifier,
    targetEntries
  };
}

function buildPlan(context) {
  const publishTargets = [];
  const discoveryTargets = [];

  for (const [key, target] of context.targetEntries) {
    if (target.type === "push") {
      publishTargets.push({
        key,
        type: target.type
      });
    } else {
      discoveryTargets.push({
        key,
        type: target.type,
        listingUrl: target.listingUrl,
        searchTerms: target.searchTerms
      });
    }
  }

  return {
    version: context.version,
    packageName: context.packageJson.name,
    serverName: context.serverJson.name,
    mcpb: {
      bundlePath: context.bundlePath,
      stagePackageDirectory: context.stagePackageDirectory,
      reportPath: context.reportPath
    },
    publishTargets,
    discoveryTargets
  };
}

function outputResult(value, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  if (typeof value === "string") {
    process.stdout.write(`${value}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: options.env ?? process.env
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stdout = result.stdout?.trim() ?? "";
    const stderr = result.stderr?.trim() ?? "";
    throw new Error(
      [
        `command_failed:${command}`,
        stdout.length > 0 ? `stdout=${stdout}` : "",
        stderr.length > 0 ? `stderr=${stderr}` : ""
      ]
        .filter((entry) => entry.length > 0)
        .join(":")
    );
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function parseJsonFromCommandOutput(output) {
  const jsonStart = output.indexOf("{");
  if (jsonStart === -1) {
    throw new Error("missing_json_output");
  }

  return JSON.parse(output.slice(jsonStart));
}

function writeReport(context, report) {
  mkdirSync(dirname(context.reportPath), { recursive: true });
  writeFileSync(context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function loadReport(context) {
  if (!existsSync(context.reportPath)) {
    return {
      version: context.version,
      packageName: context.packageJson.name,
      serverName: context.serverJson.name,
      bundlePath: context.bundlePath,
      reportPath: context.reportPath
    };
  }

  return readJson(context.reportPath);
}

function buildMcpbManifest(context) {
  return {
    manifest_version: "0.3",
    name: "debugbundle-mcp",
    display_name: context.serverJson.title,
    version: context.version,
    description: context.serverJson.description,
    long_description:
      "Run the official DebugBundle MCP server locally over stdio. The bundle includes the packaged Node entrypoint, production dependencies, and optional DebugBundle member-token and API URL configuration for hosted or self-hosted workflows.",
    author: {
      name: "DebugBundle",
      url: "https://debugbundle.com"
    },
    repository: {
      type: "git",
      url: "https://github.com/debugbundle/debugbundle"
    },
    homepage: "https://debugbundle.com",
    documentation: "https://debugbundle.com/docs/mcp",
    support: "https://github.com/debugbundle/debugbundle/issues",
    privacy_policies: ["https://debugbundle.com/privacy"],
    license: context.packageJson.license,
    keywords: context.packageJson.keywords,
    tools_generated: true,
    compatibility: {
      platforms: ["darwin", "win32", "linux"],
      runtimes: {
        node: context.packageJson.engines.node
      }
    },
    server: {
      type: "node",
      entry_point: "bin/debugbundle-mcp.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/bin/debugbundle-mcp.js"],
        env: {
          DEBUGBUNDLE_MEMBER_TOKEN: "${user_config.debugbundle_member_token}",
          DEBUGBUNDLE_API_URL: "${user_config.debugbundle_api_url}"
        }
      }
    },
    user_config: {
      debugbundle_member_token: {
        type: "string",
        title: "DebugBundle Member Token",
        description:
          "Optional member token used for hosted DebugBundle API and management tools when local CLI auth is unavailable.",
        sensitive: true,
        required: false
      },
      debugbundle_api_url: {
        type: "string",
        title: "DebugBundle API URL",
        description: "Optional DebugBundle API base URL for self-hosted, staging, or other non-default environments.",
        sensitive: false,
        required: false
      }
    }
  };
}

function resolveGitHubSourceRepo() {
  const remoteUrl = execFileSync("git", ["config", "--get", "remote.origin.url"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/u.exec(remoteUrl);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u.exec(remoteUrl);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  throw new Error(`unsupported_git_remote:${remoteUrl}`);
}

function buildGitHubTreeUrl(ref, path) {
  return `https://github.com/${resolveGitHubSourceRepo()}/tree/${ref}/${path}`;
}

function assertCleanGitPath(path) {
  const result = runCommand("git", ["status", "--porcelain", "--", path], { cwd: repoRoot });
  const dirtyEntries = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (dirtyEntries.length > 0) {
    throw new Error(`dirty_source_path:${path}:${dirtyEntries.join(",")}`);
  }
}

function buildOpenClawPlugin(target) {
  runCommand("pnpm", ["--filter", target.packageName, "build"], { cwd: repoRoot });
  runCommand("pnpm", ["--filter", target.packageName, "plugin:build"], { cwd: repoRoot });
  runCommand("pnpm", ["--filter", target.packageName, "plugin:validate"], { cwd: repoRoot });
}

function mintSmitheryApiToken(policy) {
  if (typeof process.env.SMITHERY_API_KEY === "string" && process.env.SMITHERY_API_KEY.length > 0) {
    return process.env.SMITHERY_API_KEY;
  }

  const result = runCommand("npx", [
    "-y",
    "smithery@1.2.0",
    "auth",
    "token",
    "--policy",
    JSON.stringify(policy)
  ]);
  const payload = JSON.parse(result.stdout);

  if (typeof payload?.token !== "string" || payload.token.length === 0) {
    throw new Error("missing_smithery_api_token");
  }

  return payload.token;
}

function prepare(context, options) {
  if (options.dryRun) {
    const report = {
      ...loadReport(context),
      preparedAt: null,
      dryRun: true,
      bundlePath: context.bundlePath,
      manifestPath: join(context.stagePackageDirectory, "manifest.json")
    };
    writeReport(context, report);
    return report;
  }

  rmSync(context.stageRoot, { recursive: true, force: true });
  mkdirSync(context.tarballDirectory, { recursive: true });
  mkdirSync(context.stagePackageDirectory, { recursive: true });

  const packResult = runCommand("npm", ["pack", context.packageIdentifier, "--pack-destination", context.tarballDirectory], {
    cwd: repoRoot
  });
  const tarballName = packResult.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);

  if (!tarballName) {
    throw new Error("missing_packed_tarball_name");
  }

  const tarballPath = join(context.tarballDirectory, tarballName);

  runCommand("tar", ["-xzf", tarballPath, "-C", context.stagePackageDirectory, "--strip-components=1"]);

  const stagedPackageJson = readJson(join(context.stagePackageDirectory, "package.json"));
  const argon2Version = normalizePackageVersion(stagedPackageJson.dependencies["@node-rs/argon2"]);
  const optionalDependencyResult = runCommand("npm", [
    "view",
    `@node-rs/argon2@${argon2Version}`,
    "optionalDependencies",
    "--json"
  ]);
  const optionalDependencies = JSON.parse(optionalDependencyResult.stdout);
  const optionalPackages = Object.entries(optionalDependencies).map(([name, version]) => {
    return `${name}@${normalizePackageVersion(version)}`;
  });

  runCommand(
    "npm",
    [
      "install",
      "--force",
      "--omit=dev",
      "--no-package-lock",
      "--no-save",
      `@node-rs/argon2@${argon2Version}`,
      ...optionalPackages
    ],
    { cwd: context.stagePackageDirectory }
  );

  const mcpbManifest = buildMcpbManifest(context);
  const bundleManifestPath = join(context.stagePackageDirectory, "manifest.json");
  writeFileSync(bundleManifestPath, `${JSON.stringify(mcpbManifest, null, 2)}\n`);

  runCommand("npx", [
    "-y",
    `${context.manifest.mcpb.cliPackage}@${context.manifest.mcpb.cliVersion}`,
    "validate",
    context.stagePackageDirectory
  ]);
  runCommand("npx", [
    "-y",
    `${context.manifest.mcpb.cliPackage}@${context.manifest.mcpb.cliVersion}`,
    "pack",
    context.stagePackageDirectory,
    context.bundlePath
  ]);

  runCommand("node", ["scripts/smoke-mcp-stdio.mjs", join(context.stagePackageDirectory, "bin", "debugbundle-mcp.js")], {
    cwd: repoRoot
  });

  const report = {
    ...loadReport(context),
    preparedAt: new Date().toISOString(),
    bundlePath: context.bundlePath,
    tarballPath,
    manifestPath: bundleManifestPath,
    stagePackageDirectory: context.stagePackageDirectory,
    argon2Version,
    smokeTest: {
      command: `node scripts/smoke-mcp-stdio.mjs ${join(context.stagePackageDirectory, "bin", "debugbundle-mcp.js")}`,
      status: "passed"
    }
  };
  writeReport(context, report);
  return report;
}

async function publishTarget(context, targetKey, target, dryRun) {
  if (targetKey === "officialRegistry") {
    const publisherBinary = process.env.MCP_PUBLISHER_BIN ?? target.publisherBinary;
    const command = [publisherBinary, ["publish", context.serverJsonPath]];
    if (dryRun) {
      return {
        command: `${command[0]} ${command[1].join(" ")}`,
        status: "dry_run"
      };
    }

    const result = runCommand(command[0], command[1], { cwd: repoRoot });
    return {
      command: `${command[0]} ${command[1].join(" ")}`,
      status: "published",
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  }

  if (targetKey === "smithery") {
    const qualifiedName = `${target.namespace}/${target.slug}`;
    const command = [
      "npx",
      ["-y", `${target.cliPackage}@${target.cliVersion}`, "mcp", "publish", context.bundlePath, "-n", qualifiedName]
    ];

    if (dryRun) {
      return {
        command: `${command[0]} ${command[1].join(" ")}`,
        status: "dry_run"
      };
    }

    const result = runCommand(command[0], command[1], { cwd: repoRoot });
    return {
      command: `${command[0]} ${command[1].join(" ")}`,
      status: "published",
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  }

  if (targetKey === "smitherySkill") {
    const gitUrl = buildGitHubTreeUrl(target.gitBranch, target.skillPath);
    const endpoint = `https://api.smithery.ai/skills/${encodeURIComponent(target.namespace)}/${encodeURIComponent(target.slug)}`;

    if (dryRun) {
      return {
        command: `PUT ${endpoint}`,
        status: "dry_run",
        gitUrl
      };
    }

    const token = mintSmitheryApiToken({
      resources: "skills",
      operations: "write",
      namespaces: target.namespace,
      ttl: "30m"
    });
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ gitUrl })
    });
    const responseText = await response.text();
    const responseJson = responseText.length > 0 ? JSON.parse(responseText) : null;

    if (!response.ok) {
      throw new Error(`http_${response.status}:${endpoint}:${responseText}`);
    }

    return {
      command: `PUT ${endpoint}`,
      status: "published",
      gitUrl,
      response: responseJson
    };
  }

  if (targetKey === "clawhub") {
    if (!dryRun) {
      assertCleanGitPath(target.skillPath);
    }

    const sourceRepo = resolveGitHubSourceRepo();
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    const sourceRef = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8"
    }).trim();
    const commandArguments = [
      "-y",
      `${target.cliPackage}@${target.cliVersion}`,
      "skill",
      "publish",
      join(repoRoot, target.skillPath),
      "--slug",
      target.slug,
      "--name",
      target.displayName,
      "--owner",
      target.owner,
      "--source-repo",
      sourceRepo,
      "--source-commit",
      sourceCommit,
      "--source-ref",
      sourceRef,
      "--source-path",
      target.skillPath,
      "--changelog",
      `DebugBundle MCP ecosystem release ${context.version}`
    ];

    if (dryRun) {
      return {
        command: `npx ${commandArguments.join(" ")}`,
        status: "dry_run"
      };
    }

    const result = runCommand("npx", commandArguments, { cwd: repoRoot });
    return {
      command: `npx ${commandArguments.join(" ")}`,
      status: "published",
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  }

  if (targetKey === "clawhubPlugin") {
    const commandArguments = [
      "-y",
      `${target.cliPackage}@${target.cliVersion}`,
      "package",
      "publish",
      join(repoRoot, target.packagePath)
    ];

    if (dryRun) {
      return {
        command: `npx ${commandArguments.join(" ")}`,
        status: "dry_run",
        packageName: target.packageName
      };
    }

    assertCleanGitPath(target.packagePath);
    buildOpenClawPlugin(target);
    assertCleanGitPath(target.packagePath);

    const result = runCommand("npx", commandArguments, { cwd: repoRoot });
    return {
      command: `npx ${commandArguments.join(" ")}`,
      status: "published",
      packageName: target.packageName,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  }

  throw new Error(`unsupported_publish_target:${targetKey}`);
}

async function publish(context, options) {
  const report = loadReport(context);
  const requiresBundle = context.targetEntries.some(([targetKey, target]) => {
    return target.type === "push" && targetKey === "smithery";
  });

  if (!options.dryRun && requiresBundle && !existsSync(context.bundlePath)) {
    throw new Error(`missing_bundle:${context.bundlePath}`);
  }

  report.publish = report.publish ?? {};
  report.publishedAt = options.dryRun ? null : new Date().toISOString();

  for (const [targetKey, target] of context.targetEntries) {
    if (target.type !== "push") {
      continue;
    }

    report.publish[targetKey] = await publishTarget(context, targetKey, target, options.dryRun);
  }

  writeReport(context, report);
  return report;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`http_${response.status}:${url}`);
  }
  return response.json();
}

async function fetchOptionalJson(url, init) {
  const response = await fetch(url, init);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`http_${response.status}:${url}`);
  }
  return response.json();
}

function findOfficialRegistryEntry(payload, serverName) {
  const candidates = Array.isArray(payload?.servers) ? payload.servers : [];

  return candidates.find((candidate) => {
    const server = candidate?.server ?? candidate;
    return server?.name === serverName;
  });
}

function normalizeUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value.replace(/\/+$/u, "").toLowerCase();
}

function findSmitheryQualifiedEntry(payload, qualifiedName) {
  const candidates = Array.isArray(payload?.servers) ? payload.servers : [];

  return candidates.find((candidate) => candidate?.qualifiedName === qualifiedName);
}

function findSmitheryQualifiedSkill(payload, qualifiedName) {
  const candidates = Array.isArray(payload?.skills) ? payload.skills : [];

  return candidates.find((candidate) => `${candidate?.namespace}/${candidate?.slug}` === qualifiedName);
}

function matchesGlamaServer(candidate, context) {
  const candidateRepositoryUrl = normalizeUrl(candidate?.repository?.url);
  const sourceRepositoryUrl = normalizeUrl(context.serverJson?.repository?.url);

  if (candidateRepositoryUrl !== null && sourceRepositoryUrl !== null && candidateRepositoryUrl === sourceRepositoryUrl) {
    return true;
  }

  const names = [candidate?.name, candidate?.slug, candidate?.namespace]
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase());

  return names.some((value) => value.includes("debugbundle"));
}

async function verify(context) {
  const report = loadReport(context);
  report.verify = report.verify ?? {};
  report.verifiedAt = new Date().toISOString();

  for (const [targetKey, target] of context.targetEntries) {
    try {
      if (targetKey === "officialRegistry") {
        const payload = await fetchJson(
          `https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(context.serverJson.name)}&limit=10`
        );
        const entry = findOfficialRegistryEntry(payload, context.serverJson.name);
        report.verify.officialRegistry = entry === undefined
          ? {
              status: "missing",
              search: context.serverJson.name
            }
          : {
              status: "found",
              version: (entry.server ?? entry).version
            };
        continue;
      }

      if (targetKey === "smithery") {
        const qualifiedName = `${target.namespace}/${target.slug}`;
        const exactServer = await fetchOptionalJson(
          `https://api.smithery.ai/servers/${encodeURIComponent(target.namespace)}/${encodeURIComponent(target.slug)}`
        );
        const namespacePayload = await fetchJson(
          `https://api.smithery.ai/servers?namespace=${encodeURIComponent(target.namespace)}`
        );
        const namespaceEntry = findSmitheryQualifiedEntry(namespacePayload, qualifiedName);
        const latestConnection = Array.isArray(exactServer?.connections) ? exactServer.connections.at(0) : undefined;
        const registryIndexed = namespaceEntry !== undefined;
        report.verify.smithery = exactServer === undefined
          ? {
              status: "missing",
              qualifiedName,
              registryIndexed: false
            }
          : {
              status: registryIndexed ? "found" : "partial",
              qualifiedName,
              latestVersion: context.version,
              displayName: exactServer.displayName ?? null,
              description: exactServer.description ?? null,
              deploymentUrl: exactServer.deploymentUrl ?? null,
              bundleUrl: latestConnection?.bundleUrl ?? null,
              registryIndexed,
              releasePageUrl: `https://smithery.ai/servers/${qualifiedName}/releases`,
              publicPageUrl: `https://smithery.ai/servers/${qualifiedName}`
            };
        continue;
      }

      if (targetKey === "smitherySkill") {
        const qualifiedName = `${target.namespace}/${target.slug}`;
        const skill = await fetchOptionalJson(
          `https://api.smithery.ai/skills/${encodeURIComponent(target.namespace)}/${encodeURIComponent(target.slug)}`
        );
        const namespacePayload = await fetchJson(
          `https://api.smithery.ai/skills?namespace=${encodeURIComponent(target.namespace)}`
        );
        const namespaceEntry = findSmitheryQualifiedSkill(namespacePayload, qualifiedName);
        const registryIndexed = namespaceEntry !== undefined;
        report.verify.smitherySkill = {
          status: skill === undefined ? "missing" : registryIndexed ? "found" : "partial",
          qualifiedName,
          gitUrl: skill?.gitUrl ?? null,
          updatedAt: skill?.updatedAt ?? null,
          listed: skill?.listed ?? null,
          categories: Array.isArray(skill?.categories) ? skill.categories : [],
          registryIndexed,
          publicPageUrl: `https://smithery.ai/skills/${qualifiedName}`
        };
        continue;
      }

      if (targetKey === "clawhub") {
        const result = runCommand("npx", [
          "-y",
          `${target.cliPackage}@${target.cliVersion}`,
          "inspect",
          target.slug,
          "--json"
        ]);
        const payload = parseJsonFromCommandOutput(result.stdout);
        const skill = payload.skill;
        const latestVersion = payload.latestVersion;
        const owner = payload.owner;
        const moderation = payload.moderation;
        report.verify.clawhub = {
          status: skill === undefined ? "missing" : "found",
          slug: target.slug,
          pageUrl: `https://clawhub.ai/${target.owner}/${target.slug}`,
          owner: owner?.handle ?? null,
          latestVersion: latestVersion?.version ?? null,
          license: latestVersion?.license ?? null,
          moderationVerdict: moderation?.verdict ?? null,
          moderationSummary: moderation?.summary ?? null
        };
        continue;
      }

      if (targetKey === "clawhubPlugin") {
        const result = runCommand("npx", [
          "-y",
          `${target.cliPackage}@${target.cliVersion}`,
          "package",
          "inspect",
          target.packageName,
          "--files",
          "--json"
        ]);
        const payload = parseJsonFromCommandOutput(result.stdout);
        const packageRecord = payload.package ?? payload;
        const latestVersion = payload.latestVersion ?? payload.version;
        report.verify.clawhubPlugin = {
          status: packageRecord === undefined ? "missing" : "found",
          packageName: target.packageName,
          pluginId: target.pluginId,
          latestVersion: latestVersion?.version ?? null,
          files: Array.isArray(payload.version?.files) ? payload.version.files.map((file) => file.path) : null
        };
        continue;
      }

      if (targetKey === "glama") {
        const queries = Array.isArray(target.searchTerms) ? target.searchTerms : [];
        let matchedQuery = null;
        let matchedServer;

        for (const query of queries) {
          const payload = await fetchJson(`https://glama.ai/api/mcp/v1/servers?query=${encodeURIComponent(query)}`);
          const candidates = Array.isArray(payload?.servers) ? payload.servers : [];
          matchedServer = candidates.find((candidate) => matchesGlamaServer(candidate, context));
          if (matchedServer !== undefined) {
            matchedQuery = query;
            break;
          }
        }

        report.verify.glama = matchedServer === undefined
          ? {
              status: "missing",
              listingUrl: target.listingUrl,
              searchTerms: target.searchTerms,
              checkedAt: new Date().toISOString()
            }
          : {
              status: "found",
              listingUrl: target.listingUrl,
              searchTerms: target.searchTerms,
              matchedQuery,
              name: matchedServer.name ?? null,
              namespace: matchedServer.namespace ?? null,
              slug: matchedServer.slug ?? null,
              repositoryUrl: matchedServer.repository?.url ?? null,
              publicPageUrl: matchedServer.url ?? null
            };
        continue;
      }

      if (target.type === "discovery") {
        report.verify[targetKey] = {
          status: "manual_check_required",
          listingUrl: target.listingUrl,
          searchTerms: target.searchTerms
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (targetKey === "clawhub" && message.includes("Skill not found or unavailable")) {
        report.verify[targetKey] = {
          status: "missing",
          slug: `@${target.owner}/${target.slug}`
        };
        continue;
      }

      report.verify[targetKey] = {
        status: "verification_error",
        error: message
      };
    }
  }

  writeReport(context, report);
  return report;
}

function collectVerificationFailures(context, report) {
  const failures = [];

  for (const [targetKey, target] of context.targetEntries) {
    if (target.type !== "push") {
      continue;
    }

    const status = report.verify?.[targetKey]?.status;
    if (status !== "found") {
      failures.push(`${targetKey}:${status ?? "missing"}`);
    }
  }

  return failures;
}

function printHelp() {
  outputResult(
    [
      "Usage: node scripts/release-mcp-ecosystem.mjs <command> [options]",
      "",
      "Commands:",
      "  plan       Show the release plan",
      "  prepare    Build the MCPB bundle from the published npm artifact",
      "  publish    Publish the prepared bundle/metadata to ecosystem push targets",
      "  verify     Verify push targets and emit discovery follow-up checks",
      "  run        Run prepare + publish + verify",
      "",
      "Options:",
      "  --version <version>   Override the MCP package version (defaults to apps/mcp/package.json)",
      "  --targets <csv>       Limit execution to a subset of targets",
      "  --json                Emit JSON output",
      "  --dry-run             Print intended actions without mutating remote state"
    ].join("\n"),
    false
  );
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "help") {
    printHelp();
    return;
  }

  const manifest = readJson(manifestPath);
  const packageJson = readJson(join(repoRoot, manifest.package.packageJsonPath));
  const version = parsed.version ?? packageJson.version;
  const context = buildContext(manifest, version, parsed.targets);

  if (parsed.command === "plan") {
    outputResult(buildPlan(context), parsed.json);
    return;
  }

  if (parsed.command === "prepare") {
    outputResult(prepare(context, { dryRun: parsed.dryRun }), parsed.json);
    return;
  }

  if (parsed.command === "publish") {
    outputResult(await publish(context, { dryRun: parsed.dryRun }), parsed.json);
    return;
  }

  if (parsed.command === "verify") {
    const report = await verify(context);
    outputResult(report, parsed.json);
    const failures = collectVerificationFailures(context, report);
    if (failures.length > 0) {
      throw new Error(`verification_failed:${failures.join(",")}`);
    }
    return;
  }

  if (parsed.command === "run") {
    prepare(context, { dryRun: parsed.dryRun });
    await publish(context, { dryRun: parsed.dryRun });
    const report = await verify(context);
    outputResult(report, parsed.json);
    const failures = collectVerificationFailures(context, report);
    if (failures.length > 0) {
      throw new Error(`verification_failed:${failures.join(",")}`);
    }
    return;
  }

  throw new Error(`unknown_command:${parsed.command}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
