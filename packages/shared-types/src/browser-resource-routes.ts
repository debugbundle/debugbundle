import { z } from "zod";

export const BrowserResourceRoutesSchema = z.object({
  items: z
    .array(z.object({ route: z.string().max(1024), occurrences: z.number().int().positive() }))
    .max(20),
  recorded_occurrences: z.number().int().nonnegative(),
  unattributed_occurrences: z.number().int().nonnegative(),
  omitted_routes: z.number().int().nonnegative(),
  coverage: z.enum(["occurrence_metadata", "retained_samples"])
});
export type BrowserResourceRoutes = z.infer<typeof BrowserResourceRoutesSchema>;

/** Strip query/fragment and normalize recognizable dynamic segments before retaining route context. */
export function normalizeResourceRoute(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.length > 4096
  )
    return null;
  const path = value.split(/[?#]/, 1)[0]!;
  if (/[\u0000-\u0020\u007f\\]/.test(path)) return null;
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return "{param}";
      }
      if (decoded === "{param}" || /^:[A-Za-z_][A-Za-z_0-9]*$/.test(decoded)) return "{param}";
      return /^\d+$/.test(decoded) ||
        /^[a-f0-9-]{16,}$/i.test(decoded) ||
        /^[A-Za-z0-9_-]{24,}$/.test(decoded) ||
        (decoded.length >= 16 && /[A-Za-z]/.test(decoded) && /\d/.test(decoded)) ||
        /[@/\\\u0000-\u0020\u007f]/.test(decoded)
        ? "{param}"
        : segment;
    });
  const route = `/${segments.join("/")}`;
  return route.length <= 1024 ? route : null;
}

export function summarizeResourceRoutes(
  routes: readonly (string | null)[],
  occurrenceCount: number
): BrowserResourceRoutes {
  const counts = new Map<string, number>();
  for (const raw of routes) {
    const route = normalizeResourceRoute(raw);
    if (route !== null) counts.set(route, (counts.get(route) ?? 0) + 1);
  }
  const items = [...counts]
    .map(([route, occurrences]) => ({ route, occurrences }))
    .sort(
      (a, b) =>
        b.occurrences - a.occurrences || (a.route < b.route ? -1 : a.route > b.route ? 1 : 0)
    );
  const recorded = items.reduce((total, item) => total + item.occurrences, 0);
  return {
    items: items.slice(0, 20),
    recorded_occurrences: recorded,
    unattributed_occurrences: Math.max(0, occurrenceCount - recorded),
    omitted_routes: Math.max(0, items.length - 20),
    coverage: "retained_samples"
  };
}
