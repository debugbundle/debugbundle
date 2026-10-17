import {
  fetchJson,
  fetchOptionalJson,
  fetchText,
  findOfficialRegistryEntry,
  findSmitheryQualifiedEntry,
  findSmitheryQualifiedSkill,
  matchesGlamaServer,
  verifyClawHubDiscovery,
  smitheryStdioDirectoryUrl,
  verifyClawHubPlugin,
  verifyClawHubSkillRecord,
  verificationTargetEntries
} from "./mcp-ecosystem-verification.mjs";

export async function verifyTargets(context, report, { runCommand, parseJsonFromCommandOutput }) {
  report.verify = report.verify ?? {};
  report.verifiedAt = new Date().toISOString();

  for (const [targetKey, target] of verificationTargetEntries(context)) {
    try {
      if (targetKey === "officialRegistry") {
        const payload = await fetchJson(
          `https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(context.serverJson.name)}&limit=10`
        );
        const entry = findOfficialRegistryEntry(payload, context.serverJson.name, context.version);
        report.verify.officialRegistry =
          entry === undefined
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
        const namespacePayload = await fetchJson(smitheryStdioDirectoryUrl(target.namespace));
        const namespaceEntry = findSmitheryQualifiedEntry(namespacePayload, qualifiedName);
        const latestConnection = Array.isArray(exactServer?.connections)
          ? exactServer.connections.at(0)
          : undefined;
        const registryIndexed = namespaceEntry !== undefined;
        report.verify.smithery =
          exactServer === undefined
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
          expectedCatalog: target.catalog ?? null,
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
          "--version",
          context.clawhubVersion,
          "--json"
        ]);
        const payload = parseJsonFromCommandOutput(result.stdout);
        const skill = payload.skill;
        const latestVersion = payload.latestVersion;
        const owner = payload.owner;
        const moderation = payload.moderation;
        const acceptance = verifyClawHubSkillRecord(payload, context.clawhubVersion);
        const discovery =
          skill === undefined
            ? { status: "missing", discoveryChecks: [] }
            : await verifyClawHubDiscovery(target);
        report.verify.clawhub = {
          status: acceptance.status === "found" ? discovery.status : acceptance.status,
          security: acceptance.security,
          slug: target.slug,
          pageUrl: `https://clawhub.ai/${target.owner}/skills/${target.slug}`,
          owner: owner?.handle ?? null,
          expectedVersion: context.clawhubVersion,
          latestVersion: latestVersion?.version ?? null,
          license: latestVersion?.license ?? null,
          expectedCatalog: target.catalog ?? null,
          moderationVerdict: moderation?.verdict ?? null,
          moderationSummary: moderation?.summary ?? null,
          discoveryChecks: discovery.discoveryChecks
        };
        continue;
      }

      if (targetKey === "clawhubPlugin") {
        report.verify.clawhubPlugin = verifyClawHubPlugin(
          target,
          context.version,
          runCommand,
          parseJsonFromCommandOutput
        );
        continue;
      }

      if (targetKey === "glama") {
        const queries = Array.isArray(target.searchTerms) ? target.searchTerms : [];
        let matchedQuery = null;
        let matchedServer;

        for (const query of queries) {
          const payload = await fetchJson(
            `https://glama.ai/api/mcp/v1/servers?query=${encodeURIComponent(query)}`
          );
          const candidates = Array.isArray(payload?.servers) ? payload.servers : [];
          matchedServer = candidates.find((candidate) => matchesGlamaServer(candidate, context));
          if (matchedServer !== undefined) {
            matchedQuery = query;
            break;
          }
        }

        report.verify.glama =
          matchedServer === undefined
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

      if (targetKey === "pulseMcp") {
        let html = null;
        let fetchError = null;
        try {
          html = await fetchText(target.listingUrl);
        } catch (error) {
          fetchError = error instanceof Error ? error.message : String(error);
        }
        if (fetchError !== null) {
          report.verify.pulseMcp = {
            status: "manual_check_required",
            listingUrl: target.listingUrl,
            searchTerms: target.searchTerms,
            reason: fetchError
          };
          continue;
        }

        const found =
          html.includes(context.serverJson.name) && html.toLowerCase().includes("debugbundle");
        report.verify.pulseMcp = found
          ? {
              status: "found",
              listingUrl: target.listingUrl,
              serverName: context.serverJson.name
            }
          : {
              status: "missing",
              listingUrl: target.listingUrl,
              searchTerms: target.searchTerms,
              checkedAt: new Date().toISOString()
            };
        continue;
      }

      if (targetKey === "mcpSo") {
        const html = await fetchText(target.listingUrl);
        const found =
          html.includes(context.packageJson.name) && html.toLowerCase().includes("debugbundle");
        report.verify.mcpSo = found
          ? {
              status: "found",
              listingUrl: target.listingUrl,
              packageName: context.packageJson.name
            }
          : {
              status: "missing",
              listingUrl: target.listingUrl,
              searchTerms: target.searchTerms,
              checkedAt: new Date().toISOString()
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

  return report;
}
