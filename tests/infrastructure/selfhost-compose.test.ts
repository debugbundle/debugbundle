import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { statSync } from "node:fs";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const selfhostComposePath = join(repoRoot, "deploy", "selfhost", "docker-compose.yml");
const selfhostEnvExamplePath = join(repoRoot, "deploy", "selfhost", ".env.example");
const selfhostReadmePath = join(repoRoot, "deploy", "selfhost", "README.md");
const makefilePath = join(repoRoot, "Makefile");
const localstackInitHookPath = join(repoRoot, "deploy", "selfhost", "localstack-init", "01-create-bucket.sh");

describe("self-host deployment baseline", () => {
  it("defines the full self-host service topology and bootstrap behavior", () => {
    const compose = readFileSync(selfhostComposePath, "utf8");

    expect(compose).toContain("web:");
    expect(compose).toContain("api:");
    expect(compose).toContain("worker:");
    expect(compose).toContain("postgres:");
    expect(compose).toContain("redis:");
    expect(compose).toContain("localstack:");
    expect(compose).toContain("SELFHOST_MODE");
    expect(compose).toContain("http://127.0.0.1:3000/ready");
    expect(compose).toContain("http://127.0.0.1:${WEB_PORT:-5291}/");
    expect(compose).toContain("http://127.0.0.1:${WORKER_HEALTH_PORT:-3001}/ready");
    expect(compose).toContain("S3_BUCKET");
    expect(compose).toContain("WORKER_HEALTH_PORT");
    expect(compose).toContain("/etc/localstack/init/ready.d");
  });

  it("ships a self-host env template with the required runtime configuration", () => {
    expect(existsSync(selfhostEnvExamplePath)).toBe(true);

    const envExample = readFileSync(selfhostEnvExamplePath, "utf8");

    expect(envExample).toContain("SELFHOST_MODE=true");
    expect(envExample).toContain("DEBUGBUNDLE_PROBE_TRIGGER_SECRET=");
    expect(envExample).toContain("APP_BASE_URL=");
    expect(envExample).toContain("API_PORT=");
    expect(envExample).toContain("WEB_PORT=");
    expect(envExample).toContain("POSTGRES_PORT=");
    expect(envExample).toContain("REDIS_PORT=");
    expect(envExample).toContain("LOCALSTACK_PORT=");
    expect(envExample).toContain("S3_BUCKET=");
    expect(envExample).toContain("AUTH_COOKIE_SECURE=");
    expect(envExample).toContain("WORKER_HEALTH_PORT=");
  });

  it("documents and exposes a repeatable self-host smoke command", () => {
    const readme = readFileSync(selfhostReadmePath, "utf8");
    const makefile = readFileSync(makefilePath, "utf8");

    expect(readme).toContain("make selfhost-smoke");
    expect(makefile).toContain("selfhost-smoke:");
    expect(makefile).toContain("SELFHOST_SMOKE_API_BASE_URL");
    expect(makefile).toContain("scripts/selfhost-smoke.ts");
  });

  it("ships an executable LocalStack bucket bootstrap hook", () => {
    expect(existsSync(localstackInitHookPath)).toBe(true);
    expect((statSync(localstackInitHookPath).mode & 0o111) !== 0).toBe(true);
  });
});