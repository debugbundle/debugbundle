// Enforce the browser URL privacy boundary for installed SDK versions too.
// Coordinates are stack syntax, not part of a query or fragment to retain.
export function sanitizeBrowserStackUrls(stack: string): string {
  return stack.replace(/https?:\/\/[^\s]+/gi, (source) => {
    // Parentheses are legal URL characters, including inside credentials/query.
    // Consume the whole location before separating trailing stack punctuation.
    const suffix = source.match(/:\d+(?::\d+)?[),]*$/)?.[0] ?? source.match(/[),]+$/)?.[0] ?? "";
    const location = suffix.length === 0 ? source : source.slice(0, -suffix.length);
    try {
      const parsed = new URL(location);
      return `${parsed.origin}${parsed.pathname}${suffix}`;
    } catch {
      return `[unavailable-url]${suffix}`;
    }
  });
}
