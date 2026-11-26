import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createDebugBundleSdk } from "@debugbundle/sdk-node";
import { createDebugBundleBrowserSdk as createWebSdk } from "../apps/web/node_modules/@debugbundle/sdk-browser/dist/index.js";
import { createDebugBundleBrowserSdk as createSiteSdk } from "../site/node_modules/@debugbundle/sdk-browser/dist/index.js";

// Synthetic transport and config reads never contact a hosted project.
globalThis.fetch = async () => new Response(null, { status: 404 });
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://example.test/"
});
for (const key of ["window", "document", "navigator", "location", "history"]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}

try {
  for (const [surface, createSdk, packagePath] of [
    ["api/worker", createDebugBundleSdk, "node_modules/@debugbundle/sdk-node/package.json"],
    ["dashboard", createWebSdk, "apps/web/node_modules/@debugbundle/sdk-browser/package.json"],
    ["site", createSiteSdk, "site/node_modules/@debugbundle/sdk-browser/package.json"]
  ]) {
    const installed = JSON.parse(await readFile(new URL(`../${packagePath}`, import.meta.url)));
    assert.equal(installed.version, "3.3.0");
    const events = [];
    const sdk = createSdk();
    try {
      sdk.init({
        projectToken: "dbundle_proj_synthetic_adoption",
        endpoint: "https://example.test/v1/events",
        environment: "test",
        service: "synthetic-adoption",
        redactFields: ["password", "token", "sdk"],
        redactExactFields: ["tag"],
        captureConsole: false,
        captureNetwork: false,
        captureClicks: false,
        captureRouteChanges: false,
        autoDetectLoggers: false,
        batchSize: 100,
        flushInterval: 60_000,
        transport: async (request) => {
          events.push(...structuredClone(request.events));
          return {
            status: 200,
            body: { accepted: request.events.length, rejected: 0, errors: [] }
          };
        }
      });
      sdk.setContext("payout", {
        tag: "PRIVATE_TAG_SENTINEL",
        tag_name: "script",
        password: "PASSWORD_SENTINEL"
      });
      sdk.captureLog("Synthetic privacy check", "error");
      sdk.captureException(new Error("Synthetic adoption check"));
      await sdk.flush();
      const event = events.find((entry) => entry.event_type.endsWith("exception"));
      assert.ok(event, `${surface}: captured exception delivered through custom transport`);
      assert.equal(event.sdk_version, "3.3.0");
      const log = events.find((entry) => entry.event_type === "log_event");
      assert.ok(log, `${surface}: global context delivered as log attributes`);
      // Node nests global fields in attributes.context; Browser flattens them.
      const payout =
        surface === "api/worker"
          ? log.payload.attributes.context.payout
          : log.payload.attributes.payout;
      assert.equal(payout.tag, "[REDACTED]");
      assert.equal(payout.password, "[REDACTED]");
      assert.equal(payout.tag_name, "script");
      assert.ok(!JSON.stringify(events).includes("SENTINEL"));
      console.log(`${surface}: installed 3.3.0 capture, delivery and privacy passed`);
    } finally {
      sdk.dispose();
    }
  }
} finally {
  dom.window.close();
}
