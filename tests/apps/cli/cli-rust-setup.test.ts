import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setupCommand } from "../../../apps/cli/src/setup-command.js";
import type { DetectedService } from "../../../apps/cli/src/setup-service-discovery.js";
import type { RelayGuidance } from "../../../apps/cli/src/setup-relay-guidance.js";
import { ProfileSchema } from "../../../packages/shared-types/src/project-profile.js";
type Output = {
  detected_services: DetectedService[];
  relay_guidance: RelayGuidance[];
  suggested_actions: string[];
};

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-rust-setup-"));
  roots.push(root);
  return root;
}
async function file(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

describe("Rust CLI setup", () => {
  it("profiles a standalone Cargo app and gives Cargo workflows without altering its source", async () => {
    const root = await fixture();
    const manifest =
      '[package]\nname="checkout-api"\nversion="0.1.0"\n[dependencies]\naxum="0.8"\n';
    const source = "fn main() {}\n";
    await file(root, "Cargo.toml", manifest);
    await file(root, "Cargo.lock", "version = 4\n");
    await file(root, "src/main.rs", source);
    const result = await setupCommand({ json: true }, { cwd: () => root });
    const output = JSON.parse(result.output) as Output;
    expect(result.exitCode).toBe(0);
    expect(output.suggested_actions.join("\n")).toContain('version = "1.0.0"');
    expect(output.suggested_actions.join("\n")).not.toMatch(
      /unpublished|locally qualified.*candidate/i
    );
    expect(output.detected_services).toEqual([
      expect.objectContaining({
        name: "checkout-api",
        kind: "backend",
        runtime: "Rust",
        framework: "Axum",
        paths: ["."]
      })
    ]);
    const profile = ProfileSchema.parse(
      JSON.parse(await readFile(join(root, ".debugbundle/profile.json"), "utf8"))
    );
    expect(profile.project.primary_languages).toContain("Rust");
    expect(profile.project.package_managers).toContain("cargo");
    expect(output.suggested_actions.some((line) => line.includes("client.tracing_layer()"))).toBe(
      true
    );
    expect(
      output.suggested_actions.some((line) => line.includes("debugbundle::axum::DebugBundleLayer"))
    ).toBe(true);
    expect(profile.developer_workflows).toEqual({
      install: "cargo fetch --locked",
      build: "cargo build",
      test: "cargo test",
      lint: "cargo clippy --all-targets"
    });
    expect(await readFile(join(root, "Cargo.toml"), "utf8")).toBe(manifest);
    expect(await readFile(join(root, "src/main.rs"), "utf8")).toBe(source);
  });
  it.each([
    ["axum", "Axum", ".merge(debugbundle::axum::browser_relay"],
    ["actix-web", "Actix Web", ".service(debugbundle::actix_web::browser_relay"]
  ])(
    "guides a browser plus %s workspace with an instruction-only native relay",
    async (dependency, framework, registration) => {
      const root = await fixture();
      await file(root, "Cargo.toml", '[workspace]\nmembers=["services/api"]\n');
      await file(
        root,
        "services/api/Cargo.toml",
        `[package]\nname="checkout-web"\nversion="0.1.0"\n[dependencies]\n${dependency}="${dependency === "axum" ? "0.8" : "4"}"\n`
      );
      const source = "fn main() {}\n";
      await file(root, "services/api/src/main.rs", source);
      await file(
        root,
        "apps/frontend/package.json",
        JSON.stringify({
          name: "checkout-frontend",
          dependencies: { vite: "^8", "@debugbundle/sdk-browser": "^3" }
        })
      );
      const result = await setupCommand({ json: true }, { cwd: () => root });
      const output = JSON.parse(result.output) as Output;
      expect(result.exitCode).toBe(0);
      expect(
        output.detected_services.filter(
          (service: { runtime: string }) => service.runtime === "Rust"
        )
      ).toEqual([
        expect.objectContaining({
          name: "checkout-web",
          kind: "backend",
          framework,
          paths: ["services/api"]
        })
      ]);
      const guidance = output.relay_guidance.find(
        (entry: { runtime: string }) => entry.runtime === "Rust"
      );
      expect(guidance?.action).toBe("instructions");
      expect(guidance?.route_path).toBe("/debugbundle/browser");
      expect(guidance?.instructions.some((line: string) => line.includes(registration))).toBe(true);
      expect(guidance?.instructions.join("\n")).toContain("debugbundle 1.0.0");
      expect(guidance?.instructions.join("\n")).not.toMatch(/unpublished|SDK candidate/i);
      expect(
        output.suggested_actions.some((line) =>
          line.includes(dependency === "axum" ? "DebugBundleLayer" : "DebugBundleMiddleware")
        )
      ).toBe(true);
      expect(await readFile(join(root, "services/api/src/main.rs"), "utf8")).toBe(source);
    }
  );
});

const legacyCases: Array<{
  label: string;
  runtime: string;
  framework: string;
  files: Record<string, string>;
}> = [
  {
    label: "Rails Gemfile",
    runtime: "Ruby",
    framework: "Rails",
    files: { Gemfile: 'gem "rails"\n' }
  },
  { label: "Rack Gemfile", runtime: "Ruby", framework: "Rack", files: { Gemfile: 'gem "rack"\n' } },
  {
    label: "Rack entrypoint",
    runtime: "Ruby",
    framework: "Rack",
    files: { Gemfile: 'gem "sinatra"\n', "config.ru": "run App\n" }
  },
  {
    label: "plain Ruby",
    runtime: "Ruby",
    framework: "unknown",
    files: { Gemfile: 'gem "sinatra"\n' }
  },
  {
    label: "Spring Maven",
    runtime: "Java",
    framework: "Spring Boot",
    files: { "pom.xml": "<project><dependency>spring-boot-starter-web</dependency></project>" }
  },
  {
    label: "Spring Gradle",
    runtime: "Java",
    framework: "Spring Boot",
    files: {
      "build.gradle":
        "dependencies { implementation 'org.springframework.boot:spring-boot-starter-web:4.0.0' }"
    }
  },
  {
    label: "Spring Kotlin Gradle",
    runtime: "Java",
    framework: "Spring Boot",
    files: {
      "build.gradle.kts":
        'dependencies { implementation("org.springframework.boot:spring-boot-starter-web:4.0.0") }'
    }
  },
  {
    label: "Servlet",
    runtime: "Java",
    framework: "Servlet",
    files: { "pom.xml": "<project />", "src/main/webapp/WEB-INF/web.xml": "<web-app />" }
  },
  {
    label: "plain Java",
    runtime: "Java",
    framework: "unknown",
    files: { "pom.xml": "<project />" }
  }
];

it.each(legacyCases)(
  "preserves $label discovery beside a Cargo service without rewriting manifests",
  async ({ runtime, framework, files }) => {
    const root = await fixture();
    const cargo = '[package]\nname="rust-api"\nversion="0.1.0"\n[dependencies]\naxum="0.8"\n';
    await file(root, "Cargo.toml", cargo);
    await file(root, "src/main.rs", "fn main() {}\n");
    for (const [path, contents] of Object.entries(files))
      await file(root, `apps/legacy-api/${path}`, contents);
    const result = await setupCommand({ json: true }, { cwd: () => root });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.output) as Output;
    expect(output.detected_services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "rust-api",
          runtime: "Rust",
          framework: "Axum",
          paths: ["."]
        }),
        expect.objectContaining({ runtime, framework, paths: ["apps/legacy-api"] })
      ])
    );
    expect(await readFile(join(root, "Cargo.toml"), "utf8")).toBe(cargo);
    for (const [path, contents] of Object.entries(files))
      expect(await readFile(join(root, "apps/legacy-api", path), "utf8")).toBe(contents);
  }
);
