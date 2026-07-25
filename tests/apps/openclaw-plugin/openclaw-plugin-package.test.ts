import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES,
  DEBUGBUNDLE_OPENCLAW_TOOL_NAMES
} from "../../../apps/openclaw-plugin/src/index.js";

const repoRoot = process.cwd();
const packageRoot = join(repoRoot, "apps", "openclaw-plugin");

describe("openclaw plugin package", () => {
  it("defines a publishable OpenClaw plugin package under the DebugBundle namespace", () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
      private?: boolean;
      description?: string;
      keywords?: string[];
      license?: string;
      repository?: { type?: string; url?: string; directory?: string };
      engines?: Record<string, string>;
      scripts?: Record<string, string>;
      files?: string[];
      openclaw?: {
        extensions?: string[];
        compat?: Record<string, string>;
        build?: Record<string, string>;
        install?: Record<string, string>;
      };
    };

    expect(packageJson.name).toBe("@debugbundle/openclaw-plugin");
    expect(packageJson.version).toBe("1.7.1");
    expect(packageJson.private).toBe(false);
    expect(packageJson.description).toBe(
      "OpenClaw tools for runtime error reporting, incident response, live app monitoring, health checks, debug bundles, and product analytics."
    );
    expect(packageJson.keywords).toEqual(expect.arrayContaining([
      "error-reporting",
      "crash-reporting",
      "runtime-errors",
      "incident-response",
      "production-monitoring",
      "health-checks",
      "product-analytics"
    ]));
    expect(packageJson.license).toBe("AGPL-3.0-only");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "https://github.com/debugbundle/debugbundle",
      directory: "apps/openclaw-plugin"
    });
    expect(packageJson.engines).toEqual({ node: ">=22 <27" });
    expect(packageJson.files).toEqual(["dist", "openclaw.plugin.json", "README.md", "LICENSE"]);
    expect(packageJson.scripts).toMatchObject({
      build: expect.stringContaining("esbuild src/index.ts"),
      "plugin:build": "openclaw plugins build --entry ./dist/index.js",
      "plugin:validate": "openclaw plugins validate --root . --entry ./dist/index.js",
      "plugin:check": expect.stringContaining("openclaw plugins build --entry ./dist/index.js --check")
    });
    expect(packageJson.openclaw).toMatchObject({
      extensions: ["./dist/index.js"],
      compat: {
        pluginApi: ">=2026.5.17",
        minGatewayVersion: "2026.5.17"
      },
      build: {
        openclawVersion: "2026.6.9",
        pluginSdkVersion: "2026.6.9"
      },
      install: {
        clawhubSpec: "@debugbundle/openclaw-plugin",
        defaultChoice: "clawhub",
        minHostVersion: ">=2026.6.9"
      }
    });
  });

  it("ships package-level documentation, license, and generated OpenClaw manifest", () => {
    expect(existsSync(join(packageRoot, "README.md"))).toBe(true);
    expect(existsSync(join(packageRoot, "LICENSE"))).toBe(true);
    expect(existsSync(join(packageRoot, "openclaw.plugin.json"))).toBe(true);

    const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
    const license = readFileSync(join(packageRoot, "LICENSE"), "utf8");
    const manifest = JSON.parse(readFileSync(join(packageRoot, "openclaw.plugin.json"), "utf8")) as {
      id?: string;
      description?: string;
      activation?: { onStartup?: boolean };
      configSchema?: Record<string, unknown>;
      contracts?: { tools?: string[] };
      toolMetadata?: Record<string, { optional?: boolean }>;
    };

    expect(readme).toContain("openclaw plugins install clawhub:@debugbundle/openclaw-plugin");
    expect(readme).toContain("DEBUGBUNDLE_MEMBER_TOKEN");
    expect(readme).toContain("debugbundle_list_incidents");
    expect(readme).toContain("debugbundle_get_usage_summary");
    expect(readme).toContain("debugbundle_get_funnel_analysis");
    expect(readme).toContain("debugbundle_generate_analytics_bundle");
    expect(license).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(manifest.id).toBe("debugbundle");
    expect(manifest.description).toBe(
      "Use DebugBundle for runtime error reporting, incident response, live app monitoring, health checks, debug bundles, and product analytics."
    );
    expect(manifest.activation).toEqual({ onStartup: true });
    expect(manifest.configSchema).toMatchObject({
      type: "object",
      additionalProperties: false
    });
    expect(manifest.contracts?.tools).toContain("debugbundle_list_incidents");
    expect(manifest.contracts?.tools).toContain("debugbundle_get_bundle");
    expect(manifest.contracts?.tools).toContain("debugbundle_resolve_incident");
    expect(manifest.contracts?.tools).toContain("debugbundle_get_usage_summary");
    expect(manifest.contracts?.tools).toContain("debugbundle_get_funnel_analysis");
    expect(manifest.contracts?.tools).toContain("debugbundle_generate_analytics_bundle");
    expect(manifest.contracts?.tools).toContain("debugbundle_update_analytics_settings");
    expect(manifest.contracts?.tools).toContain("debugbundle_create_saved_analytics_funnel");
    expect(manifest.contracts?.tools).toEqual(DEBUGBUNDLE_OPENCLAW_TOOL_NAMES);
    expect(Object.keys(manifest.toolMetadata ?? {})).toEqual(DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES);
    expect(manifest.toolMetadata?.["debugbundle_generate_analytics_bundle"]).toEqual({ optional: true });
    expect(manifest.toolMetadata?.["debugbundle_update_analytics_settings"]).toEqual({ optional: true });
    expect(manifest.toolMetadata?.["debugbundle_create_saved_analytics_funnel"]).toEqual({ optional: true });
    expect(manifest.toolMetadata?.["debugbundle_get_usage_summary"]).toBeUndefined();
  });

  it("does not bundle synthetic bearer credentials that trigger marketplace secret scans", () => {
    const doctorSource = readFileSync(join(repoRoot, "apps", "cli", "src", "doctor-command.ts"), "utf8");
    const previewStart = doctorSource.indexOf("function buildPrivacyPreview()");
    const previewEnd = doctorSource.indexOf("async function buildFileCheck", previewStart);
    const privacyPreviewSource = doctorSource.slice(previewStart, previewEnd);

    expect(previewStart).toBeGreaterThan(-1);
    expect(previewEnd).toBeGreaterThan(previewStart);
    expect(privacyPreviewSource).not.toMatch(/\b(?:authorization|cookie|password|card_number|otp):\s*["'`]/iu);
  });
});
