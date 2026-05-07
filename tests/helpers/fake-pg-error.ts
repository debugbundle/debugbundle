export function createPgError(code: string, constraint?: string): Error & { code: string; constraint?: string } {
  const error = new Error("pg_error") as Error & { code: string; constraint?: string };
  error.code = code;
  if (constraint !== undefined) {
    error.constraint = constraint;
  }
  return error;
}