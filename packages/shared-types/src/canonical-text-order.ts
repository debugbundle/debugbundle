/** Stable UTF-16 ordering for canonical requests/hashes, independent of locale. */
export function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
