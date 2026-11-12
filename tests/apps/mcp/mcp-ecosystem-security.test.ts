import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type VerificationHelpers = {
  verifyClawHubPluginRecord: (
    payload: unknown,
    target: unknown,
    version: string
  ) => { status: string };
  verifyClawHubSkillRecord: (payload: unknown, version: string) => { status: string };
  collectVerificationFailures: (context: unknown, report: unknown) => string[];
};
type TargetVerifier = {
  verifyTargets: (
    context: unknown,
    report: unknown,
    dependencies: {
      runCommand: (command: string, args: string[]) => { stdout: string };
      parseJsonFromCommandOutput: (value: string) => unknown;
    }
  ) => Promise<{
    verify: {
      clawhub: { security: { passed: boolean } };
      clawhubPlugin: { security: { passed: boolean } };
    };
  }>;
};

const helperUrl = pathToFileURL(join(process.cwd(), "scripts/mcp-ecosystem-verification.mjs")).href;
const target = { packageName: "@debugbundle/openclaw-plugin", pluginId: "debugbundle" };
const version = "1.16.0";

function pluginRecord() {
  return {
    package: { name: target.packageName, scanStatus: "clean" },
    latestVersion: { version },
    version: {
      version,
      files: [],
      verification: { scanStatus: "clean" },
      llmAnalysis: { status: "clean", verdict: "benign" }
    }
  };
}

function skillRecord() {
  return {
    skill: { slug: "debugbundle" },
    latestVersion: { version },
    moderation: { verdict: "clean", isSuspicious: false, isMalwareBlocked: false },
    version: {
      version,
      security: {
        status: "clean",
        hasScanResult: true,
        scanners: { llm: { status: "clean", verdict: "benign" } }
      }
    }
  };
}

