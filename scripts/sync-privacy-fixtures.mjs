import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const source = path.join(root, "tests", "fixtures", "privacy-conformance.json");
const companions = [
  "debugbundle-js", "debugbundle-python", "debugbundle-php", "debugbundle-wordpress",
  "debugbundle-java", "debugbundle-go", "debugbundle-ruby", "debugbundle-dotnet",
  "debugbundle-android", "debugbundle-swift", "debugbundle-react-native"
];
const write = process.argv[2] === "--write";
if (!write && process.argv[2] !== "--check") {
  throw new Error("use --check or --write");
}

const body = await readFile(source);
const checksum = `${createHash("sha256").update(body).digest("hex")}  privacy-conformance.json\n`;
let checked = 0;
let stale = 0;
for (const name of companions) {
  const companion = path.join(root, "sdks", name);
  try {
    await access(path.join(companion, ".git"));
  } catch {
    continue; // Core-only CI checkouts do not include ignored companion repositories.
  }
  const directory = path.join(companion, "tests", "fixtures");
  const fixture = path.join(directory, "privacy-conformance.json");
  const digest = path.join(directory, "privacy-conformance.sha256");
  if (write) {
    await mkdir(directory, { recursive: true });
    await writeFile(fixture, body);
    await writeFile(digest, checksum, "utf8");
  } else {
    try {
      const [actualBody, actualDigest] = await Promise.all([readFile(fixture), readFile(digest, "utf8")]);
      if (!actualBody.equals(body) || actualDigest !== checksum) stale += 1;
    } catch {
      stale += 1;
    }
  }
  checked += 1;
}
if (checked === 0 && write) {
  throw new Error("no companion repositories available for fixture sync");
}
if (stale > 0) {
  throw new Error(`${stale}/${checked} companion privacy fixtures are stale`);
}
process.stdout.write(`${write ? "synced" : "checked"} ${checked} companion privacy fixtures\n`);
