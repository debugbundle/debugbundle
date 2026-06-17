import { z } from "zod";

export const PROJECT_COLOR_TAG_VALUES = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "slate"
] as const;

export const ProjectColorTagSchema = z.enum(PROJECT_COLOR_TAG_VALUES);

export type ProjectColorTag = z.infer<typeof ProjectColorTagSchema>;
