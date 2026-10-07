/** Assert actual JSON transport bodies rather than coercing arbitrary BodyInit values. */
export function parseRequestBody(body: RequestInit["body"] | undefined): Record<string, unknown> {
  if (typeof body !== "string") throw new Error("Expected a JSON request body");
  const parsed: unknown = JSON.parse(body);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Expected a JSON object request body");
  return parsed as Record<string, unknown>;
}
