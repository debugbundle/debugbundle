import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import robots from "../../../site/app/robots.js";
import { normalizeSiteHref } from "../../../site/src/seo.js";
import {
  buildResponseHeadersManifest,
  NON_INDEXABLE_ROBOTS_TAG
} from "../../../site/src/search-crawler-policy.js";
import { siteConfig, supportedThemes } from "../../../site/src/site-config.js";

const nextConfigPath = join(process.cwd(), "site/next.config.mjs");
const docsLayoutPath = join(process.cwd(), "site/app/(docs)/docs/layout.tsx");
const jsonLdComponentPath = join(process.cwd(), "site/src/components/json-ld.tsx");

describe("public site scaffold", () => {
  it("supports the public-site navigation contract", () => {
    expect(siteConfig.primaryNav).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/docs/" }),
        expect.objectContaining({ href: "/pricing/" }),
        expect.objectContaining({ href: "/blog/" })
      ])
    );

    expect(siteConfig.appUrl).toBe("https://app.debugbundle.com");
  });

  it("ships with dual-theme support from the first slice", () => {
    expect(supportedThemes).toEqual(["light", "dark", "system"]);
  });

  it("keeps the public site static-export compatible", () => {
    const nextConfig = readFileSync(nextConfigPath, "utf8");

    expect(nextConfig).toContain("output: 'export'");
    expect(nextConfig).toContain("trailingSlash: true");
    expect(nextConfig).toContain("unoptimized: true");
  });

  it("keeps the docs nav title slot serializable for the client docs layout", () => {
    const docsLayout = readFileSync(docsLayoutPath, "utf8");

    expect(docsLayout).toContain(
      "import { FumadocsNavTitle } from '@/components/fumadocs-nav-title';"
    );
    expect(docsLayout).toContain("navTitle: FumadocsNavTitle");
    expect(docsLayout).not.toContain("navTitle: ({");
  });

  it("renders JSON-LD with a plain script tag instead of next/script", () => {
    const jsonLdComponent = readFileSync(jsonLdComponentPath, "utf8");

    expect(jsonLdComponent).toContain("<script");
    expect(jsonLdComponent).toContain('type="application/ld+json"');
    expect(jsonLdComponent).toContain("replace(/</g, '\\\\u003c')");
    expect(jsonLdComponent).not.toContain("from 'next/script'");
    expect(jsonLdComponent).not.toContain("strategy=");
  });

  it("normalizes internal content links to the trailing-slash canonical form", () => {
    expect(normalizeSiteHref("/docs")).toBe("/docs/");
    expect(normalizeSiteHref("/blog/why-debugbundle?ref=nav#top")).toBe(
      "/blog/why-debugbundle/?ref=nav#top"
    );
    expect(normalizeSiteHref("/openapi.json")).toBe("/openapi.json");
    expect(normalizeSiteHref("/v1/events")).toBe("/v1/events");
    expect(normalizeSiteHref("https://api.debugbundle.com/v1/events")).toBe(
      "https://api.debugbundle.com/v1/events"
    );
  });

  it("keeps robots.txt focused on fake API and NDJSON noise paths", () => {
    const robotsPolicy = robots();
    const rules = Array.isArray(robotsPolicy.rules) ? robotsPolicy.rules : [robotsPolicy.rules];
    const disallowedPaths = rules.flatMap((rule) => {
      const value = rule.disallow;
      if (value === undefined) {
        return [];
      }

      return Array.isArray(value) ? value : [value];
    });

    expect(disallowedPaths).toEqual(expect.arrayContaining(["/v1/", "/*.ndjson"]));
  });

  it("publishes a response-headers manifest that marks machine-readable artifacts as noindex", () => {
    const manifest = buildResponseHeadersManifest();

    expect(manifest).toEqual({
      version: 1,
      rules: expect.arrayContaining([
        { path: "/llms.txt", headers: { "X-Robots-Tag": NON_INDEXABLE_ROBOTS_TAG } },
        { path: "/openapi.json", headers: { "X-Robots-Tag": NON_INDEXABLE_ROBOTS_TAG } },
        { path: "/schemas/*", headers: { "X-Robots-Tag": NON_INDEXABLE_ROBOTS_TAG } },
        { path: "/examples/*", headers: { "X-Robots-Tag": NON_INDEXABLE_ROBOTS_TAG } },
        { path: "/reference-data.json", headers: { "X-Robots-Tag": NON_INDEXABLE_ROBOTS_TAG } },
        { path: "/search-index.json", headers: { "X-Robots-Tag": NON_INDEXABLE_ROBOTS_TAG } }
      ])
    });
  });
});
