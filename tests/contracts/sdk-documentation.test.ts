import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const site = process.env["DEBUGBUNDLE_SITE_ROOT"] ?? join(root, "site");
const surfaces = [
  ["node-js", "Node.js", "node", "debugbundle-js/packages/sdk-node"],
  ["browser", "Browser", "browser", "debugbundle-js/packages/sdk-browser"],
  ["python", "Python", "python", "debugbundle-python"],
  ["php", "PHP", "php", "debugbundle-php"],
  ["rust", "Rust", "rust", "debugbundle-rust"],
  ["java-spring", "Java", "java", "debugbundle-java"],
  ["dotnet", ".NET", "dotnet", "debugbundle-dotnet"],
  ["go", "Go", "go", "debugbundle-go"],
  ["ruby", "Ruby", "ruby", "debugbundle-ruby"],
  ["android", "Android", "android", "debugbundle-android"],
  ["swift", "iOS", "swift", "debugbundle-swift"],
  ["react-native", "React Native", "react-native", "debugbundle-react-native"],
  ["wordpress", "WordPress", "../integrations/wordpress", "debugbundle-wordpress"]
] as const;

function sections(source: string, level: number): Map<string, string> {
  const result = new Map<string, string>();
  let fence = false;
  let current: string | undefined;
  for (const line of source.split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    const heading = fence ? null : new RegExp(`^#{${level}} (.+)$`).exec(line);
    if (heading) {
      current = heading[1]!;
      result.set(current, "");
    } else if (current) result.set(current, `${result.get(current)}${line}\n`);
  }
  return result;
}

function codeBlocks(source: string): string[] {
  return [...source.matchAll(/```[^\n]*\n([\s\S]*?)\n```/g)].map((match) => match[1]!.trim());
}

function assertGuide(source: string, path: string, expectedInit?: string): void {
  const blocks = sections(source, 2);
  const names = [...blocks.keys()];
  const flow = [
    "Installation",
    "Initialize",
    "Integrations",
    "First-event verification",
    "Configuration"
  ];
  for (const [index, name] of flow.entries()) {
    expect(names, `${path}: ${name}`).toContain(name);
    if (index > 0)
      expect(names.indexOf(name), path).toBeGreaterThan(names.indexOf(flow[index - 1]!));
  }
  expect(names[0], `${path}: install before detailed reference`).toBe("Installation");
  if (expectedInit) expect(codeBlocks(blocks.get("Initialize")!)[0], path).toBe(expectedInit);
  expect(blocks.get("First-event verification"), path).toMatch(
    /receipt|received|incident|inspect|acceptance/i
  );
}

