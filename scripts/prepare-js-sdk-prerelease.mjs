import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const outputRoot = path.resolve(process.argv[2] ?? ".tmp/js-sdk-publish");

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
  },
  {
    sourceDir: "sdks/debugbundle-js/packages/sdk-node",
    outputDir: "sdk-node",
    readmePath: "sdks/debugbundle-js/packages/sdk-node/README.md",
    exportMap: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js"
      },
      "./relay": {
        types: "./dist/relay.d.ts",
        import: "./dist/relay.js"
      },
      "./relay/express": {
        types: "./dist/relay-express.d.ts",
        import: "./dist/relay-express.js"
      },
      "./relay/fastify": {
        types: "./dist/relay-fastify.d.ts",
        import: "./dist/relay-fastify.js"
      },
      "./relay/nextjs": {
        types: "./dist/relay-nextjs.d.ts",
        import: "./dist/relay-nextjs.js"
      }
    }
  },
  {
    sourceDir: "sdks/debugbundle-js/packages/sdk-browser",
    outputDir: "sdk-browser",
    readmePath: "sdks/debugbundle-js/packages/sdk-browser/README.md",
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

const versionsByName = new Map(
  packageDefinitions.map((definition) => {
    const packageJson = readJson(path.join(definition.sourceDir, "package.json"));
    return [packageJson.name, packageJson.version];
  })
);

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

for (const definition of packageDefinitions) {
  const sourcePackageJsonPath = path.join(definition.sourceDir, "package.json");
  const sourcePackageJson = readJson(sourcePackageJsonPath);
  const sourceAbsoluteDir = path.join(repoRoot, definition.sourceDir);
  const distAbsoluteDir = path.join(sourceAbsoluteDir, "dist");

  if (!existsSync(distAbsoluteDir)) {
    throw new Error(`missing build output for ${sourcePackageJson.name}: ${distAbsoluteDir}`);
  }

  const outputDir = path.join(outputRoot, definition.outputDir);
  mkdirSync(outputDir, { recursive: true });
  cpSync(distAbsoluteDir, path.join(outputDir, "dist"), { recursive: true });
  copyOptionalFile(definition.readmePath, outputDir, "README.md");
  copyOptionalFile("LICENSE", outputDir, "LICENSE");

  const publishDependencies = Object.fromEntries(
    Object.entries(sourcePackageJson.dependencies ?? {}).map(([dependencyName, dependencyVersion]) => {
      if (dependencyVersion === "workspace:*") {
        const resolvedVersion = versionsByName.get(dependencyName);
        if (!resolvedVersion) {
          throw new Error(`missing resolved workspace version for ${dependencyName}`);
        }

        return [dependencyName, resolvedVersion];
      }

      return [dependencyName, dependencyVersion];
    })
  );

  const publishPackageJson = {
    name: sourcePackageJson.name,
    version: sourcePackageJson.version,
    private: false,
    type: "module",
    license: sourcePackageJson.license,
    description: sourcePackageJson.description,
    files: ["dist"],
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: definition.exportMap,
    publishConfig: {
      access: "public"
    },
    dependencies: publishDependencies
  };

  writeFileSync(path.join(outputDir, "package.json"), `${JSON.stringify(publishPackageJson, null, 2)}\n`);
}