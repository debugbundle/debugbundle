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
      llmAnalysis: { status: "clean", verdict: "benign" },
      vtAnalysis: { status: "clean" },
      staticScan: { status: "clean", findings: [] }
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
        scanners: { vt: { status: "clean" }, llm: { status: "clean", verdict: "benign" } }
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
    for (const field of ["verification", "llmAnalysis", "vtAnalysis"]) {
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
