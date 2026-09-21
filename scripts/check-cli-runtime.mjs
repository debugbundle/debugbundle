import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { createSecureServer } from "node:http2";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompressSync, gzipSync } from "node:zlib";

// Exercise the installed bundle and its dependency side effects, not source-only
// mocks. All requests and mutations are confined to these loopback fixture servers.
const exec = promisify(execFile);
const bin = resolve(process.argv[2]);
const root = await mkdtemp(join(tmpdir(), "debugbundle-cli-runtime-"));
const authFile = join(root, "auth.json");
const certFile = join(root, "cert.pem");
const keyFile = join(root, "key.pem");
const projectId = "00000000-0000-4000-8000-000000000001";
const incidentId = "00000000-0000-4000-8000-000000000002";
const at = "2026-09-21T00:00:00.000Z";
const incident = {
  incident_id: incidentId,
  project_id: projectId,
  project_name: "Synthetic runtime fixture",
  service_id: null,
  service_name: null,
  latest_deployment_id: null,
  environment: "production",
  fingerprint: "synthetic",
  fingerprint_version: "v2",
  title: "Synthetic only é",
  severity: "high",
  status: "open",
  first_seen_at: at,
  last_seen_at: at,
  occurrence_count: 1,
  spike_detected_at: null,
  resolved_at: null,
  regressed_at: null,
  matched_fields: []
};
let encoding = "identity";
let fault = null;
let writes = 0;
let h2Requests = 0;
const servers = [];

function handler(req, res) {
  if (req.httpVersionMajor === 2) h2Requests++;
  assert.equal(
    req.headers.authorization,
    req.url === "/health" ? undefined : "Bearer synthetic-member-token"
  );
  const path = new URL(req.url, "http://localhost").pathname;
  let body;
  if (path === "/health") body = { status: "ok", version: "fixture", uptime: 1 };
  else if (path === "/v1/incidents")
    body = fault === "invalid-list" ? {} : { incidents: [incident], next_cursor: null };
  else if (path.endsWith("/capture-rule-suggestion")) body = { suggestions: [] };
  else if (path.endsWith("/capture-rules")) body = { access_mode: "manage", rules: [] };
  else if (path.endsWith("/resolve") || path.endsWith("/reopen")) {
    assert.equal(req.method, "POST");
    writes++;
    incident.status = path.endsWith("/resolve") ? "resolved" : "open";
    incident.resolved_at = incident.status === "resolved" ? at : null;
    if (fault === "disconnect") {
      req.resume();
      res.destroy();
      return;
    }
    body = fault === "invalid-shape" ? {} : { incident };
  } else if (path === `/v1/incidents/${incidentId}`) body = { incident };
  else {
    res.writeHead(404);
    res.end();
    return;
  }
  req.resume();
  const text =
    fault === "invalid-json" && req.method === "POST" ? "{invalid" : JSON.stringify(body);
  const bytes =
    encoding === "gzip"
      ? gzipSync(text)
      : encoding === "br"
        ? brotliCompressSync(text)
        : Buffer.from(text);
  res.writeHead(fault === "server-error" && req.method === "POST" ? 503 : 200, {
    "content-type": "application/json",
    ...(encoding === "identity" ? {} : { "content-encoding": encoding })
  });
  res.end(bytes);
}

async function run(args, expectedExit = 0, authenticated = true) {
  let result;
  try {
    const output = await exec(
      process.execPath,
      [bin, ...args, ...(authenticated ? ["--auth-file", authFile] : []), "--json"],
      {
        cwd: root,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, NODE_EXTRA_CA_CERTS: certFile }
      }
    );
    result = { ...output, code: 0 };
  } catch (error) {
    result = error;
  }
  assert.equal(
    result.code,
    expectedExit,
    `${args.join(" ")} on ${process.version}: ${result.stderr}`
  );
  // oidc-provider can emit a separate runtime warning to stderr on non-LTS Node.
  const stream = expectedExit === 0 ? result.stdout : result.stderr;
  const json = stream
    .trim()
    .split("\n")
    .findLast((line) => line.startsWith("{"));
  assert.ok(json, "Expected a structured command result");
  return JSON.parse(json);
}

