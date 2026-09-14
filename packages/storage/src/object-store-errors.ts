/** Distinguish expired/absent objects from failures that must remain retryable. */
export function isObjectMissing(error: unknown): boolean {
  if (error === null || typeof error !== "object" || Array.isArray(error)) return false;
  const record = error as Record<string, unknown>;
  const value = record["$metadata"];
  const metadata =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return (
    record["message"] === "s3_object_not_found" ||
    record["name"] === "NoSuchKey" ||
    record["code"] === "NoSuchKey" ||
    metadata["httpStatusCode"] === 404
  );
}
