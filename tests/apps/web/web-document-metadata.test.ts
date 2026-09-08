import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("hosted app document metadata", () => {
  it("provides private-app SEO, social preview, canonical, and icon metadata", () => {
    const document = readFileSync(join(process.cwd(), "apps/web/index.html"), "utf8");

    for (const marker of [
      'name="description"',
      'name="robots" content="noindex, nofollow"',
      'rel="canonical" href="https://app.debugbundle.com/"',
      'property="og:title"',
      'property="og:description"',
      'property="og:url" content="https://app.debugbundle.com/"',
      'property="og:image" content="https://debugbundle.com/og-image.jpg"',
      'property="og:image:width" content="1200"',
      'property="og:image:height" content="630"',
      'name="twitter:card" content="summary_large_image"',
      'name="twitter:image" content="https://debugbundle.com/og-image.jpg"',
      'name="theme-color"'
    ]) {
      expect(document).toContain(marker);
    }
  });
});
