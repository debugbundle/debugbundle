import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { interpretBundleEvidence } from "../../../packages/shared-types/src/evidence-interpretation.js";
const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;
it("keeps historical absence unknown without claiming unsupported capture", () => {
  const result = interpretBundleEvidence(load("build-bundle.legacy.deploy-metadata.golden.json"));
  expect(result.status).toBe("legacy");
  expect(result.retained_event_count).toBeNull();
  expect(result.recovery).toBe("unknown");
  expect(result.next_evidence.join(" ")).not.toContain("unsupported");
  expect(result.facts.join(" ")).toContain("not establish");
});
it("separates occurrence time, artifact time and retained coverage", () => {
  const result = interpretBundleEvidence(load("build-bundle.deploy-metadata.golden.json"));
  expect(result).toMatchObject({
    status: "partial",
    captured_at: "2026-03-12T00:00:00.000Z",
    generated_at: "2026-03-12T00:00:00.000Z",
    retained_event_count: 1,
    exception: { source: "retained_stack", trace_origin: "unavailable", node_count: 1 }
  });
  expect(result.next_evidence.join(" ")).toContain("throw-site");
});
it("distinguishes enforced CSP, report-only CSP, unavailable status and completion from recovery", () => {
  const bundle = load("build-bundle.deploy-metadata.golden.json");
  const context = bundle["context"] as Record<string, unknown>;
  const source = "00000000-0000-4000-8000-000000000001",
    at = "2026-03-12T00:00:00.000Z";
  context["resource_observations"] = {
    version: 1,
    items: [
      {
        source_event_id: source,
        observation: {
          kind: "timing",
          observed_at: at,
          source_url: "/image.png",
          availability: "withheld",
          response_status: null,
          duration_ms: null,
          transfer_size_bytes: null
        }
      },
      {
        source_event_id: source,
        observation: {
          kind: "csp",
          observed_at: at,
          source_url: "/image.png",
          effective_directive: "img-src",
          disposition: "report",
          document_status_code: 200
        }
      },
      {
        source_event_id: source,
        observation: {
          kind: "csp",
          observed_at: at,
          source_url: "/image.png",
          effective_directive: "img-src",
          disposition: "enforce",
          document_status_code: 200
        }
      }
    ]
  };
  const result = interpretBundleEvidence(bundle);
  expect(result.passive).toMatchObject({
    timing_count: 1,
    unavailable_status_count: 1,
    enforced_csp_count: 1,
    report_only_csp_count: 1
  });
  expect(result.recovery).toBe("unknown");
  expect(result.facts.join(" ")).toContain("Report-only");
  expect(result.possible_causes.join(" ")).toContain("does not prove");
});
it("treats malformed optional evidence as partial instead of hiding the legacy failure", () => {
  const bundle = load("build-bundle.legacy.deploy-metadata.golden.json");
  (bundle["context"] as Record<string, unknown>)["evidence"] = {
    version: 999,
    secret: "must not appear"
  };
  const result = interpretBundleEvidence(bundle);
  expect(result.status).toBe("partial");
  expect(JSON.stringify(result)).not.toContain("must not appear");
});
it("does not infer probe delivery or absence of instrumentation from empty retained probes", () => {
  const result = interpretBundleEvidence(load("build-bundle.deploy-metadata.golden.json"));
  expect(result.facts.join(" ")).toContain("matching retained probe");
  expect(result.next_evidence.join(" ")).toContain("activation");
});
