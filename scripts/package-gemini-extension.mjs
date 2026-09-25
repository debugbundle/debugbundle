#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildDeterministicZip } from "./deterministic-zip.mjs";
import { GEMINI_EXTENSION_FILES } from "./gemini-extension-files.mjs";

const source = "plugins/debugbundle-gemini";
// Only regular, reviewed files enter the archive, including every parent path.
// A symlink must not silently package content from outside the extension source.
const entries = await Promise.all(
  GEMINI_EXTENSION_FILES.map(async (path) => {
    const parts = `${source}/${path}`.split("/");
    for (let index = 0; index < parts.length; index++) {
      const stat = await lstat(join(...parts.slice(0, index + 1)));
      if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())
        throw new Error(`Gemini package requires a regular source path: ${path}`);
    }
    return { path, bytes: await readFile(join(source, path)) };
  })
);
const manifest = JSON.parse(entries[0].bytes.toString("utf8"));
const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const version = "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";
if (
  !exactKeys(manifest, ["name", "version", "description", "mcpServers"]) ||
  manifest.name !== "debugbundle-gemini" ||
  !new RegExp(`^${version}$`, "u").test(manifest.version) ||
  typeof manifest.description !== "string" ||
  !manifest.description.trim() ||
  !exactKeys(manifest.mcpServers, ["debugbundle"])
)
  throw new Error("Invalid Gemini extension identity or version");
const server = manifest.mcpServers?.debugbundle;
if (
  !exactKeys(server, ["command", "args", "cwd"]) ||
  server.command !== "npx" ||
  !Array.isArray(server.args) ||
  server.args?.length !== 3 ||
  server.args[0] !== "-y" ||
  !new RegExp(`^@debugbundle/mcp@${version}$`, "u").test(server.args[1]) ||
  server.args[2] !== "--local-auth" ||
  server.cwd !== "${workspacePath}"
)
  throw new Error("Invalid Gemini MCP server pin or workspace boundary");
const archive = buildDeterministicZip(entries);
const digest = createHash("sha256").update(archive).digest("hex");
const outputDir = ".tmp/gemini-extension";
await mkdir(outputDir, { recursive: true });
const output = join(outputDir, `debugbundle-gemini-${manifest.version}.zip`);
await writeFile(output, archive);
process.stdout.write(`${output}\nsha256 ${digest}\n`);
