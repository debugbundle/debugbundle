import { describe, expect, it } from "vitest";
import { buildReproduction } from "../../../packages/repro-engine/src/index.js";
import { createBundleWithRequestContext } from "../../helpers/repro-engine.ts";

describe("reproduction request evidence", () => {
  it("labels a missing origin as an incomplete template rather than a feasible replay", () => {
    const bundle = createBundleWithRequestContext();
    expect(buildReproduction(bundle)).toMatchObject({
      possible: false,
      confidence: 0.1,
      reason: "request_target_unavailable"
    });
  });
  it.each(["UNKNOWN", "", "POST;echo unsafe", "GET\nHEAD"])(
    "does not turn the method %j into an executable reproduction",
    (method) => {
      const bundle = createBundleWithRequestContext();
      bundle.context.request!.method = method;
      expect(buildReproduction(bundle)).toMatchObject({
        possible: false,
        confidence: 0.1,
        reason: "request_method_unavailable",
        artifacts: null
      });
    }
  );

  it.each(["http://[", "file:///etc/passwd", "https://user:password@example.test/path"])(
    "degrades invalid or credentialed request URL %j without throwing",
    (path) => {
      const bundle = createBundleWithRequestContext();
      bundle.context.request!.path = path;
      expect(buildReproduction(bundle)).toMatchObject({
        possible: false,
        reason: "request_url_invalid",
        artifacts: null
      });
    }
  );
});
