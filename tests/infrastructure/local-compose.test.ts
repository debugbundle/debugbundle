import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const composePath = join(process.cwd(), "docker-compose.yml");
const corepackCacheMount = "node-corepack-cache:/root/.cache/node/corepack";

function getServiceBlock(compose: string, service: string): string {
  const match = compose.match(
    new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:|^volumes:)`, "m")
  );

  if (!match) {
    throw new Error(`Missing ${service} service from local Docker Compose configuration.`);
  }

  return match[0];
}

describe("local Docker Compose development stack", () => {
  it("initializes empty databases, migrates installed ones, and never resets data on startup failure", () => {
    for (const relative of ["docker-compose.yml", "deploy/selfhost/docker-compose.yml"]) {
      const compose = readFileSync(join(process.cwd(), relative), "utf8");
      expect(getServiceBlock(compose, "db-bootstrap")).toContain("db:bootstrap --if-empty");
      expect(getServiceBlock(compose, "db-migrate")).toContain(
        "db-bootstrap:\n        condition: service_completed_successfully"
      );
      expect(getServiceBlock(compose, "api")).toContain(
        "db-migrate:\n        condition: service_completed_successfully"
      );
    }
    const makefile = readFileSync(join(process.cwd(), "Makefile"), "utf8");
    expect(makefile).toContain("db-migrate: STORAGE_BOOTSTRAP_FLAGS := --if-empty");
    expect(makefile).toContain("db:bootstrap $(STORAGE_BOOTSTRAP_FLAGS)");
    expect(makefile.match(/^dev:[\s\S]*?(?=^\.PHONY:)/m)?.[0]).not.toContain("down -v");
  });
  it("keeps agent credential issuance off unless explicitly enabled after rollout", () => {
    for (const relative of ["docker-compose.yml", "deploy/selfhost/docker-compose.yml"]) {
      const compose = readFileSync(join(process.cwd(), relative), "utf8");
      expect(getServiceBlock(compose, "api")).toContain(
        "AGENT_TOKEN_ISSUANCE_ENABLED: ${AGENT_TOKEN_ISSUANCE_ENABLED:-false}"
      );
    }
  });

  it("shares the prepared Corepack cache with every Node service", () => {
    const compose = readFileSync(composePath, "utf8");

    for (const service of ["db-bootstrap", "db-migrate", "api", "worker", "web"]) {
      expect(getServiceBlock(compose, service)).toContain(corepackCacheMount);
    }

    expect(compose).toContain("  node-corepack-cache:");
  });
});

it("uses the exposed local API port for referral links while keeping enrolment opt-in", () => {
  const compose = readFileSync(composePath, "utf8");
  const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
  expect(getServiceBlock(compose, "api")).toContain(
    "REFERRAL_API_BASE_URL: ${REFERRAL_API_BASE_URL:-http://localhost:3003}"
  );
  expect(getServiceBlock(compose, "api")).toContain(
    "REFERRAL_ENROLLMENT_ENABLED: ${REFERRAL_ENROLLMENT_ENABLED:-false}"
  );
  expect(example).toContain("REFERRAL_API_BASE_URL=http://localhost:3003");
});

it("groups isolated referral previews with the main stack without occupying the app API port", () => {
  const compose = readFileSync(composePath, "utf8");
  const api = getServiceBlock(compose, "referral-review-api");
  const db = getServiceBlock(compose, "referral-review-db");
  expect(api).toContain("container_name: debugbundle-referral-review-api");
  expect(api).toContain('"127.0.0.1:3004:3003"');
  expect(api).toContain(".:/workspace:ro");
  expect(api).toContain("condition: service_healthy");
  expect(api).toContain("referral-review");
  expect(db).toContain("container_name: debugbundle-referral-review-db");
  expect(db).toContain("/var/lib/postgresql/data");
  expect(db).toContain("tmpfs:");
  expect(db).not.toContain("ports:");
  expect(db).not.toContain("postgres-data:");
  expect(getServiceBlock(compose, "api")).toContain('"3003:3000"');
});

it("keeps the public preview and readiness checks in the reproducible Compose setup", () => {
  const compose = readFileSync(composePath, "utf8");
  const publicSite = getServiceBlock(compose, "public");
  expect(publicSite).toContain('"127.0.0.1:${PUBLIC_SITE_PORT:-5292}:80"');
  expect(publicSite).toContain("./scripts/public-site-preview.nginx.conf:");
  const preview = readFileSync(
    join(process.cwd(), "scripts/public-site-preview.nginx.conf"),
    "utf8"
  );
  expect(preview).toContain("return 302 /?offer=$referral_code&referral_visit=$referral_code;");
  for (const service of [
    "api",
    "worker",
    "web",
    "public",
    "referral-review-api",
    "referral-review-db"
  ])
    expect(getServiceBlock(compose, service)).toContain("healthcheck:");
  const launcher = readFileSync(join(process.cwd(), "scripts/referral-public-review.sh"), "utf8");
  expect(launcher).toContain("docker compose");
  expect(launcher).not.toContain("docker run");
  expect(launcher).toContain("pg_dump");
  expect(launcher).toContain("com.debugbundle.review-owner");
  const makefile = readFileSync(join(process.cwd(), "Makefile"), "utf8");
  expect(makefile.match(/^dev-down:[\s\S]*?(?=^\.PHONY:)/m)?.[0]).toContain(
    "--profile dev --profile public-preview --profile referral-review down"
  );
});