describe("ClawHub release security acceptance", () => {
  it("rejects plugin Review, pending, missing and stale exact-version audits", async () => {
    const { verifyClawHubPluginRecord } = (await import(helperUrl)) as VerificationHelpers;
    expect(verifyClawHubPluginRecord(pluginRecord(), target, version).status).toBe("found");
    for (const status of ["suspicious", "pending", "malicious", "unknown"]) {
      const payload = pluginRecord();
      payload.version.verification.scanStatus = status;
      expect(verifyClawHubPluginRecord(payload, target, version).status).toBe("partial");
    }
    for (const field of ["verification", "llmAnalysis"]) {
      const payload = pluginRecord();
      Reflect.deleteProperty(payload.version, field);
      expect(verifyClawHubPluginRecord(payload, target, version).status).toBe("partial");
    }
    const stale = pluginRecord();
    stale.version.version = "1.15.0";
    expect(verifyClawHubPluginRecord(stale, target, version).status).toBe("partial");
    const flagged = pluginRecord();
    flagged.version.llmAnalysis.status = "suspicious";
    expect(verifyClawHubPluginRecord(flagged, target, version).status).toBe("partial");
  });

  it("records provider retirement without fabricating an antivirus pass", async () => {
    const { verifyClawHubPluginRecord, verifyClawHubSkillRecord } = (await import(
      helperUrl
    )) as VerificationHelpers;
    for (const result of [
      verifyClawHubPluginRecord(pluginRecord(), target, version),
      verifyClawHubSkillRecord(skillRecord(), version)
    ]) {
      expect(result).toMatchObject({
        status: "found",
        security: {
          auditProvider: "ClawScan",
          antivirusRetirement: {
            provider: "VirusTotal",
            status: "retired",
            verifiedAt: "2026-11-12"
          }
        }
      });
    }
  });

  it("retains fail-closed handling for adverse historical antivirus evidence", async () => {
    const { verifyClawHubPluginRecord, verifyClawHubSkillRecord } = (await import(
      helperUrl
    )) as VerificationHelpers;
    for (const status of ["suspicious", "pending", "malicious", "failed", "unknown"]) {
      const plugin = pluginRecord();
      const skill = skillRecord();
      expect(
        verifyClawHubPluginRecord(
          { ...plugin, version: { ...plugin.version, vtAnalysis: { status } } },
          target,
          version
        ).status
      ).toBe("partial");
      expect(
        verifyClawHubSkillRecord(
          {
            ...skill,
            version: {
              ...skill.version,
              security: {
                ...skill.version.security,
                scanners: { ...skill.version.security.scanners, vt: { status } }
              }
            }
          },
          version
        ).status
      ).toBe("partial");
    }
  });

  it("requires active final reviews and moderation even after antivirus retirement", async () => {
    const { verifyClawHubPluginRecord, verifyClawHubSkillRecord } = (await import(
      helperUrl
    )) as VerificationHelpers;
    for (const status of ["pending", "suspicious", "failed", "unknown"]) {
      const plugin = pluginRecord();
      plugin.version.llmAnalysis.status = status;
      expect(verifyClawHubPluginRecord(plugin, target, version).status).toBe("partial");
      const skill = skillRecord();
      skill.version.security.scanners.llm.status = status;
      expect(verifyClawHubSkillRecord(skill, version).status).toBe("partial");
    }
    const missingReview = skillRecord();
    Reflect.deleteProperty(missingReview.version.security.scanners, "llm");
    expect(verifyClawHubSkillRecord(missingReview, version).status).toBe("partial");
    const missingModeration = skillRecord();
    Reflect.deleteProperty(missingModeration, "moderation");
    expect(verifyClawHubSkillRecord(missingModeration, version).status).toBe("partial");
    const rejected = pluginRecord();
    rejected.version.llmAnalysis.verdict = "malicious";
    expect(verifyClawHubPluginRecord(rejected, target, version).status).toBe("partial");
  });

  it("requires a completed clean exact-version skill review and unblocked moderation", async () => {
    const { verifyClawHubSkillRecord } = (await import(helperUrl)) as VerificationHelpers;
    expect(verifyClawHubSkillRecord(skillRecord(), version).status).toBe("found");
    for (const status of ["suspicious", "pending", "malicious", "unknown"]) {
      const payload = skillRecord();
      payload.version.security.status = status;
      expect(verifyClawHubSkillRecord(payload, version).status).toBe("partial");
    }
    const incomplete = skillRecord();
    incomplete.version.security.hasScanResult = false;
    expect(verifyClawHubSkillRecord(incomplete, version).status).toBe("partial");
    const blocked = skillRecord();
    blocked.moderation.isMalwareBlocked = true;
    expect(verifyClawHubSkillRecord(blocked, version).status).toBe("partial");
    const stale = skillRecord();
    stale.version.version = "1.15.0";
    expect(verifyClawHubSkillRecord(stale, version).status).toBe("partial");
    const missing = skillRecord();
    Reflect.deleteProperty(missing, "version");
    expect(verifyClawHubSkillRecord(missing, version).status).toBe("partial");
  });

  it("does not accept old reports that only verified publication", async () => {
    const { collectVerificationFailures } = (await import(helperUrl)) as VerificationHelpers;
    const context = {
      version,
      clawhubVersion: version,
      targetEntries: [
        ["clawhub", { type: "push" }],
        ["clawhubPlugin", { type: "push" }]
      ]
    };
    const report = { verify: { clawhub: { status: "found" }, clawhubPlugin: { status: "found" } } };
    expect(collectVerificationFailures(context, report)).toEqual([
      "clawhub:security_not_passed",
      "clawhubPlugin:security_not_passed"
    ]);
    context.targetEntries = [["clawhubPlugin", { type: "push" }]];
    expect(collectVerificationFailures(context, report)).toEqual([
      "clawhubPlugin:security_not_passed",
      "clawhub:security_not_passed"
    ]);
  });

  it("verifies both exact versions after a plugin-only publication and fails on Review", async () => {
    const { collectVerificationFailures } = (await import(helperUrl)) as VerificationHelpers;
    const { verifyTargets } = (await import(
      pathToFileURL(join(process.cwd(), "scripts/mcp-ecosystem-target-verification.mjs")).href
    )) as TargetVerifier;
    const skillTarget = {
      type: "push",
      slug: "debugbundle",
      owner: "debugbundle",
      cliPackage: "clawhub",
      cliVersion: "0.22.0",
      discoveryQueries: []
    };
    const pluginTarget = { ...target, type: "push", cliPackage: "clawhub", cliVersion: "0.22.0" };
    const context = {
      version,
      clawhubVersion: version,
      targetEntries: [["clawhubPlugin", pluginTarget]],
      manifest: { publishTargets: { clawhub: skillTarget, clawhubPlugin: pluginTarget } }
    };
    const calls: string[][] = [];
    const reviewedPlugin = pluginRecord();
    reviewedPlugin.version.llmAnalysis.status = "suspicious";
    const dependencies = {
      runCommand: (_command: string, args: string[]) => {
        calls.push(args);
        return {
          stdout: JSON.stringify(args.includes("package") ? reviewedPlugin : skillRecord())
        };
      },
      parseJsonFromCommandOutput: JSON.parse
    };
    const report = await verifyTargets(context, {}, dependencies);
    expect(calls).toHaveLength(2);
    for (const args of calls) expect(args[args.indexOf("--version") + 1]).toBe(version);
    expect(report.verify.clawhub.security.passed).toBe(true);
    expect(report.verify.clawhubPlugin.security.passed).toBe(false);
    expect(collectVerificationFailures(context, report)).toEqual(["clawhubPlugin:partial"]);
    reviewedPlugin.version.llmAnalysis.status = "clean";
    const passing = await verifyTargets(context, {}, dependencies);
    expect(collectVerificationFailures(context, passing)).toEqual([]);
  });
});
