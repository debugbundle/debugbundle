import {
  PROJECT_COLOR_TAG_VALUES,
  type ProjectColorTag
} from "../../../../packages/shared-types/src/index.js";

export const PROJECT_COLOR_TAG_LABELS: Record<ProjectColorTag, string> = {
  red: "Red",
  orange: "Orange",
  amber: "Amber",
  yellow: "Yellow",
  lime: "Lime",
  green: "Green",
  emerald: "Emerald",
  teal: "Teal",
  cyan: "Cyan",
  sky: "Sky",
  blue: "Blue",
  indigo: "Indigo",
  violet: "Violet",
  purple: "Purple",
  fuchsia: "Fuchsia",
  pink: "Pink",
  rose: "Rose",
  slate: "Slate"
};

export const PROJECT_COLOR_TAG_HEX: Record<ProjectColorTag, string> = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
  slate: "#64748b"
};

export const PROJECT_COLOR_TAG_OPTIONS = PROJECT_COLOR_TAG_VALUES.map((value) => ({
  value,
  label: PROJECT_COLOR_TAG_LABELS[value],
  hex: PROJECT_COLOR_TAG_HEX[value]
}));

export function getProjectColorTagHex(colorTag: ProjectColorTag): string {
  return PROJECT_COLOR_TAG_HEX[colorTag];
}
