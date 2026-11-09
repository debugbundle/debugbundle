import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { expect, it } from "vitest";
import example from "../../../examples/bundle.failure.json" with { type: "json" };
import { projectReportBundleContext } from "../../../packages/smart-reports/src/bundle-context.js";
function fixture() {
  const bundle = structuredClone(example),
    project = randomUUID(),
    source = randomUUID();
  bundle.project.id = project;
  bundle.bundle_id = `bnd_${source}`;
  bundle.metadata.generation_number = 2;
  bundle.metadata.updated_at = "2026-11-01T00:00:00.000Z";
  bundle.summary.description =
    "Failure for owner@example.test with Authorization: Bearer super-secret-token-value";
  bundle.summary.likely_cause = "Possible retry dependency failure";
  return {
    bundle,
    expected: {
      origin_project_id: project,
      source_id: source,
      source_type: "incident" as const,
      generation_number: 2,
      source_content_at: bundle.metadata.updated_at,
      cutoff_at: "2026-12-01T00:00:00.000Z"
    }
  };
}
it("extracts bounded source context, redacts again and labels bundle cause/action as unperformed inference", () => {
  const { bundle, expected } = fixture(),
    projected = projectReportBundleContext(gzipSync(JSON.stringify(bundle)), expected);
  expect(projected?.context).toContain("Bundle inference:");
  expect(projected?.context).toContain("Suggested next step:");
  expect(JSON.stringify(projected)).not.toContain("owner@example.test");
  expect(JSON.stringify(projected)).not.toContain("super-secret-token-value");
  expect(projected?.context.length).toBeLessThanOrEqual(1600);
  expect(projected).not.toHaveProperty("request");
  expect(projected).not.toHaveProperty("stack");
});
it("refuses foreign identity, newer replacement generation and content after cutoff", () => {
  const { bundle, expected } = fixture(),
    compressed = gzipSync(JSON.stringify(bundle));
  expect(
    projectReportBundleContext(compressed, { ...expected, source_id: randomUUID() })
  ).toBeNull();
  expect(
    projectReportBundleContext(compressed, { ...expected, origin_project_id: randomUUID() })
  ).toBeNull();
  expect(projectReportBundleContext(compressed, { ...expected, generation_number: 3 })).toBeNull();
  expect(
    projectReportBundleContext(compressed, { ...expected, cutoff_at: "2026-10-01T00:00:00.000Z" })
  ).toBeNull();
});
it("rejects malformed and compressed expansion attacks without exposing the body", () => {
  const { expected } = fixture();
  expect(projectReportBundleContext(Buffer.from("invalid"), expected)).toBeNull();
  expect(
    projectReportBundleContext(gzipSync(Buffer.alloc(2 * 1024 * 1024, 65)), expected)
  ).toBeNull();
  expect(projectReportBundleContext(Buffer.alloc(524289), expected)).toBeNull();
});
it("includes bounded retained service context without importing local profile files or machine details", () => {
  const { bundle, expected } = fixture();
  bundle.service.name = "checkout";
  bundle.service.runtime = "node";
  bundle.service.framework = "express";
  const projected = projectReportBundleContext(gzipSync(JSON.stringify(bundle)), expected);
  expect(projected?.context).toContain(
    "Service context: checkout; runtime node; framework express."
  );
  expect(projected?.context.length).toBeLessThanOrEqual(1600);
  expect(JSON.stringify(projected)).not.toContain("container_id");
});
