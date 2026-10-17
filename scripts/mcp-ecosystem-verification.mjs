export async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`http_${response.status}:${url}`);
  }
  return response.json();
}

export async function fetchText(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`http_${response.status}:${url}`);
  }
  return response.text();
}

export async function fetchOptionalJson(url, init) {
  const response = await fetch(url, init);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`http_${response.status}:${url}`);
  }
  return response.json();
}

export function findOfficialRegistryEntry(payload, serverName, version) {
  const candidates = Array.isArray(payload?.servers) ? payload.servers : [];
  const matchingCandidates = candidates.filter((candidate) => {
    const server = candidate?.server ?? candidate;
    return server?.name === serverName;
  });

  const latestMatchingCandidate = matchingCandidates.find((candidate) => {
    const server = candidate?.server ?? candidate;
    const metadata = candidate?._meta?.["io.modelcontextprotocol.registry/official"];
    return server?.version === version && metadata?.isLatest === true;
  });

  if (latestMatchingCandidate !== undefined) {
    return latestMatchingCandidate;
  }

  return (
    matchingCandidates.find((candidate) => {
      const server = candidate?.server ?? candidate;
      return server?.version === version;
    }) ??
    matchingCandidates.find((candidate) => {
      const metadata = candidate?._meta?.["io.modelcontextprotocol.registry/official"];
      return metadata?.isLatest === true;
    }) ??
    matchingCandidates.at(0)
  );
}

export function findSmitheryQualifiedEntry(payload, qualifiedName) {
  const candidates = Array.isArray(payload?.servers) ? payload.servers : [];
  return candidates.find((candidate) => candidate?.qualifiedName === qualifiedName);
}

export function findSmitheryQualifiedSkill(payload, qualifiedName) {
  const candidates = Array.isArray(payload?.skills) ? payload.skills : [];
  return candidates.find(
    (candidate) => `${candidate?.namespace}/${candidate?.slug}` === qualifiedName
  );
}

function normalizeUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value.replace(/\/+$/u, "").toLowerCase();
}

export function matchesGlamaServer(candidate, context) {
  const candidateRepositoryUrl = normalizeUrl(candidate?.repository?.url);
  const sourceRepositoryUrl = normalizeUrl(context.serverJson?.repository?.url);

  if (
    candidateRepositoryUrl !== null &&
    sourceRepositoryUrl !== null &&
    candidateRepositoryUrl === sourceRepositoryUrl
  ) {
    return true;
  }

  const names = [candidate?.name, candidate?.slug, candidate?.namespace]
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase());

  return names.some((value) => value.includes("debugbundle"));
}

export function findClawHubSearchRank(payload, slug) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const index = results.findIndex((candidate) => {
    const candidateSlug = candidate?.slug ?? candidate?.skill?.slug;
    return candidateSlug === slug;
  });

  return index === -1 ? null : index + 1;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function verifyClawHubDiscovery(target, dependencies = {}) {
  const queries = Array.isArray(target.discoveryQueries)
    ? target.discoveryQueries.filter(
        (entry) => typeof entry?.query === "string" && entry.query.length > 0
      )
    : [];
  const attempts = positiveInteger(target.discoveryVerification?.attempts, 6);
  const retryDelayMs = positiveInteger(target.discoveryVerification?.retryDelayMs, 5000);
  const limit = positiveInteger(target.discoveryVerification?.limit, 25);
  const fetcher = dependencies.fetchJson ?? fetchJson;
  const pause = dependencies.wait ?? wait;
  let discoveryChecks = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    discoveryChecks = await Promise.all(
      queries.map(async (entry) => {
        const maxRank = positiveInteger(entry.maxRank, limit);
        const payload = await fetcher(
          `https://clawhub.ai/api/v1/search?q=${encodeURIComponent(entry.query)}&limit=${limit}`
        );
        const rank = findClawHubSearchRank(payload, target.slug);

        return {
          query: entry.query,
          maxRank,
          rank,
          passed: rank !== null && rank <= maxRank
        };
      })
    );

    if (discoveryChecks.every((check) => check.passed)) {
      return { status: "found", discoveryChecks };
    }

    if (attempt < attempts) {
      await pause(retryDelayMs);
    }
  }

  return { status: "partial", discoveryChecks };
}

