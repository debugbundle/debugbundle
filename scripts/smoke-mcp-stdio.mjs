import { spawn } from "node:child_process";
import { once } from "node:events";

const command = process.argv[2];

if (!command) {
  throw new Error("missing_command_path");
}

const child = spawn(command, [], {
  stdio: ["pipe", "pipe", "pipe"]
});

let stdout = "";
let stderr = "";

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

child.stdout.on("data", (chunk) => {
  stdout += chunk;
});

child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

child.stdin.write(
  `${JSON.stringify({ jsonrpc: "2.0", id: "release-smoke", method: "tools/list" })}\n`
);
child.stdin.end();

const [exitCode] = await once(child, "close");

if (exitCode !== 0) {
  throw new Error(`mcp_smoke_failed_${String(exitCode)}:${stderr.trim()}`);
}

const firstJsonLine = stdout
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .find((line) => line.length > 0);

if (!firstJsonLine) {
  throw new Error("missing_mcp_stdout");
}

/** @type {{ id?: string; result?: { tools?: Array<{ name?: string }> } }} */
const response = JSON.parse(firstJsonLine);

if (response.id !== "release-smoke") {
  throw new Error("unexpected_response_id");
}

const tools = response.result?.tools;

if (!Array.isArray(tools) || tools.length === 0) {
  throw new Error("missing_tool_list");
}

if (!tools.some((tool) => tool.name === "doctor")) {
  throw new Error("doctor_tool_missing");
}