import { describe, expect, it } from "vitest";
import {
  EvidenceCapabilitiesSchema,
  intersectEvidenceCapabilities
} from "../../../packages/shared-types/src/evidence-capabilities.js";

const descriptor = (features: string[]) => ({ version: 1, features });

describe("complete-path evidence capabilities", () => {
  it("does not infer support from an absent delivery path", () => {
    expect(intersectEvidenceCapabilities([])).toEqual(descriptor([]));
  });

  it.each([
    undefined,
    null,
    {},
    { version: 2, features: [] },
    descriptor(["unknown"]),
    descriptor(["recovery_v1", "recovery_v1"]),
    { ...descriptor([]), extra: true }
  ])("fails closed for an unproven or invalid hop: %j", (hop) => {
    expect(intersectEvidenceCapabilities([descriptor(["recovery_v1"]), hop])).toEqual(
      descriptor([])
    );
  });

  it("requires support from the relay and downstream in either upgrade order", () => {
    const newHop = descriptor(["exception_evidence_v1", "recovery_v1"]);
    expect(intersectEvidenceCapabilities([newHop, descriptor([])])).toEqual(descriptor([]));
    expect(intersectEvidenceCapabilities([descriptor([]), newHop])).toEqual(descriptor([]));
    expect(intersectEvidenceCapabilities([newHop, newHop])).toEqual(newHop);
  });

  it("returns only the intersection in canonical order without mutating inputs", () => {
    const left = descriptor(["recovery_v1", "exception_evidence_v1", "resource_observations_v1"]);
    const right = descriptor(["resource_observations_v1", "exception_evidence_v1"]);
    const before = JSON.stringify([left, right]);
    expect(intersectEvidenceCapabilities([left, right])).toEqual(
      descriptor(["exception_evidence_v1", "resource_observations_v1"])
    );
    expect(JSON.stringify([left, right])).toBe(before);
  });

  it("bounds delivery-path work", () => {
    const hop = descriptor(["recovery_v1"]);
    expect(intersectEvidenceCapabilities(Array(8).fill(hop))).toEqual(hop);
    expect(intersectEvidenceCapabilities(Array(9).fill(hop))).toEqual(descriptor([]));
  });

  it("rejects overlong and duplicate feature lists", () => {
    expect(
      EvidenceCapabilitiesSchema.safeParse(
        descriptor(Array.from({ length: 100 }, () => "recovery_v1"))
      ).success
    ).toBe(false);
    expect(
      EvidenceCapabilitiesSchema.safeParse(descriptor(["recovery_v1", "recovery_v1"])).success
    ).toBe(false);
  });
});
