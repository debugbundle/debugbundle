import { spawn, execFile, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";

const execute = promisify(execFile);
export async function runtimePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("runtime_port_unavailable");
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done()))
  );
  return address.port;
}

export async function untilRuntime<Result>(
  read: () => Promise<Result>,
  accepts: (value: Result) => boolean
): Promise<Result> {
  const deadline = Date.now() + 20000;
  do {
    const result = await read();
    if (accepts(result)) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error("runtime_condition_deadline");
}

export function startRuntime(role: "api" | "worker", env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ["--import", "tsx", `apps/${role}/src/main.ts`], {
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      output = (output + String(chunk)).slice(-1000000);
    });
  return { child, output: () => output };
}
export async function stopRuntime(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}

export async function installRuntimeClients() {
  const scratch = await mkdtemp(join(tmpdir(), "debugbundle-service-clients-"));
  const old = join(scratch, "old"),
    candidate = join(scratch, "candidate"),
    archives = join(scratch, "archives");
  await mkdir(archives);
  const proof: Array<{ name: string; version: string; sha256: string }> = [];
  const oldArchives: string[] = [];
  for (const name of ["cli", "mcp"]) {
    const root = resolve(`.tmp/evidence-release/doctor-20261103/npm-artifacts/${name}`);
    const bytes = await readFile(join(root, "artifact.tgz"));
    const manifest = JSON.parse(await readFile(join(root, "registry-manifest.json"), "utf8")) as {
      name: string;
      version: string;
      dist: { integrity: string };
    };
    const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");
    if (integrity !== manifest.dist.integrity)
      throw new Error("retained_registry_artifact_integrity_mismatch");
    oldArchives.push(join(root, "artifact.tgz"));
    proof.push({
      name: manifest.name,
      version: manifest.version,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }
  const sdkArchive = resolve(".tmp/evidence-release/published/debugbundle-sdk-node-3.2.0.tgz");
  const sdkBytes = await readFile(sdkArchive);
  proof.push({
    name: "@debugbundle/sdk-node",
    version: "3.2.0",
    sha256: createHash("sha256").update(sdkBytes).digest("hex")
  });
  await execute(
    "npm",
    [
      "install",
      "--prefix",
      old,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...oldArchives,
      sdkArchive
    ],
    { timeout: 60000 }
  );
  const candidates: string[] = [];
  for (const name of ["cli", "mcp"]) {
    const packed = await execute(
      "npm",
      [
        "pack",
        resolve(`apps/${name}`),
        "--ignore-scripts",
        "--pack-destination",
        archives,
        "--json"
      ],
      { timeout: 10000 }
    );
    const filename = (JSON.parse(packed.stdout) as Array<{ filename: string }>)[0]!.filename;
    const archive = join(archives, filename);
    candidates.push(archive);
    const bytes = await readFile(archive);
    proof.push({
      name: `candidate-${name}`,
      version: "local-unpublished",
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }
  await execute(
    "npm",
    [
      "install",
      "--prefix",
      candidate,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...candidates
    ],
    { timeout: 60000 }
  );
  const isolatedEnv = { ...process.env, HOME: scratch };
  return {
    old,
    candidate,
    scratch,
    proof,
    async auth(baseUrl: string, token: string) {
      const path = join(scratch, "auth.json");
      await writeFile(path, JSON.stringify({ base_url: baseUrl, bearer_token: token }), {
        mode: 0o600
      });
      return path;
    },
    async cli(root: string, args: string[]) {
      const result = await execute(
        process.execPath,
        [join(root, "node_modules/@debugbundle/cli/bin/debugbundle.js"), ...args],
        { env: isolatedEnv, timeout: 20000, maxBuffer: 4000000 }
      );
      return JSON.parse(result.stdout) as unknown;
    },
    async mcp(
      root: string,
      baseUrl: string,
      token: string,
      name: string,
      args: Record<string, unknown>
    ) {
      const child = spawn(
        process.execPath,
        [join(root, "node_modules/@debugbundle/mcp/bin/debugbundle-mcp.js")],
        {
          env: { ...isolatedEnv, DEBUGBUNDLE_API_URL: baseUrl, DEBUGBUNDLE_MEMBER_TOKEN: token },
          stdio: ["pipe", "pipe", "pipe"]
        }
      );
      let output = "",
        errors = "";
      child.stdout.on("data", (chunk) => {
        output += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        errors += String(chunk);
      });
      const closed = once(child, "close");
      child.stdin.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: { ...args, bearerToken: token } }
        }) + "\n"
      );
      const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
      try {
        await closed;
      } finally {
        clearTimeout(timer);
      }
      const response = output
        .trim()
        .split("\n")
        .map(
          (line) =>
            JSON.parse(line) as {
              id: number;
              result?: { isError?: boolean; content: Array<{ type: string; text?: string }> };
              error?: unknown;
            }
        )
        .find((item) => item.id === 1);
      if (!response?.result || response.result.isError || response.error)
        throw new Error(`installed_mcp_failed:${errors.slice(-500)}:${output.slice(-1000)}`);
      return JSON.parse(response.result.content[0]!.text!) as unknown;
    },
    close: () => rm(scratch, { recursive: true, force: true })
  };
}
