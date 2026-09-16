import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { processCommand } from "../../../apps/cli/src/process-command.js";
import { BundleV1Schema, createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

it("groups the resource corpus locally while preserving independent app failures and replay counts", async () => {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-resource-"));
  try {
    const eventsPath = join(root, ".debugbundle/local/events");
    await mkdir(eventsPath, { recursive: true });
    const resources = [
      ...["/", "/dashboard", "/auth/google/callback", "/e/123"].map((route) =>
        browserResourceEvent({ route })
      ),
      ...["/", "/", "/dashboard", "/dashboard", "/login", "/auth/google/callback", "/e/123"].map(
        (route) =>
          browserResourceEvent({ route, url: "https://connect.facebook.net/en_US/fbevents.js" })
      ),
      browserResourceEvent({ url: "https://www.clarity.ms/tag/x29a87mb05" }),
      browserResourceEvent({ url: "https://accounts.google.com/gsi/client" }),
      browserResourceEvent({ url: "/assets/index-Ba-f_6MW.js", tag: "link" }),
      browserResourceEvent({ url: "/assets/say-cheese-logo-oxy1wdpG.svg", tag: "img" })
    ];
    const projectId = "00000000-0000-4000-8000-000000000001";
    const events = resources.map((event) => ({
      ...event,
      project_id: projectId,
      correlation: { ...event.correlation, trace_id: "shared-trace" }
    }));
    const exception = browserResourceEvent();
    const signup = {
      ...exception,
      project_id: projectId,
      payload: {
        ...exception.payload,
        name: "UnhandledRejection",
        message: "Signup failed",
        browser_event: undefined
      }
    };
    const backend = createEventEnvelope({
      event_type: "backend_exception",
      project_id: projectId,
      service: { name: "api", runtime: "node", environment: "production" },
      correlation: { trace_id: "shared-trace" },
      payload: {
        name: "TypeError",
        message: "Signup failed",
        stack: "TypeError: Signup failed",
        handled: false,
        request: { method: "POST", path: "/signup", query: {}, headers: {} },
        response: { status_code: 500 },
        runtime: { version: "24" }
      }
    });
    await writeFile(
      join(eventsPath, "test.events.json"),
      JSON.stringify([...events, signup, backend])
    );
    const result = await processCommand({ json: true }, { cwd: () => root });
    expect(result.exitCode).toBe(0);
    const bundlePath = join(root, ".debugbundle/bundles/local");
    const files = (await readdir(bundlePath)).filter((file) => file.endsWith(".bundle.json"));
    expect(files).toHaveLength(8);
    const bundles = await Promise.all(
      files.map(async (file) =>
        BundleV1Schema.parse(JSON.parse(await readFile(join(bundlePath, file), "utf8")))
      )
    );
    const resourceBundles = bundles.filter(
      (bundle) => bundle.context.resource_failure !== undefined
    );
    expect(resourceBundles).toHaveLength(6);
    expect(
      resourceBundles.reduce((total, bundle) => total + bundle.signal.occurrence_count, 0)
    ).toBe(15);
    const gtm = resourceBundles.find(
      (bundle) => bundle.context.resource_failure?.provider === "Google Tag Manager"
    )!;
    expect(gtm.summary.title).toBe("Google Tag Manager script failed to load");
    expect(gtm.signal.occurrence_count).toBe(4);
    expect(gtm.context.resource_failure?.routes.items).toHaveLength(4);
    expect(resourceBundles.every((bundle) => bundle.summary.severity === "medium")).toBe(true);
    const before = await readFile(join(root, ".debugbundle/local/state.json"), "utf8");
    await processCommand({ json: true }, { cwd: () => root });
    expect(await readFile(join(root, ".debugbundle/local/state.json"), "utf8")).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
