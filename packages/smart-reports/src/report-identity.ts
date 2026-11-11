import { z } from "zod";
import { prepareReportModelInput, type ReportModelFacts } from "./model-evidence.js";

/** Private bounded metadata, never part of a model payload, public DTO or receipt. */
export const ReportIdentitySetSchema = z.array(z.string().min(1).max(320)).max(2048);
const generic = new Set([
  "api",
  "app",
  "web",
  "site",
  "prod",
  "production",
  "test",
  "team",
  "default",
  "service",
  "project",
  "development",
  "report",
  "debugbundle",
  "worker",
  "backend",
  "frontend",
  "server",
  "client",
  "database",
  "scheduler",
  "website",
  "dashboard"
]);
function normalise(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}
/** Literal token matching avoids both user regex execution and substring hits
 * such as Art/cartography. Short/common names need an explicit identity context;
 * Project A–J are reserved report aliases, not evidence of a leaked short name.
 * Fixed protocol vocabulary is not project-identifying captured prose. */
export function containsReportIdentity(value: unknown, rawIdentities: readonly string[]): boolean {
  const validated = ReportIdentitySetSchema.parse(rawIdentities);
  const identities = validated.map(normalise).filter(Boolean);
  const symbolForm = (text: string): string =>
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s\uFE0F]+/gu, "");
  const symbolIdentities = validated
    .filter((identity) => /\p{Extended_Pictographic}/u.test(identity))
    .map(symbolForm);
  return strings(value).some((text) => {
    if (symbolIdentities.some((identity) => symbolForm(text).includes(identity))) return true;
    const normal = normalise(text);
    return identities.some((identity) => {
      if (identity.length <= 2 || generic.has(identity)) {
        if (/^[a-j]$/.test(identity)) return false;
        return ["project", "service", "domain", "workspace"].some((kind) =>
          ` ${normal} `.includes(` ${kind} ${identity} `)
        );
      }
      if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(identity))
        return normal.includes(identity);
      return [identity, identity.replaceAll(" ", "")].some((candidate) =>
        ` ${normal} `.includes(` ${candidate} `)
      );
    });
  });
}

/** Canonical numbers, references and coverage are unchanged. Restricted source
 * labels/context already have a closed projection; protect all remaining notes
 * against the accepted and current known identity set as well. */
export function protectRestrictedReportFacts(
  raw: unknown,
  identities: readonly string[]
): ReportModelFacts {
  const facts = prepareReportModelInput(raw);
  if (facts.privacy_mode !== "restricted") return facts;
  const safeNote = (note: string): string =>
    containsReportIdentity(note, identities)
      ? "Coverage or source detail is withheld in restricted mode."
      : note;
  facts.projects = facts.projects.map((project) => ({
    ...project,
    notes: project.notes.map(safeNote)
  }));
  facts.metrics = facts.metrics.map((metric) => ({ ...metric, notes: metric.notes.map(safeNote) }));
  facts.selection_notes = facts.selection_notes.map(safeNote);
  return facts;
}