try {
  await exec("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyFile,
    "-out",
    certFile,
    "-days",
    "2",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1"
  ]);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "synthetic-runtime-fixture", private: true })
  );
  await run(["setup", "--non-interactive"], 0, false);
  await mkdir(join(root, ".debugbundle", "local"), { recursive: true });
  const options = {
    key: await readFile(keyFile),
    cert: await readFile(certFile),
    allowHTTP1: true
  };
  for (const transport of ["http1", "http2"]) {
    const server =
      transport === "http1" ? createServer(handler) : createSecureServer(options, handler);
    servers.push(server);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const baseUrl = `${transport === "http1" ? "http" : "https"}://127.0.0.1:${server.address().port}`;
    await writeFile(
      authFile,
      JSON.stringify({ base_url: baseUrl, bearer_token: "synthetic-member-token" }),
      { mode: 0o600 }
    );
    await writeFile(
      join(root, ".debugbundle", "local", "connection.json"),
      JSON.stringify({
        mode: "connected",
        cloud_project_id: projectId,
        cloud_base_url: baseUrl,
        environments: {
          local: { delivery: "local-only" },
          development: { delivery: "local-only" },
          staging: { delivery: "local-only" },
          production: { delivery: "cloud-enabled" }
        }
      })
    );
    for (encoding of ["identity", "gzip", "br"]) {
      const listed = await run([
        "incidents",
        "--source",
        "cloud",
        "--project-id",
        projectId,
        "--status",
        "active",
        "--limit",
        "1"
      ]);
      assert.equal(listed.incidents[0].incident_id, incidentId);
      assert.equal(
        (await run(["capture-rule", "list", "--project-id", projectId])).access_mode,
        "manage"
      );
      assert.deepEqual((await run(["capture-rule", "suggest", incidentId])).suggestions, []);
      const doctor = await run(["doctor"]);
      assert.equal(doctor.checks.find((check) => check.name === "connected-api").status, "ok");
      const before = writes;
      assert.equal(
        (await run(["resolve", incidentId, "--source", "cloud"])).incident.status,
        "resolved"
      );
      assert.equal(
        (await run(["inspect", incidentId, "--source", "cloud"])).incident.status,
        "resolved"
      );
      assert.equal(
        (await run(["reopen", incidentId, "--source", "cloud"])).incident.status,
        "open"
      );
      assert.equal(writes, before + 2);
      console.log(JSON.stringify({ node: process.version, transport, encoding, result: "pass" }));
    }
    for (fault of ["invalid-json", "invalid-shape", "disconnect", "server-error"]) {
      const before = writes;
      const outcome = await run(["resolve", incidentId, "--source", "cloud"], 1);
      assert.equal(outcome.error, "mutation_outcome_unconfirmed");
      assert.equal(outcome.outcome, "unknown");
      assert.equal(outcome.retry_safe, false);
      assert.equal(writes, before + 1, "The mutation must never be automatically retried");
      assert.equal(incident.status, "resolved", "Fixture proves the mutation actually succeeded");
      fault = null;
      assert.equal(
        (await run(["inspect", incidentId, "--source", "cloud"])).incident.status,
        "resolved"
      );
    }
    fault = "invalid-list";
    const doctor = await run(["doctor"], 1);
    assert.equal(doctor.status, "error");
    assert.equal(doctor.checks.find((check) => check.name === "connected-api").status, "error");
    fault = null;
    const cachePath = join(root, ".debugbundle", "bundles", "cloud");
    await mkdir(join(root, ".debugbundle", "bundles"), { recursive: true });
    await rm(cachePath, { recursive: true, force: true });
    await writeFile(cachePath, "synthetic non-directory cache");
    const beforeCacheFailure = writes;
    const confirmed = await run(["resolve", incidentId, "--source", "cloud"]);
    assert.equal(confirmed.incident.status, "resolved");
    assert.equal(confirmed.incident.cache_warning, "cloud_cache_update_unavailable");
    assert.equal(writes, beforeCacheFailure + 1);
    await rm(cachePath);
    console.log(
      JSON.stringify({
        node: process.version,
        transport,
        mutationFaults: "pass",
        doctorExit: "pass",
        confirmedCacheFailure: "pass"
      })
    );
  }
  assert.ok(h2Requests > 0, "Must exercise HTTP/2, not silently fall back to HTTP/1");
} finally {
  await Promise.all(servers.map((server) => new Promise((r) => server.close(r))));
  await rm(root, { recursive: true, force: true });
}
