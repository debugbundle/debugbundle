import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildMachineReadableArtifacts } from "../../scripts/public-site-artifacts.js";

const site = process.env["DEBUGBUNDLE_SITE_ROOT"] ?? join(process.cwd(), "site");
// The private-site pipeline supplies its checkout explicitly, as with the other
// public docs contracts. Public core CI always verifies the generated SDK index.
const describeSiteDocs =
  process.env["DEBUGBUNDLE_SITE_ROOT"] !== undefined || existsSync(join(site, "content/docs"))
    ? describe
    : describe.skip;

describeSiteDocs("Rust SDK public discovery and publication status", () => {
  it("includes the stable release throughout current SDK entry points", () => {
    for (const path of [
      "index",
      "installation",
      "quickstart",
      "how-it-works",
      "faq",
      "llms-txt",
      "sdks/index",
      "sdks/universal-interface",
      "sdks/browser-relay",
      "cli/setup",
      "project-setup/profile",
      "capture-policy",
      "probes",
      "security/redaction",
      "project-setup/local-only",
      "project-setup/split-frontend-backend",
      "cli/local-workflow"
    ]) {
      const page = readFileSync(join(site, `content/docs/${path}.mdx`), "utf8");
      expect(page, path).toMatch(/Rust/);
      for (const line of page.split("\n").filter((line) => /Rust|sdks\/rust/.test(line)))
        expect(line, path).not.toMatch(/unpublished|alpha|prerelease|SDK candidate/i);
    }
    const guide = readFileSync(join(site, "content/docs/sdks/rust.mdx"), "utf8");
    expect(guide).toMatch(/^title: "Rust SDK"$/m);
    expect(guide).toContain("1.0.0");
    expect(guide).toContain('version = "1.0.0"');
    expect(guide).toContain("https://crates.io/crates/debugbundle/1.0.0");
    expect(guide).not.toMatch(/unpublished|publication remains on hold|path = "/i);
    expect(guide).toContain("Config::local");
    expect(guide).toContain("outcome.accepted_events");
    expect(readFileSync(join(site, "src/content-source.ts"), "utf8")).toContain(
      "../content/docs/sdks/rust.mdx"
    );
    const homepageGuide = readFileSync(
      join(site, "src/components/quick-install-guide.tsx"),
      "utf8"
    );
    expect(homepageGuide).toContain("label: 'Rust'");
    const homepageOrder = [...homepageGuide.matchAll(/value: '([^']+)',\s*label:/g)].map(
      (match) => match[1]
    );
    expect(homepageOrder.indexOf("rust")).toBe(homepageOrder.indexOf("php") + 1);
    const navigation = readFileSync(join(site, "src/content-source.ts"), "utf8")
      .split("'./sdks/meta.json':")[1]!
      .split("'./integrations/meta.json':")[0]!;
    expect(navigation).toMatch(/'php',\s*'rust',\s*'java'/);
    expect(homepageGuide).toContain('href="/docs/sdks/rust/"');
    const rustBlock = homepageGuide.split("value: 'rust',")[1]!.split("value: 'java-spring',")[0]!;
    expect(rustBlock).toContain('version = "1.0.0"');
    expect(rustBlock).toContain("setupLang: 'rust'");
    expect(rustBlock).toContain("Config::local");
    expect(rustBlock).toContain("capture_exception");
    expect(rustBlock).toContain("client.flush(");
    expect(rustBlock).not.toMatch(/alpha|unpublished|candidate/i);
  });

  it("keeps installation and quickstart panels paired with their reordered SDK labels", () => {
    let groups = 0;
    for (const path of ["installation", "quickstart"]) {
      const source = readFileSync(join(site, `content/docs/${path}.mdx`), "utf8");
      for (const opening of source.matchAll(/<Tabs items=\{(\[[^\n]+\])\}[^>]*>/g)) {
        const labels = [...opening[1]!.matchAll(/'([^']+)'/g)].map((match) => match[1]);
        if (!labels.some((label) => label?.startsWith("Rust"))) continue;
        groups += 1;
        const content = source.slice(opening.index + opening[0].length).split("</Tabs>")[0]!;
        const panels = [...content.matchAll(/<Tab>\s*([\s\S]*?)\s*<\/Tab>/g)].map(
          (match) => match[1]
        );
        expect(panels.length, path).toBe(labels.length);
        const rust = labels.indexOf("Rust");
        expect(rust, path).toBe(labels.indexOf("PHP") + 1);
        expect(panels[rust], path).toMatch(/debugbundle::|debugbundle =/);
        expect(panels[rust - 1], path).toContain("DebugBundle");
      }
    }
    expect(groups).toBe(3);
  });
});

describe("Rust SDK generated discovery index", () => {
  it("places the Rust SDK link after PHP with separate publication status", async () => {
    const artifacts = await buildMachineReadableArtifacts();
    const content = artifacts.find((artifact) => artifact.routePath === "/llms.txt")!.content;
    const links = content.split("\n").filter((line) => line.includes("/docs/sdks/"));
    const rust = links.findIndex((line) => line.includes("[Rust SDK]"));
    expect(rust).toBeGreaterThan(0);
    expect(links[rust - 1]).toContain("[PHP SDK]");
    expect(links[rust]).toContain("1.0.0");
    expect(links[rust]).not.toMatch(/alpha|unpublished|candidate/i);
  });
});
