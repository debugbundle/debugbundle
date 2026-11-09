import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readWorkspaceFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("Solo pricing contract", () => {
  it("publishes $5 as the only Solo base price", () => {
    const pricingSources = [
      readWorkspaceFile("spec/product.md"),
      readWorkspaceFile("spec/billing.md"),
      readWorkspaceFile("SYSTEM_OVERVIEW.md")
    ];

    for (const source of pricingSources) {
      expect(source).toContain("$5");
      expect(source).not.toMatch(/Solo(?:\s+(?:plan|base|price|tier))?[\s:–—-]*\$2\.99\b/iu);
    }
  });

  it("defines paid prices as exclusive of applicable taxes", () => {
    const pricingSources = [
      readWorkspaceFile("spec/product.md"),
      readWorkspaceFile("spec/billing.md")
    ];

    for (const source of pricingSources) {
      expect(source).toContain("exclude VAT or other applicable taxes");
      expect(source).toContain("calculated and applied at checkout");
    }
  });
});
