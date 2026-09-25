/** Restrict legacy stack reconstruction to known redirected stderr streams. */
export function isJavaRedirectedStderrLogger(candidate: unknown): boolean {
  return typeof candidate === "string" && candidate.length <= 256 &&
    (candidate === "stderr" || candidate === "org.jboss.stdio" || candidate.startsWith("org.jboss.stdio."));
}
