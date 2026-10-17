import { readFileSync } from "node:fs";

const metadata = JSON.parse(
  readFileSync(new URL("../../../.tmp/openclaw-plugin-metafile.json", import.meta.url), "utf8")
);
const forbiddenInputs = Object.keys(metadata.inputs).filter((path) =>
  /(?:\/ajv\/|\/auth\/src\/index\.ts$|\/storage\/src\/index\.ts$|\/mcp-core\/src\/openai-sdk-server\.ts$)/u.test(
    path
  )
);
if (forbiddenInputs.length > 0) {
  throw new Error(`openclaw_server_dependency_in_bundle:${forbiddenInputs.join(",")}`);
}
const source = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
if (/\bnew\s+Function\s*\(|\beval\s*\(/u.test(source)) {
  throw new Error("openclaw_dynamic_code_execution_in_bundle");
}
console.log("OpenClaw bundle boundary and dynamic-code checks passed.");
