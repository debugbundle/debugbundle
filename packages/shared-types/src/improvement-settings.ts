import { z } from "zod";

export const ImprovementBundleSensitivityValues = [
  "high_confidence",
  "balanced",
  "verbose",
] as const;

export const ImprovementBundleSensitivitySchema = z.enum(ImprovementBundleSensitivityValues);
export type ImprovementBundleSensitivity = z.infer<typeof ImprovementBundleSensitivitySchema>;

export interface ImprovementSettings {
  automated_improvement_bundles_enabled: boolean;
  improvement_bundle_sensitivity: ImprovementBundleSensitivity;
}

export const ImprovementSettingsSchema = z.object({
  automated_improvement_bundles_enabled: z.boolean(),
  improvement_bundle_sensitivity: ImprovementBundleSensitivitySchema,
});

export interface ImprovementSettingsResponse {
  access_mode: "manage" | "preview";
  cloud_automation_available: boolean;
  settings: ImprovementSettings;
}

export const ImprovementSettingsResponseSchema = z.object({
  access_mode: z.enum(["manage", "preview"]),
  cloud_automation_available: z.boolean(),
  settings: ImprovementSettingsSchema,
});

export const ImprovementSettingsUpdateSchema = z
  .object({
    automated_improvement_bundles_enabled: z.boolean().optional(),
    improvement_bundle_sensitivity: ImprovementBundleSensitivitySchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one improvement settings field must be provided.",
  });

export type ImprovementSettingsUpdate = z.infer<typeof ImprovementSettingsUpdateSchema>;

