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
