import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, "tests", "fixtures", "relay-compliance.json");
const targetPaths = [
  path.join(repoRoot, "sdks", "debugbundle-js", "tests", "fixtures", "relay-compliance.json"),
  path.join(repoRoot, "sdks", "debugbundle-python", "tests", "fixtures", "relay-compliance.json"),
  path.join(repoRoot, "sdks", "debugbundle-php", "tests", "fixtures", "relay-compliance.json"),
  path.join(repoRoot, "sdks", "debugbundle-wordpress", "tests", "fixtures", "relay-compliance.json"),
  path.join(repoRoot, "sdks", "debugbundle-java", "tests", "fixtures", "relay-compliance.json")
];

const sourceContents = await readFile(sourcePath, "utf8");

for (const targetPath of targetPaths) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, sourceContents, "utf8");
}
