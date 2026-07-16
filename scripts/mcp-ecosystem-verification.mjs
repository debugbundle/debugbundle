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

export function collectVerificationFailures(context, report) {
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