export function verificationTargetEntries(context) {
  const targets = new Map(context.targetEntries);
  // A partial publish must still verify both public ClawHub distributions.
  if (targets.has("clawhub") || targets.has("clawhubPlugin")) {
    for (const key of ["clawhub", "clawhubPlugin"]) {
      if (!targets.has(key))
        targets.set(key, context.manifest?.publishTargets?.[key] ?? { type: "push" });
    }
  }
  return [...targets];
}

export function collectVerificationFailures(context, report) {
  const failures = [];

  for (const [targetKey, target] of verificationTargetEntries(context)) {
    if (target.type !== "push") {
      continue;
    }

    const status = report.verify?.[targetKey]?.status;
    if (status !== "found") {
      failures.push(`${targetKey}:${status ?? "missing"}`);
      continue;
    }

    if (targetKey === "clawhub" || targetKey === "clawhubPlugin") {
      const expectedVersion = targetKey === "clawhub" ? context.clawhubVersion : context.version;
      const security = report.verify[targetKey].security;
      if (security?.passed !== true || security.version !== expectedVersion) {
        failures.push(`${targetKey}:security_not_passed`);
      }
    }

    if (
      targetKey === "officialRegistry" &&
      report.verify.officialRegistry.version !== context.version
    ) {
      failures.push(`${targetKey}:version_mismatch`);
    }

    // Smithery's public directory proves indexing but does not expose a release version.
    // Require this run's accepted write before treating an existing listing as an update.
    if (
      (targetKey === "smithery" || targetKey === "smitherySkill") &&
      report.publish?.[targetKey]?.status !== "published"
    ) {
      failures.push(`${targetKey}:unpublished`);
    }
  }

  return failures;
}

export function smitheryStdioDirectoryUrl(namespace) {
  // This release publishes MCPB/stdio; the directory otherwise defaults to remote servers.
  return `https://api.smithery.ai/servers?namespace=${encodeURIComponent(namespace)}&remote=false`;
}

export function verifyClawHubPluginRecord(payload, target, expectedVersion) {
  const packageRecord = payload.package;
  const latestVersion =
    payload.latestVersion?.version ??
    payload.version?.version ??
    packageRecord?.latestVersion ??
    null;
  const release = payload.version;
  const security = {
    version: release?.version ?? null,
    passed:
      release?.version === expectedVersion &&
      packageRecord?.scanStatus === "clean" &&
      release?.verification?.scanStatus === "clean" &&
      release?.llmAnalysis?.status === "clean" &&
      ["benign", "clean"].includes(release?.llmAnalysis?.verdict) &&
      release?.vtAnalysis?.status === "clean",
    scanStatus: release?.verification?.scanStatus ?? null,
    review: release?.llmAnalysis ?? null,
    antivirus: release?.vtAnalysis ?? null,
    staticScan: release?.staticScan ?? null,
    skillSpector: release?.skillSpectorAnalysis ?? null
  };
  return {
    status:
      packageRecord == null
        ? "missing"
        : latestVersion === expectedVersion && security.passed
          ? "found"
          : "partial",
    packageName: target.packageName,
    pluginId: target.pluginId,
    latestVersion,
    security,
    files: Array.isArray(payload.version?.files)
      ? payload.version.files.map((file) => file.path)
      : null
  };
}

export function verifyClawHubPlugin(target, expectedVersion, runCommand, parseJson) {
  const result = runCommand("npx", [
    "-y",
    `${target.cliPackage}@${target.cliVersion}`,
    "package",
    "inspect",
    target.packageName,
    "--version",
    expectedVersion,
    "--files",
    "--json"
  ]);
  return verifyClawHubPluginRecord(parseJson(result.stdout), target, expectedVersion);
}

export function verifyClawHubSkillRecord(payload, expectedVersion) {
  const release = payload.version;
  const moderation = payload.moderation;
  const review = release?.security;
  const security = {
    version: release?.version ?? null,
    passed:
      release?.version === expectedVersion &&
      review?.hasScanResult === true &&
      review?.status === "clean" &&
      review?.scanners?.vt?.status === "clean" &&
      review?.scanners?.llm?.status === "clean" &&
      ["benign", "clean"].includes(review?.scanners?.llm?.verdict) &&
      moderation?.verdict === "clean" &&
      moderation?.isSuspicious === false &&
      moderation?.isMalwareBlocked === false,
    review: review ?? null,
    moderation: moderation ?? null
  };
  return {
    status:
      payload.skill == null
        ? "missing"
        : payload.latestVersion?.version === expectedVersion && security.passed
          ? "found"
          : "partial",
    security
  };
}
