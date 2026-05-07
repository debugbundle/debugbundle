export const CUSTOM_PROJECT_ENVIRONMENT_VALUE = "__custom__";

export const PROJECT_ENVIRONMENT_OPTIONS = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
  { value: CUSTOM_PROJECT_ENVIRONMENT_VALUE, label: "Custom" }
] as const;

export function slugifyProjectName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "";
}