function assertInitialization(code: string, label: string): void {
  expect(code, label).not.toMatch(
    /\b(?:flush|Flush|shutdown|shutdown_async|print|println)\s*\(|\bprintln!|Duration::|SetupCheck|SyntheticFailure|First Rust event|accepted_events/
  );
  expect(code, label).not.toMatch(
    /\b(?:capture_exception|captureException|CaptureException|capture_message|captureMessage|CaptureMessage|probe|Probe)\s*\(/
  );
  expect(code, label).not.toMatch(/\b(?:flush|shutdown)(?:_async|Async)?\s*\(/i);
}

const rootReadme = readFileSync(join(root, "README.md"), "utf8");
const sdkReadme = rootReadme.split("## Install an SDK")[1]!.split("## CLI, API, and MCP")[0]!;
const examples = sections(sdkReadme, 3);

describe("SDK documentation contract", () => {
  it("covers every maintained SDK repository", () => {
    const inventory = JSON.parse(readFileSync(join(root, "sdks.json"), "utf8")) as {
      repositories: { path: string }[];
    };
    const documented = [...new Set(surfaces.map((surface) => `sdks/${surface[3].split("/")[0]}`))];
    expect(documented.sort()).toEqual(inventory.repositories.map((repo) => repo.path).sort());
  });

  it("gives every maintained runtime an ordered install and initialization example", () => {
    expect([...examples.keys()]).toEqual(surfaces.map((surface) => surface[1]));
    for (const [, label] of surfaces) {
      const content = examples.get(label)!;
      if (label === "WordPress") {
        expect(content).toContain("Settings");
        expect(content).toContain("project token");
      } else {
        const blocks = codeBlocks(content);
        expect(blocks.length, label).toBe(2);
        assertInitialization(blocks[1]!, label);
        if (label === "Rust") {
          const init = blocks[1]!;
          expect(init).toContain("debugbundle::init(Config {");
          const fields = ["project_token:", "environment:", "service:"];
          for (const [index, field] of fields.entries()) {
            expect(init).toContain(field);
            if (index > 0)
              expect(init.indexOf(field)).toBeGreaterThan(init.indexOf(fields[index - 1]!));
          }
        }
      }
    }
    const rust = sdkReadme.split("\n").find((line) => /^\| Rust\s*\|/.test(line))!;
    expect(rust.split("|")[2]!.trim()).toBe("`debugbundle`");
    expect(sdkReadme).toContain("github.com/debugbundle/debugbundle-go/v3");
  });

  it("makes the shared documentation pattern part of the SDK contract", () => {
    const contract = readFileSync(join(root, "contracts/sdk-interface.md"), "utf8");
    expect(contract).toContain("## 14. SDK Documentation and Examples");
    expect(contract).toContain("First-event verification");
    expect(contract).toContain("Initialization is not a delivery receipt");
  });
});

const withSite = existsSync(join(site, "content/docs")) ? describe : describe.skip;
if (process.env["DEBUGBUNDLE_REQUIRE_SDK_DOCS"] === "1") {
  it("has every checkout required for the complete documentation gate", () => {
    expect(existsSync(join(site, "content/docs")), "site checkout").toBe(true);
    for (const [, label, , repo] of surfaces)
      expect(existsSync(join(root, "sdks", repo, "README.md")), label).toBe(true);
  });
}
withSite("Public site SDK documentation", () => {
  it("keeps local setup separate from verification and describes transport exceptions", () => {
    const source = readFileSync(join(site, "content/docs/quickstart.mdx"), "utf8");
    const groups = [...source.matchAll(/<Tabs items=\{\['Node\.js'[^\n]*>([\s\S]*?)<\/Tabs>/g)];
    const local = [...groups[1]![1]!.matchAll(/<Tab>\s*([\s\S]*?)\s*<\/Tab>/g)];
    for (const [index, [, label]] of surfaces.entries()) {
      if (label === "WordPress") continue;
      const panel = local[index]![1]!;
      if (label === "Python" || label === "PHP") {
        expect(panel).toContain("application client sends through HTTP");
        expect(panel).toContain("browser relay");
        expect(codeBlocks(panel)).toHaveLength(1);
      } else {
        const blocks = codeBlocks(panel);
        expect(blocks, label).toHaveLength(2);
        assertInitialization(blocks[1]!, label);
      }
    }
    expect(local[7]![1]).toContain("github.com/debugbundle/debugbundle-go/v3");
  });

  it("uses the same connected examples in installation and quickstart panels", () => {
    for (const page of ["installation", "quickstart"]) {
      const source = readFileSync(join(site, `content/docs/${page}.mdx`), "utf8");
      const sdkTabs = source.match(/<Tabs items=\{\['Node\.js'[^\n]*>([\s\S]*?)<\/Tabs>/)!;
      const panels = [...sdkTabs[1]!.matchAll(/<Tab>\s*([\s\S]*?)\s*<\/Tab>/g)];
      for (const [index, [, label]] of surfaces.entries()) {
        if (label === "WordPress") continue;
        expect(codeBlocks(panels[index]![1]!), `${page}: ${label}`).toEqual(
          codeBlocks(examples.get(label)!)
        );
      }
    }
  });

  it("keeps the SDK capability and language tables in the catalogue order", () => {
    const index = readFileSync(join(site, "content/docs/sdks/index.mdx"), "utf8");
    const heading = index.split("\n").find((line) => line.startsWith("| Capability |"))!;
    expect(
      heading
        .split("|")
        .slice(2, -1)
        .map((cell) => cell.trim())
    ).toEqual(surfaces.map((surface) => surface[1]));
    const naming = readFileSync(join(site, "content/docs/sdks/universal-interface.mdx"), "utf8")
      .split("## Language Naming Conventions")[1]!
      .split("## Configuration Fields")[0]!;
    const labels = naming
      .split("\n")
      .filter((line) => /^\| (?!Language)/.test(line))
      .map((line) => line.split("|")[1]!.trim());
    expect(labels).toEqual(surfaces.map((surface) => surface[1]));
    for (const page of ["index", "universal-interface"]) {
      const content = readFileSync(join(site, `content/docs/sdks/${page}.mdx`), "utf8");
      const status = content.split("\n").find((line) => line.startsWith("| Status |"))!;
      expect(
        status
          .split("|")
          .slice(2, -1)
          .map((cell) => cell.trim())
      ).toEqual(surfaces.map(() => "Released"));
    }
  });

  it("keeps homepage initialization identical to the public repository examples", () => {
    const source = readFileSync(join(site, "src/components/quick-install-guide.tsx"), "utf8");
    const tree = ts.createSourceFile(
      "guide.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const guides: Record<string, string>[] = [];
    function visit(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "sdkGuideDefinitions") {
        expect(node.initializer && ts.isArrayLiteralExpression(node.initializer)).toBe(true);
        for (const entry of (node.initializer as ts.ArrayLiteralExpression).elements) {
          const guide: Record<string, string> = {};
          for (const property of (entry as ts.ObjectLiteralExpression).properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const value = property.initializer;
            const name = property.name.getText(tree);
            if (ts.isStringLiteral(value)) guide[name] = value.text;
            else if (name === "icon" && ts.isIdentifier(value)) guide[name] = value.text;
            else if (
              ts.isCallExpression(value) &&
              ts.isPropertyAccessExpression(value.expression) &&
              ts.isArrayLiteralExpression(value.expression.expression)
            ) {
              guide[name] = value.expression.expression.elements
                .map((item) => (item as ts.StringLiteral).text)
                .join("\n");
            }
          }
          guides.push(guide);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
    expect(guides.map((guide) => guide["value"])).toEqual(surfaces.map((surface) => surface[0]));
    for (const [id, label, page] of surfaces) {
      const guide = guides.find((entry) => entry["value"] === id)!;
      const docs = readFileSync(join(site, "content/docs/sdks", `${page}.mdx`), "utf8");
      expect(docs.match(/^icon: (.+)$/m)?.[1], `${label}: same icon in homepage and docs`).toBe(
        guide["icon"]
      );
      if (id === "wordpress") continue;
      const [install, init] = codeBlocks(examples.get(label)!);
      expect(guide["installCode"], label).toBe(install);
      expect(guide["setupCode"], label).toBe(init);
      assertInitialization(guide["setupCode"]!, label);
    }
  });

  it.each(surfaces)(
    "orders the %s guide around the application setup flow",
    (_id, label, guide) => {
      const path = join(site, "content/docs/sdks", `${guide}.mdx`);
      assertGuide(
        readFileSync(path, "utf8"),
        path,
        label === "WordPress" ? undefined : codeBlocks(examples.get(label)!)[1]
      );
    }
  );
});

const withSdks = surfaces.every((surface) =>
  existsSync(join(root, "sdks", surface[3], "README.md"))
)
  ? describe
  : describe.skip;
withSdks("SDK repository and package READMEs", () => {
  it.each(surfaces)(
    "keeps %s installation and initialization first",
    (_id, label, _guide, repo) => {
      const path = join(root, "sdks", repo, "README.md");
      assertGuide(
        readFileSync(path, "utf8"),
        path,
        label === "WordPress" ? undefined : codeBlocks(examples.get(label)!)[1]
      );
    }
  );

  it("keeps the JavaScript family README in the same flow", () => {
    const path = join(root, "sdks/debugbundle-js/README.md");
    assertGuide(readFileSync(path, "utf8"), path);
  });
});
