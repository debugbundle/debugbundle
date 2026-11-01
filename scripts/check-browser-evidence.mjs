import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createBrowserRelay } from "../sdks/debugbundle-js/packages/sdk-node/src/relay.ts";
import { buildBundle } from "../packages/bundle-engine/src/index.ts";
import { normalizeEvent } from "../packages/event-normalizer/src/index.ts";
import { mapPrimarySignal } from "../apps/api/src/openai-mcp-projections.ts";

// Reuse the pinned compiler already installed with the repository's tsx tooling.
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("tsx"))("esbuild");
const compiled = await build({
  entryPoints: ["sdks/debugbundle-js/packages/sdk-browser/src/index.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "DebugBundle",
  platform: "browser",
  minify: true
});
const directory = await mkdtemp(join(tmpdir(), "debugbundle-browser-proof-"));
const events = [];
const receipts = new Map();
const accept = (input) => {
  const receivedAt = new Date().toISOString();
  for (const event of input.events) {
    events.push(event);
    if (!receipts.has(event.event_id)) receipts.set(event.event_id, receivedAt);
  }
};
const relayResponses = [];
const requests = [];
const evidenceCapabilities = {
  version: 1,
  features: [
    "exception_evidence_v1",
    "resource_observations_v1",
    "recovery_v1",
    "evidence_provenance_v1"
  ]
};
let relay;
let evidenceRelay;
let complete;
let reject;
const done = new Promise((resolve, rejectPromise) => {
  complete = resolve;
  reject = rejectPromise;
});
let origin;
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://test.invalid").pathname;
    requests.push(pathname);
    if (pathname === "/sdk.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(compiled.outputFiles[0].text);
      return;
    }
    if (pathname === "/app-crash.js" || pathname === "/cross-origin.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(
        `throw new TypeError("${pathname === "/app-crash.js" ? "Native checkout failed" : "Withheld cross-origin detail"}");`
      );
      return;
    }
    if (
      [
        "/missing.js",
        "/selected-image.png",
        "/fallback-image.png",
        "/ambiguous-image.png"
      ].includes(pathname)
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (["/relay", "/evidence-relay", "/done"].includes(pathname)) {
      let body = "";
      for await (const chunk of request) body += chunk;
      if (pathname === "/done") {
        response.end("ok");
        complete(JSON.parse(body));
        return;
      }
      const target = pathname === "/relay" ? relay : evidenceRelay;
      const result = await target({
        url: request.url,
        method: request.method,
        headers: request.headers,
        body
      });
      relayResponses.push(result);
      response.writeHead(result.status, { "content-type": "application/json", ...result.headers });
      response.end(JSON.stringify(result.body));
      return;
    }
    response.setHeader("content-type", "text/html");
    response.setHeader(
      "content-security-policy",
      `img-src ${origin}/selected-image.png ${origin}/fallback-image.png ${origin}/ambiguous-image.png`
    );
    response.setHeader("content-security-policy-report-only", "img-src 'none'");
    response.end(`<!doctype html><form id="checkout"><input name="private_field" value="private-form-value"><button id="pay" type="button">Private customer text</button></form><script src="/sdk.js"></script><script>
      (async () => {
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        const sdk = DebugBundle.createDebugBundleBrowserSdk();
        sdk.init({ service: "checkout-web", environment: "test", transportMode: "relay", endpoint: "/relay", captureClicks: true, captureConsole: false, captureNetwork: false, flushInterval: 60000 });
        document.querySelector("#pay").click();
        const form = document.querySelector("form");
        form.addEventListener("submit", event => event.preventDefault());
        form.requestSubmit();
        const load = src => new Promise(resolve => { const script = document.createElement("script"); script.onload = script.onerror = resolve; script.src = src; document.head.append(script); });
        await load("/app-crash.js");
        Promise.reject(new Error("Native save rejected"));
        await pause(100);
        await load("/missing.js?token=secret");
        await load(${JSON.stringify(origin?.replace("127.0.0.1", "localhost"))} + "/cross-origin.js");
        await pause(100);
        await sdk.flush();
        sdk.dispose();
        await load("/app-crash.js?after-dispose=true");
        await pause(100);
        await sdk.flush();
        const evidence = DebugBundle.createDebugBundleBrowserSdk();
        evidence.init({ service: "evidence-web", environment: "test", transportMode: "relay",
          endpoint: "/evidence-relay", evidenceCapabilities: ${JSON.stringify(evidenceCapabilities)},
          captureRecoveryObservations: true, captureResourceObservations: true,
          captureClicks: false, captureConsole: false, captureNetwork: false, flushInterval: 60000 });
        const failureRef = crypto.randomUUID();
        evidence.captureException(new Error("Native outer cause", { cause: new TypeError("Native inner cause") }), { failureRef });
        await evidence.flush();
        evidence.captureRecovery({ failureRef, attemptId: crypto.randomUUID(), state: "attempt_completed", statusCode: 200 });
        await evidence.flush();
        const image = new Image();
        const loaded = new Promise(resolve => { image.onload = image.onerror = resolve; });
        image.srcset = "/selected-image.png 1x";
        image.src = "/fallback-image.png?token=secret";
        document.body.append(image);
        await loaded;
        const selectedSource = image.currentSrc;
        const blocked = new Image();
        const blockedLoaded = new Promise(resolve => { blocked.onload = blocked.onerror = resolve; });
        blocked.src = "/blocked-image.png";
        document.body.append(blocked);
        await blockedLoaded;
        const ambiguous = new Image();
        const ambiguousLoaded = new Promise(resolve => { ambiguous.onload = ambiguous.onerror = resolve; });
        ambiguous.src = "/ambiguous-image.png?token=secret";
        document.body.append(ambiguous);
        await ambiguousLoaded;
        await pause(150);
        await evidence.flush();
        evidence.dispose();
        await fetch("/done", { method: "POST", body: JSON.stringify({ finished: true, selectedSource,
          timingSupported: typeof PerformanceObserver === "function",
          responseStatusSupported: "responseStatus" in PerformanceResourceTiming.prototype }) });
      })().catch(error => fetch("/done", { method: "POST", body: JSON.stringify({ error: String(error) }) }));
    </script>`);
  } catch (error) {
    response.writeHead(500);
    response.end();
    reject(error);
  }
});
let browser;
const timer = setTimeout(
  () => reject(new Error("Native browser evidence check timed out")),
  30_000
);
try {
  server.listen(0, "0.0.0.0");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;
  relay = createBrowserRelay({
    projectMode: "local-only",
    localEventsDir: join(directory, "events"),
    service: "checkout-web",
    environment: "test",
    allowedOrigins: [origin],
    onAccept: accept
  });
  evidenceRelay = createBrowserRelay({
    projectMode: "local-only",
    localEventsDir: join(directory, "evidence-events"),
    service: "evidence-web",
    environment: "test",
    allowedOrigins: [origin],
    evidenceCapabilities,
    onAccept: accept
  });
  browser = spawn(
    process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      `--user-data-dir=${join(directory, "profile")}`,
      `${origin}/checkout?token=secret`
    ],
    { stdio: "ignore" }
  );
  browser.on("error", reject);
  const completion = await done;
  assert.equal(completion.error, undefined);
  assert.equal(completion.finished, true);
  assert.equal(completion.selectedSource, `${origin}/selected-image.png`);
  assert.equal(completion.timingSupported, true);
  assert.equal(completion.responseStatusSupported, true);
  assert(relayResponses.length > 0);
  assert(relayResponses.every((result) => result.status === 202 && result.body.rejected === 0));
  const exceptions = events.filter(
    (event) => event.service.name === "checkout-web" && event.event_type === "frontend_exception"
  );
  assert.equal(
    exceptions.length,
    4,
    "runtime, rejection, resource and muted cross-origin errors; none after dispose"
  );
  const runtime = exceptions.find((event) =>
    event.payload.message.includes("Native checkout failed")
  );
  assert(runtime);
  assert.match(runtime.payload.stack, /app-crash\.js:1:/);
  assert.equal(runtime.payload.browser_event.file_name, `${origin}/app-crash.js`);
  assert.equal(runtime.payload.browser_event.opaque, false);
  assert(runtime.payload.breadcrumbs.some((item) => item.breadcrumb_type === "click"));
  assert(
    runtime.payload.breadcrumbs.some(
      (item) => item.breadcrumb_type === "form_submit" && item.data.field_count === 1
    )
  );
  assert(exceptions.some((event) => event.payload.message === "Native save rejected"));
  const resource = exceptions.find(
    (event) => event.payload.browser_event?.kind === "resource_error"
  );
  assert.equal(resource.payload.browser_event.target.source_url, `${origin}/missing.js`);
  const muted = exceptions.find((event) => event.payload.message === "Script error.");
  assert(muted);
  assert.equal(muted.payload.browser_event.file_name, null);
  assert.doesNotMatch(
    JSON.stringify(events),
    /private-form-value|private_field|Private customer text|token=secret|Withheld cross-origin detail/
  );
  const candidate = events.filter((event) => event.service.name === "evidence-web");
  const cause = candidate.find((event) => event.payload.message === "Native outer cause");
  assert.equal(cause?.payload.exception_evidence?.nodes.length, 2);
  assert(
    cause.payload.exception_evidence.nodes.some((node) => node.message === "Native inner cause")
  );
  const recovery = candidate.find(
    (event) => event.event_type === "diagnostic_context" && event.payload.kind === "recovery"
  );
  assert(recovery);
  assert.equal(recovery.payload.failure_ref, cause.context.evidence_reference.failure_ref);
  assert.deepEqual(recovery.payload.scope, cause.context.evidence_reference.scope);
  assert.equal(recovery.payload.state, "attempt_completed");
  assert.equal(recovery.payload.status_code, 200);
  const selected = candidate.find(
    (event) => event.payload.browser_event?.target?.source_url === `${origin}/selected-image.png`
  );
  assert(selected, "real currentSrc wins over the fallback src");
  const passive = candidate.flatMap(
    (event) => event.payload.resource_observations?.items ?? event.payload.observations?.items ?? []
  );
  assert(
    passive.some(
      (item) =>
        item.kind === "timing" &&
        item.source_url === `${origin}/selected-image.png` &&
        item.response_status === 404
    ),
    "native timing reports observed 404"
  );
  assert(
    passive.some((item) => item.kind === "csp" && item.disposition === "report"),
    "report-only CSP is retained literally"
  );
  assert(
    passive.some((item) => item.kind === "csp" && item.disposition === "enforce"),
    "enforced CSP is retained literally"
  );
  assert.equal(
    requests.filter((path) => path === "/selected-image.png").length,
    1,
    "passive evidence must not refetch resources"
  );
  assert.equal(requests.filter((path) => path === "/fallback-image.png").length, 0);
  assert.equal(requests.filter((path) => path === "/blocked-image.png").length, 0);
  const ambiguous = passive.filter((item) => item.source_url === `${origin}/ambiguous-image.png`);
  assert(ambiguous.length > 0);
  assert(
    ambiguous.every(
      (item) =>
        item.kind === "timing" && item.availability === "ambiguous" && item.response_status === null
    ),
    "redacted query identities must not claim an observed status"
  );
  for (const event of [...exceptions, cause, selected]) {
    const normalized = normalizeEvent(event);
    assert.equal(normalized.route_template, "/checkout");
    const input = {
      job: { trigger: "occurrence_threshold" },
      incident: {
        incident_id: "incident",
        project_id: "project",
        service_id: "service",
        service_name: event.service.name,
        service_runtime: "browser",
        service_framework: null,
        environment: "test",
        fingerprint: "fingerprint",
        title: event.payload.message,
        severity: "high",
        first_seen_at: event.occurred_at,
        last_seen_at: event.occurred_at,
        occurrence_count: 1,
        source_event_types: ["frontend_exception"]
      },
      bundleMetadata: {
        generation_number: 1,
        created_at: event.occurred_at,
        updated_at: event.occurred_at,
        source_event_id: event.event_id,
        source_occurred_at: event.occurred_at
      },
      sourceEnvelopes: [event],
      diagnosticContexts: candidate
        .filter((item) => item.event_type === "diagnostic_context")
        .map((item) => ({ event: item, received_at: receipts.get(item.event_id) })),
      probeDataItems: []
    };
    const bundle = buildBundle(input);
    assert.equal(
      JSON.stringify(bundle),
      JSON.stringify(buildBundle(input)),
      "deterministic bundle"
    );
    assert.equal(bundle.context.deploy, null);
    if (event === cause) {
      assert.equal(
        bundle.context.recovery.outcome,
        "unknown",
        "HTTP 200 does not establish semantic recovery"
      );
      assert.equal(bundle.context.recovery.attempts[0].observations.length, 1);
      assert.equal(bundle.context.error.exception_evidence.nodes.length, 2);
    }
    const primary = mapPrimarySignal(bundle);
    assert.equal(primary.route_template, "/checkout");
    if (event === muted)
      assert.equal(primary.browser_context.evidence_status, "browser_details_withheld");
    if (event === resource)
      assert.equal(primary.browser_context.evidence_status, "resource_load_failure");
  }
  console.log(
    `Native Chromium -> Node relay -> normalized events -> deterministic bundle -> OpenAI projection: passed (${exceptions.length} legacy error kinds; nested cause, independent HTTP-200 recovery, currentSrc, observed 404, enforced/report-only CSP; ${compiled.outputFiles[0].contents.length} browser bytes).`
  );
} finally {
  clearTimeout(timer);
  if (browser?.exitCode === null) {
    const exited = once(browser, "exit");
    browser.kill("SIGKILL");
    await exited;
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
