import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readWorkspaceFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("Solo pricing contract", () => {
  it("publishes $4.99 as the only Solo base price", () => {
    const retiredSoloPrice = ["$2", "99"].join(".");
    const pricingSources = [
      readWorkspaceFile("spec/product.md"),
      readWorkspaceFile("spec/billing.md"),
      readWorkspaceFile("SYSTEM_OVERVIEW.md")
    ];

    for (const source of pricingSources) {
      expect(source).toContain("$4.99");
      expect(source).not.toContain(retiredSoloPrice);
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
