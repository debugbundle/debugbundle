import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const packageRoot = join(repoRoot, "apps", "openclaw-plugin");

describe("openclaw plugin package", () => {
  it("defines a publishable OpenClaw plugin package under the DebugBundle namespace", () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
      private?: boolean;
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
    expect(packageJson.version).toBe("1.6.2");
    expect(packageJson.private).toBe(false);
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
      activation?: { onStartup?: boolean };
      configSchema?: Record<string, unknown>;
      contracts?: { tools?: string[] };
    };

    expect(readme).toContain("openclaw plugins install clawhub:@debugbundle/openclaw-plugin");
    expect(readme).toContain("DEBUGBUNDLE_MEMBER_TOKEN");
    expect(readme).toContain("debugbundle_list_incidents");
    expect(license).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(manifest.id).toBe("debugbundle");
    expect(manifest.activation).toEqual({ onStartup: true });
    expect(manifest.configSchema).toMatchObject({
      type: "object",
      additionalProperties: false
    });
    expect(manifest.contracts?.tools).toContain("debugbundle_list_incidents");
    expect(manifest.contracts?.tools).toContain("debugbundle_get_bundle");
    expect(manifest.contracts?.tools).toContain("debugbundle_resolve_incident");
  });
});
