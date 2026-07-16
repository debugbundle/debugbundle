import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const composePath = join(process.cwd(), "docker-compose.yml");
const corepackCacheMount = "node-corepack-cache:/root/.cache/node/corepack";

function getServiceBlock(compose: string, service: string): string {
  const match = compose.match(
    new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:|^volumes:)`, "m"),
  );

  if (!match) {
    throw new Error(`Missing ${service} service from local Docker Compose configuration.`);
  }

  return match[0];
}

describe("local Docker Compose development stack", () => {
  it("shares the prepared Corepack cache with every Node service", () => {
    const compose = readFileSync(composePath, "utf8");

    for (const service of ["db-bootstrap", "db-migrate", "api", "worker", "web"]) {
      expect(getServiceBlock(compose, service)).toContain(corepackCacheMount);
    }

    expect(compose).toContain("  node-corepack-cache:");
  });
});
