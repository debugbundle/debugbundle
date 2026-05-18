import { describe, expect, it } from "vitest";

import {
  ImprovementBundleSensitivitySchema,
  ImprovementSettingsResponseSchema,
  ImprovementSettingsSchema,
  ImprovementSettingsUpdateSchema
} from "../../../packages/shared-types/src/index.js";

describe("improvement settings shared types", () => {
  it("accepts the supported sensitivity values", () => {
    expect(ImprovementBundleSensitivitySchema.parse("high_confidence")).toBe("high_confidence");
    expect(ImprovementBundleSensitivitySchema.parse("balanced")).toBe("balanced");
    expect(ImprovementBundleSensitivitySchema.parse("verbose")).toBe("verbose");
  });

  it("validates the full settings object", () => {
    expect(
      ImprovementSettingsSchema.parse({
        automated_improvement_bundles_enabled: true,
        improvement_bundle_sensitivity: "balanced"
      })
    ).toEqual({
      automated_improvement_bundles_enabled: true,
      improvement_bundle_sensitivity: "balanced"
    });
  });

  it("requires at least one field for updates", () => {
    expect(ImprovementSettingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      ImprovementSettingsUpdateSchema.parse({
        automated_improvement_bundles_enabled: false
      })
    ).toEqual({
      automated_improvement_bundles_enabled: false
    });
  });

  it("validates response metadata and settings payloads together", () => {
    expect(
      ImprovementSettingsResponseSchema.parse({
        access_mode: "manage",
        cloud_automation_available: true,
        settings: {
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "balanced"
        }
      })
    ).toEqual({
      access_mode: "manage",
      cloud_automation_available: true,
      settings: {
        automated_improvement_bundles_enabled: true,
        improvement_bundle_sensitivity: "balanced"
      }
    });
  });
});
