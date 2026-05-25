import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { setupCommand } from "../../../apps/cli/src/setup-command.js";

async function createRelayFixtureRepository(input: { framework: "fastify" | "express" | "nextjs" }): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), `debugbundle-setup-relay-${input.framework}-`));

  if (input.framework === "nextjs") {
    await mkdir(join(rootDirectory, "app"), { recursive: true });
  } else {
    await mkdir(join(rootDirectory, "src"), { recursive: true });
  }

  const dependencies =
    input.framework === "fastify"
      ? {
          fastify: "^5.0.0",
          "@debugbundle/sdk-node": "^0.1.0",
          "@debugbundle/sdk-browser": "^0.1.0"
        }
      : input.framework === "express"
        ? {
            express: "^5.0.0",
            "@debugbundle/sdk-node": "^0.1.0",
            "@debugbundle/sdk-browser": "^0.1.0"
          }
        : {
            next: "^16.0.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
            "@debugbundle/sdk-node": "^0.1.0",
            "@debugbundle/sdk-browser": "^0.1.0"
          };

  await writeFile(
    join(rootDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: `relay-${input.framework}-app`,
        packageManager: "pnpm@10.32.1",
        dependencies
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  if (input.framework === "fastify") {
    await writeFile(
      join(rootDirectory, "src", "server.ts"),
      [
        'import Fastify from "fastify";',
        "",
        "export function buildServer() {",
        "  const app = Fastify();",
        "  app.get('/health', async () => ({ ok: true }));",
        "  return app;",
        "}"
      ].join("\n") + "\n",
      "utf8"
    );
  }

  if (input.framework === "express") {
    await writeFile(
      join(rootDirectory, "src", "server.ts"),
      [
        'import express from "express";',
        "",
        "export function buildServer() {",
        "  const app = express();",
        "  app.get('/health', (_request, response) => {",
        "    response.json({ ok: true });",
        "  });",
        "  return app;",
        "}"
      ].join("\n") + "\n",
      "utf8"
    );
  }

  return rootDirectory;
}

async function createRelayFallbackRepository(input: { framework: "fastify" | "express" | "nextjs" }): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), `debugbundle-setup-relay-fallback-${input.framework}-`));

  if (input.framework !== "nextjs") {
    await mkdir(join(rootDirectory, "src"), { recursive: true });
  }

  const dependencies =
    input.framework === "fastify"
      ? {
          fastify: "^5.0.0",
          "@debugbundle/sdk-node": "^0.1.0",
          "@debugbundle/sdk-browser": "^0.1.0"
        }
      : input.framework === "express"
        ? {
            express: "^5.0.0",
            "@debugbundle/sdk-node": "^0.1.0",
            "@debugbundle/sdk-browser": "^0.1.0"
          }
        : {
            next: "^16.0.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
            "@debugbundle/sdk-node": "^0.1.0",
            "@debugbundle/sdk-browser": "^0.1.0"
          };

  await writeFile(
    join(rootDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: `relay-fallback-${input.framework}-app`,
        packageManager: "pnpm@10.32.1",
        dependencies
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  if (input.framework === "fastify") {
    await writeFile(
      join(rootDirectory, "src", "server.ts"),
      ["const server = Fastify();", "server.get('/health', async () => ({ ok: true }));", "export { server };"]
        .join("\n") + "\n",
      "utf8"
    );
  }

  if (input.framework === "express") {
    await writeFile(
      join(rootDirectory, "src", "server.ts"),
      [
        "const server = express();",
        "server.get('/health', (_request, response) => {",
        "  response.json({ ok: true });",
        "});",
        "export { server };"
      ].join("\n") + "\n",
      "utf8"
    );
  }

  return rootDirectory;
}

async function createMixedRuntimeFixtureRepository(input: { pythonBackend?: boolean; scafoldableNodeBackend?: boolean } = {}): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-setup-mixed-runtime-"));

  await mkdir(join(rootDirectory, "backend", "src"), { recursive: true });
  await mkdir(join(rootDirectory, "frontend", "src"), { recursive: true });
  await mkdir(join(rootDirectory, "worker"), { recursive: true });

  await writeFile(
    join(rootDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "mixed-runtime-platform",
        packageManager: "pnpm@10.32.1",
        scripts: {
          build: "pnpm -r build",
          test: "pnpm -r test",
          lint: "pnpm -r lint"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(join(rootDirectory, "pnpm-workspace.yaml"), 'packages:\n  - "backend"\n  - "frontend"\n', "utf8");
  await writeFile(join(rootDirectory, "docker-compose.yml"), "services:\n  redis:\n    image: redis:7\n", "utf8");

  if (input.pythonBackend === true) {
    await writeFile(join(rootDirectory, "backend", "requirements.txt"), "fastapi==0.115.0\n", "utf8");
  } else {
    await writeFile(
      join(rootDirectory, "backend", "package.json"),
      `${JSON.stringify(
        {
          name: "backend-service",
          dependencies: {
            fastify: "^5.0.0",
            "@debugbundle/sdk-node": "^0.1.0"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(join(rootDirectory, "backend", "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n', "utf8");
    await writeFile(
      join(rootDirectory, "backend", "src", "server.ts"),
      input.scafoldableNodeBackend === true
        ? ['import Fastify from "fastify";', '', 'export function buildServer() {', '  const app = Fastify();', '  return app;', '}'].join("\n") + "\n"
        : "export const backend = true;\n",
      "utf8"
    );
  }

  await writeFile(
    join(rootDirectory, "frontend", "package.json"),
    `${JSON.stringify(
      {
        name: "frontend-app",
        dependencies: {
          vite: "^6.0.0",
          react: "^19.0.0",
          "@debugbundle/sdk-browser": "^0.1.0"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(join(rootDirectory, "frontend", "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n', "utf8");
  await writeFile(join(rootDirectory, "frontend", "vite.config.ts"), "export default {};\n", "utf8");

  await writeFile(join(rootDirectory, "worker", "requirements.txt"), "fastapi==0.115.0\n", "utf8");

  return rootDirectory;
}

async function createWordPressRelayFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-setup-wordpress-relay-"));

  await mkdir(join(rootDirectory, "wordpress", "wp-content", "plugins", "debugbundle"), { recursive: true });
  await mkdir(join(rootDirectory, "frontend"), { recursive: true });

  await writeFile(
    join(rootDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "wordpress-platform",
        packageManager: "pnpm@10.32.1"
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(join(rootDirectory, "pnpm-workspace.yaml"), 'packages:\n  - "frontend"\n', "utf8");
  await writeFile(join(rootDirectory, "wordpress", "wp-config.php"), "<?php\ndefine('DB_NAME', 'wordpress');\n", "utf8");
  await writeFile(
    join(rootDirectory, "frontend", "package.json"),
    `${JSON.stringify(
      {
        name: "marketing-frontend",
        dependencies: {
          vite: "^6.0.0",
          react: "^19.0.0",
          "@debugbundle/sdk-browser": "^0.1.0"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(join(rootDirectory, "frontend", "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n', "utf8");
  await writeFile(join(rootDirectory, "frontend", "vite.config.ts"), "export default {};\n", "utf8");

  return rootDirectory;
}

async function createRuntimeGuidanceFixtureRepository(input: { runtime: "go" | "ruby" | "java" | "symfony" }): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), `debugbundle-setup-${input.runtime}-relay-`));

  await mkdir(join(rootDirectory, "backend"), { recursive: true });
  await mkdir(join(rootDirectory, "frontend"), { recursive: true });

  await writeFile(
    join(rootDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: `${input.runtime}-platform`,
        packageManager: "pnpm@10.32.1"
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(join(rootDirectory, "pnpm-workspace.yaml"), 'packages:\n  - "frontend"\n', "utf8");
  await writeFile(
    join(rootDirectory, "frontend", "package.json"),
    `${JSON.stringify(
      {
        name: `${input.runtime}-frontend`,
        dependencies: {
          vite: "^6.0.0",
          react: "^19.0.0",
          "@debugbundle/sdk-browser": "^0.1.0"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(join(rootDirectory, "frontend", "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n', "utf8");
  await writeFile(join(rootDirectory, "frontend", "vite.config.ts"), "export default {};\n", "utf8");

  if (input.runtime === "go") {
    await writeFile(join(rootDirectory, "backend", "go.mod"), "module example.com/debugbundle-go-service\n\ngo 1.26\n", "utf8");
  }

  if (input.runtime === "ruby") {
    await mkdir(join(rootDirectory, "backend", "config"), { recursive: true });
    await writeFile(join(rootDirectory, "backend", "Gemfile"), 'source "https://rubygems.org"\ngem "rails", "~> 8.0"\n', "utf8");
    await writeFile(join(rootDirectory, "backend", "config", "application.rb"), "module ExampleApp\nend\n", "utf8");
  }

  if (input.runtime === "java") {
    await writeFile(
      join(rootDirectory, "backend", "pom.xml"),
      [
        "<project>",
        "  <modelVersion>4.0.0</modelVersion>",
        "  <groupId>com.example</groupId>",
        "  <artifactId>spring-api</artifactId>",
        "  <version>1.0.0</version>",
        "  <dependencies>",
        "    <dependency>",
        "      <groupId>org.springframework.boot</groupId>",
        "      <artifactId>spring-boot-starter-web</artifactId>",
        "    </dependency>",
        "  </dependencies>",
        "</project>"
      ].join("\n") + "\n",
      "utf8"
    );
  }

  if (input.runtime === "symfony") {
    await writeFile(
      join(rootDirectory, "backend", "composer.json"),
      `${JSON.stringify(
        {
          name: "example/symfony-api",
          require: {
            "symfony/framework-bundle": "^7.0"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  return rootDirectory;
}

describe("cli setup relay and mixed-runtime behavior", () => {
  it("detects mixed-runtime service roots outside apps directories", async () => {
    const rootDirectory = await createMixedRuntimeFixtureRepository();

    const result = await setupCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-05-25T00:00:00.000Z")
      }
    );

    expect(result.exitCode).toBe(0);

    const profile = JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8")) as {
      services: Array<{ name: string; kind: string; runtime: string; framework: string; paths: string[]; owns_routes: string[]; depends_on: string[] }>;
    };

    expect(profile.services).toEqual([
      {
        name: "backend-service",
        kind: "backend",
        runtime: "Node.js",
        framework: "Fastify",
        paths: ["backend"],
        owns_routes: [],
        depends_on: []
      },
      {
        name: "frontend-app",
        kind: "frontend",
        runtime: "Node.js",
        framework: "Vite",
        paths: ["frontend"],
        owns_routes: [],
        depends_on: []
      },
      {
        name: "worker",
        kind: "worker",
        runtime: "Python",
        framework: "FastAPI",
        paths: ["worker"],
        owns_routes: [],
        depends_on: []
      }
    ]);
  });

  it("scaffolds a Fastify browser relay registration when both browser and node SDKs are present", async () => {
    const rootDirectory = await createRelayFixtureRepository({ framework: "fastify" });

    const result = await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(result.exitCode).toBe(0);

    const serverContents = await readFile(join(rootDirectory, "src", "server.ts"), "utf8");
    expect(serverContents).toContain('import { debugBundleRelayPlugin } from "@debugbundle/sdk-node/relay/fastify";');
    expect(serverContents).toContain("app.register(debugBundleRelayPlugin);");
    expect(result.output).toContain("Scaffolded relay route:");
    expect(result.output).toContain("src/server.ts");
  });

  it("scaffolds an Express browser relay registration when both browser and node SDKs are present", async () => {
    const rootDirectory = await createRelayFixtureRepository({ framework: "express" });

    const result = await setupCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(result.exitCode).toBe(0);

    const serverContents = await readFile(join(rootDirectory, "src", "server.ts"), "utf8");
    expect(serverContents).toContain('import { debugBundleRelay } from "@debugbundle/sdk-node/relay/express";');
    expect(serverContents).toContain('app.use("/debugbundle/browser", debugBundleRelay());');

    const parsed = JSON.parse(result.output) as {
      relay_action: string;
      checks: Array<{ name: string; status: string; message: string }>;
    };
    expect(parsed.relay_action).toBe("scaffolded");
    expect(parsed.checks).toContainEqual({
      name: "relay-route",
      status: "ok",
      message: "Scaffolded browser relay route in src/server.ts"
    });
  });

  it("scaffolds a Next.js App Router relay route when both browser and node SDKs are present", async () => {
    const rootDirectory = await createRelayFixtureRepository({ framework: "nextjs" });

    const result = await setupCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(rootDirectory, "app", "debugbundle", "browser", "route.ts"), "utf8")).toBe(
      'export { debugBundleRelay as POST } from "@debugbundle/sdk-node/relay/nextjs";\n'
    );

    const parsed = JSON.parse(result.output) as {
      relay_action: string;
      checks: Array<{ name: string; status: string; message: string }>;
    };
    expect(parsed.relay_action).toBe("scaffolded");
    expect(parsed.checks).toContainEqual({
      name: "relay-route",
      status: "ok",
      message: "Scaffolded browser relay route in app/debugbundle/browser/route.ts"
    });
  });

  it("warns when relay scaffolding cannot find a registration point", async () => {
    const fastifyRoot = await createRelayFallbackRepository({ framework: "fastify" });
    const expressRoot = await createRelayFallbackRepository({ framework: "express" });

    const fastifyResult = await setupCommand(
      {},
      {
        cwd: () => fastifyRoot,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const expressResult = await setupCommand(
      {},
      {
        cwd: () => expressRoot,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(fastifyResult.exitCode).toBe(0);
    expect(expressResult.exitCode).toBe(0);
    expect(await readFile(join(fastifyRoot, "src", "server.ts"), "utf8")).toContain("const server = Fastify();");
    expect(await readFile(join(expressRoot, "src", "server.ts"), "utf8")).toContain("const server = express();");
  });

  it("warns when next.js relay scaffolding has no app router directory", async () => {
    const rootDirectory = await createRelayFallbackRepository({ framework: "nextjs" });

    const result = await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8")).toContain('"name": "relay-fallback-nextjs-app"');
  });

  it("returns runtime-specific relay guidance for a mixed frontend and python backend repo", async () => {
    const rootDirectory = await createMixedRuntimeFixtureRepository({ pythonBackend: true });

    const result = await setupCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-05-25T00:00:00.000Z")
      }
    );

    const parsed = JSON.parse(result.output) as {
      relay_action: string;
      relay_guidance?: Array<{ backend_service: string | null; action: string; instructions: string[] }>;
    };

    expect(parsed.relay_action).toBe("instructions");
    expect(parsed.relay_guidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backend_service: "backend",
          action: "instructions",
          instructions: expect.arrayContaining([
            expect.stringContaining("create_fastapi_relay_handler"),
            expect.stringContaining("/debugbundle/browser"),
            expect.stringContaining("allowed origins"),
            expect.stringContaining("debugbundle process --json")
          ])
        })
      ])
    );
  });

  it("returns WordPress-specific relay guidance for a mixed frontend and wordpress backend repo", async () => {
    const rootDirectory = await createWordPressRelayFixtureRepository();

    const result = await setupCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-05-25T00:00:00.000Z")
      }
    );

    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.output) as {
      relay_action: string;
      detected_services: Array<{ name: string; runtime: string; framework: string; kind: string }>;
      relay_guidance?: Array<{ runtime: string; framework: string; route_path: string; browser_endpoint: string; summary: string; instructions: string[] }>;
    };

    expect(parsed.detected_services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "wordpress",
          kind: "backend",
          runtime: "PHP",
          framework: "WordPress"
        })
      ])
    );
    expect(parsed.relay_action).toBe("instructions");
    const wordpressGuidance = parsed.relay_guidance?.find(
      (guidance) => guidance.runtime === "PHP" && guidance.framework === "WordPress"
    );

    expect(wordpressGuidance).toBeDefined();
    expect(wordpressGuidance?.route_path).toBe("/wp-json/debugbundle/v1/browser");
    expect(wordpressGuidance?.browser_endpoint).toBe("/wp-json/debugbundle/v1/browser");
    expect(wordpressGuidance?.summary).toContain("WordPress");
    expect(
      wordpressGuidance?.instructions.some((instruction) => instruction.includes("DebugBundle WordPress plugin"))
    ).toBe(true);
    expect(
      wordpressGuidance?.instructions.some((instruction) => instruction.includes("/wp-json/debugbundle/v1/browser"))
    ).toBe(true);
    expect(
      wordpressGuidance?.instructions.some((instruction) => instruction.includes("allowed origins"))
    ).toBe(true);
  });

  it("returns Symfony-specific relay guidance for a mixed frontend and symfony backend repo", async () => {
    const rootDirectory = await createRuntimeGuidanceFixtureRepository({ runtime: "symfony" });

    const result = await setupCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-05-25T00:00:00.000Z")
      }
    );

    const parsed = JSON.parse(result.output) as {
      detected_services: Array<{ runtime: string; framework: string }>;
      relay_guidance?: Array<{ runtime: string; framework: string; instructions: string[] }>;
    };

    expect(parsed.detected_services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtime: "PHP",
          framework: "Symfony"
        })
      ])
    );

    const guidance = parsed.relay_guidance?.find(
      (entry) => entry.runtime === "PHP" && entry.framework === "Symfony"
    );

    expect(guidance).toBeDefined();
    expect(guidance?.instructions.some((instruction) => instruction.includes("DebugBundle\\Framework\\Symfony\\DebugBundleRelayController"))).toBe(true);
  });

  it("returns Go-specific relay guidance without leaking unknown as a framework label", async () => {
    const rootDirectory = await createRuntimeGuidanceFixtureRepository({ runtime: "go" });

    const result = await setupCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-05-25T00:00:00.000Z")
      }
    );

    const parsed = JSON.parse(result.output) as {
      detected_services: Array<{ runtime: string }>;
      relay_guidance?: Array<{ runtime: string; summary: string; instructions: string[] }>;
    };

    expect(parsed.detected_services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runtime: "Go" })
      ])
    );

    const guidance = parsed.relay_guidance?.find((entry) => entry.runtime === "Go");
    expect(guidance).toBeDefined();
    expect(guidance?.summary).toBe("Add a Go relay route at /debugbundle/browser.");
    expect(guidance?.instructions.some((instruction) => instruction.includes("debugbundlehttp.RelayHandler"))).toBe(true);
  });

  it("returns Rails-specific relay guidance for a mixed frontend and ruby backend repo", async () => {
    const rootDirectory = await createRuntimeGuidanceFixtureRepository({ runtime: "ruby" });

    const result = await setupCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-05-25T00:00:00.000Z")
      }
    );

    const parsed = JSON.parse(result.output) as {
      detected_services: Array<{ runtime: string; framework: string }>;
      relay_guidance?: Array<{ runtime: string; framework: string; instructions: string[] }>;
    };

    expect(parsed.detected_services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtime: "Ruby",
          framework: "Rails"
        })
      ])
    );

    const guidance = parsed.relay_guidance?.find(
      (entry) => entry.runtime === "Ruby" && entry.framework === "Rails"
    );
    expect(guidance).toBeDefined();
    expect(guidance?.instructions.some((instruction) => instruction.includes("config.debugbundle.relay_path"))).toBe(true);
  });

  it("returns Spring Boot relay guidance for a mixed frontend and java backend repo", async () => {
    const rootDirectory = await createRuntimeGuidanceFixtureRepository({ runtime: "java" });

    const result = await setupCommand(
      { json: true },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-05-25T00:00:00.000Z")
      }
    );

    const parsed = JSON.parse(result.output) as {
      detected_services: Array<{ runtime: string; framework: string }>;
      relay_guidance?: Array<{ runtime: string; framework: string; instructions: string[] }>;
    };

    expect(parsed.detected_services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtime: "Java",
          framework: "Spring Boot"
        })
      ])
    );

    const guidance = parsed.relay_guidance?.find(
      (entry) => entry.runtime === "Java" && entry.framework === "Spring Boot"
    );
    expect(guidance).toBeDefined();
    expect(guidance?.instructions.some((instruction) => instruction.includes("debugbundle-spring-boot-starter"))).toBe(true);
  });
});