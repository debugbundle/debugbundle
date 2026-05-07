import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const outputRoot = path.resolve(process.argv[2] ?? ".tmp/shared-js-publish");

const packageDefinitions = [
  {
    sourceDir: "packages/shared-types",
    outputDir: "shared-types",
    readmePath: "packages/shared-types/README.md",
    exportMap: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js"
      }
    }
  },
  {
    sourceDir: "packages/redaction",
    outputDir: "redaction",
    readmePath: "packages/redaction/README.md",
    exportMap: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js"
      }
    }
  }
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function copyOptionalFile(relativePath, outputDir, fileName) {
  if (relativePath === undefined) {
    return;
  }

  const sourcePath = path.join(repoRoot, relativePath);
  if (!existsSync(sourcePath)) {
    return;
  }

  cpSync(sourcePath, path.join(outputDir, fileName));
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

for (const definition of packageDefinitions) {
  const sourcePackageJson = readJson(path.join(definition.sourceDir, "package.json"));
  const distAbsoluteDir = path.join(repoRoot, definition.sourceDir, "dist");

  if (!existsSync(distAbsoluteDir)) {
    throw new Error(`missing build output for ${sourcePackageJson.name}: ${distAbsoluteDir}`);
  }

  const outputDir = path.join(outputRoot, definition.outputDir);
  mkdirSync(outputDir, { recursive: true });
  cpSync(distAbsoluteDir, path.join(outputDir, "dist"), { recursive: true });
  copyOptionalFile(definition.readmePath, outputDir, "README.md");
  copyOptionalFile("LICENSE", outputDir, "LICENSE");

  const publishPackageJson = {
    name: sourcePackageJson.name,
    version: sourcePackageJson.version,
    private: false,
    type: "module",
    license: sourcePackageJson.license,
    description: sourcePackageJson.description,
    files: ["dist", "README.md", "LICENSE"],
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: definition.exportMap,
    publishConfig: {
      access: "public"
    },
    dependencies: sourcePackageJson.dependencies ?? {}
  };

  writeFileSync(path.join(outputDir, "package.json"), `${JSON.stringify(publishPackageJson, null, 2)}\n`);
}