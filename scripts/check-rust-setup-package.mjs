import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const binary = process.argv[2];
assert.ok(binary, "Pass the installed CLI executable");
for (const framework of ["axum", "actix-web"]) {
  const root = mkdtempSync(join(tmpdir(), "debugbundle-rust-cli-artifact-"));
  try {
    const manifest = `[package]\nname="artifact-backend"\nversion="0.1.0"\n[dependencies]\n${framework}="${framework === "axum" ? "0.8" : "4"}"\n`;
    const source = "fn main() {}\n";
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "Cargo.toml"), manifest);
    writeFileSync(join(root, "src/main.rs"), source);
    const result = spawnSync(
      process.execPath,
      [binary, "setup", "--json", "--agent", "none", "--non-interactive"],
      { cwd: root, encoding: "utf8", timeout: 15000 }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.ok(
      output.detected_services.some(
        (service) =>
          service.runtime === "Rust" &&
          service.name === "artifact-backend" &&
          service.kind === "backend"
      )
    );
    assert.ok(output.suggested_actions.some((line) => line.includes("client.tracing_layer()")));
    assert.ok(
      output.suggested_actions.some((line) =>
        line.includes(
          framework === "axum"
            ? "debugbundle::axum::DebugBundleLayer"
            : "debugbundle::actix_web::DebugBundleMiddleware"
        )
      )
    );
    const profile = JSON.parse(readFileSync(join(root, ".debugbundle/profile.json"), "utf8"));
    assert.ok(profile.project.primary_languages.includes("Rust"));
    assert.ok(profile.project.package_managers.includes("cargo"));
    assert.equal(profile.developer_workflows.install, "cargo fetch");
    const events = JSON.parse(
      readFileSync(
        new URL("../tests/fixtures/evidence/rust-local-events.json", import.meta.url),
        "utf8"
      )
    );
    const firstAt = Date.parse(events[0].occurred_at);
    const now = Date.now() - 1000;
    for (const event of events)
      event.occurred_at = new Date(now + Date.parse(event.occurred_at) - firstAt).toISOString();
    const primary = events.find((event) => event.event_type === "backend_exception");
    const otherProject = {
      ...structuredClone(primary),
      event_id: randomUUID(),
      project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    };
    const otherEnvironment = {
      ...structuredClone(primary),
      event_id: randomUUID(),
      service: { ...primary.service, environment: "another-environment" }
    };
    const relay = JSON.parse(
      readFileSync(new URL("../tests/fixtures/relay-compliance.json", import.meta.url), "utf8")
    );
    const browser = structuredClone(relay.cases[0].request.bodyJson.batch[0]);
    browser.event_id = randomUUID();
    // The later backend event is the nominated primary. Equal timestamps use
    // event-ID ordering and could correctly select this browser occurrence.
    browser.occurred_at = new Date(Date.parse(primary.occurred_at) - 1).toISOString();
    browser.service.environment = primary.service.environment;
    browser.correlation = { ...browser.correlation, trace_id: primary.correlation.trace_id };
    events.push(otherProject, otherEnvironment, browser);
    const eventDirectory = join(root, ".debugbundle/local/events");
    mkdirSync(eventDirectory, { recursive: true });
    const inputBytes = JSON.stringify(events);
    const inputPath = join(eventDirectory, "1794533809628-0-rust.events.json");
    writeFileSync(inputPath, inputBytes);
    const processed = spawnSync(process.execPath, [binary, "process", "--json"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000
    });
    assert.equal(processed.status, 0, processed.stderr || processed.stdout);
    assert.equal(JSON.parse(processed.stdout).events_processed, 6);
    assert.equal(JSON.parse(processed.stdout).incidents_processed, 3);
    const bundleRoot = join(root, ".debugbundle/bundles/local");
    const bundles = readdirSync(bundleRoot)
      .filter((name) => name.endsWith(".bundle.json"))
      .map((name) => JSON.parse(readFileSync(join(bundleRoot, name), "utf8")));
    assert.equal(bundles.length, 3);
    const joined = bundles.find((bundle) => bundle.signal.occurrence_count === 2);
    assert.ok(joined, "same-scope browser/backend failures must join usefully");
    assert.equal(joined.context.error.exception_evidence.nodes.length, 2);
    assert.equal(joined.context.recovery.outcome, "recovered");
    assert.equal(joined.context.probe_data.items.length, 1);
    assert.ok(joined.signal.source_event_types.includes("frontend_exception"));
    assert.ok(joined.signal.source_event_types.includes("backend_exception"));
    assert.equal(readFileSync(inputPath, "utf8"), inputBytes);
    assert.equal(readFileSync(join(root, "Cargo.toml"), "utf8"), manifest);
    assert.equal(readFileSync(join(root, "src/main.rs"), "utf8"), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
console.log(
  `Rust setup/local-process/isolation installed-CLI acceptance passed on ${process.version}`
);
