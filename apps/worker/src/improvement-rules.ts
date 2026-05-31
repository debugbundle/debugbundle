export interface ImprovementRuleThresholds {
  occurrence_threshold: number;
  slow_request_duration_threshold_ms: number;
}

export function getImprovementRuleThresholds(value: "high_confidence" | "balanced" | "verbose"): ImprovementRuleThresholds {
  switch (value) {
    case "high_confidence":
      return {
        occurrence_threshold: 10,
        slow_request_duration_threshold_ms: 2_500
      };
    case "verbose":
      return {
        occurrence_threshold: 3,
        slow_request_duration_threshold_ms: 1_000
      };
    default:
      return {
        occurrence_threshold: 5,
        slow_request_duration_threshold_ms: 1_500
      };
  }
}

export function createHostedImprovementConfidence(occurrenceCount: number, threshold: number): number {
  const progress = Math.min(1, occurrenceCount / Math.max(threshold * 2, 1));
  return Math.round((0.55 + progress * 0.35) * 100) / 100;
}

export function createHostedImprovementSeverity(occurrenceCount: number): "medium" | "high" {
  return occurrenceCount >= 10 ? "high" : "medium";
}

export function createHostedRequestFailureSeverity(responseStatus: number, occurrenceCount: number): "medium" | "high" {
  return responseStatus >= 500 || occurrenceCount >= 10 ? "high" : "medium";
}

export function createHostedSlowRequestSeverity(durationMs: number, thresholdMs: number, occurrenceCount: number): "medium" | "high" {
  return durationMs >= thresholdMs * 2 || occurrenceCount >= 10 ? "high" : "medium";
}

export function isLowValueRequestFailure404(input: {
  httpMethod: string;
  routeTemplate: string;
  responseStatus: number;
}): boolean {
  if (input.responseStatus !== 404 || input.httpMethod.toUpperCase() !== "GET") {
    return false;
  }

  const normalizedRoute = input.routeTemplate.toLowerCase().replace(/\/+$/, "") || "/";
  const exactRoutes = new Set([
    "/.env",
    "/__debug__/render_panel",
    "/actuator",
    "/autodiscover/autodiscover.json",
    "/cpanel",
    "/favicon.ico",
    "/geoserver/web",
    "/logon/logonpoint/index.html",
    "/owa/auth/logon.aspx",
    "/robots.txt",
    "/rdweb/pages",
    "/web",
    "/webclient/login.xhtml",
    "/webconsole",
    "/webui",
    "/whm",
    "/wp-admin",
    "/wp-login.php",
    "/wsman",
    "/xmlrpc.php"
  ]);

  if (exactRoutes.has(normalizedRoute)) {
    return true;
  }

  return (
    normalizedRoute.startsWith("/owa/") ||
    normalizedRoute.startsWith("/rdweb/") ||
    normalizedRoute.startsWith("/vpn/") ||
    normalizedRoute.startsWith("/wp-")
  );
}
