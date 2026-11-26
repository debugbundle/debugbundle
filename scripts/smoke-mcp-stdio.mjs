import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";

const command = process.argv[2];

if (!command) {
  throw new Error("missing_command_path");
}

const projectId = "00000000-0000-4000-8000-000000000001";
const bearerToken = "synthetic-member-token";
const responses = new Map([
  [`/v1/github/installation?project_id=${projectId}`, { installation: null }],
  [`/v1/projects/${projectId}/github/repo`, { repo: null }]
]);
const requests = [];
const server = createServer((request, response) => {
  const body = responses.get(request.url);
  if (
    request.method !== "GET" ||
    request.headers.authorization !== `Bearer ${bearerToken}` ||
    body === undefined
  ) {
    response.writeHead(404).end();
    return;
  }
  requests.push(request.url);
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const child = spawn(command, [], {
    stdio: ["pipe", "pipe", "pipe"],
    signal: AbortSignal.timeout(30_000),
    env: {
      ...process.env,
      DEBUGBUNDLE_API_URL: `http://127.0.0.1:${server.address().port}`,
      DEBUGBUNDLE_MEMBER_TOKEN: bearerToken
    }
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });

  child.stdin.end(
    [
      { jsonrpc: "2.0", id: "release-smoke", method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: "github-status",
        method: "tools/call",
        params: { name: "get_github_status", arguments: { bearerToken, projectId } }
      }
    ]
      .map((request) => JSON.stringify(request))
      .join("\n") + "\n"
  );

  const [exitCode] = await once(child, "close");
  assert.equal(exitCode, 0, `MCP smoke process failed: ${stderr.trim()}`);
  const replies = stdout
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  const tools = replies.find((reply) => reply.id === "release-smoke")?.result?.tools;
  assert.ok(
    tools?.some((tool) => tool.name === "doctor"),
    "doctor_tool_missing"
  );

  const status = replies.find((reply) => reply.id === "github-status");
  assert.ok(
    status?.result?.content?.[0]?.text,
    `Missing GitHub status result: ${JSON.stringify(status)}`
  );
  assert.deepEqual(JSON.parse(status.result.content[0].text), { installation: null, repo: null });
  assert.deepEqual(requests, [...responses.keys()]);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
