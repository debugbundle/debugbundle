export function isLowValueExternalProbeRequestFailure404(input: {
  httpMethod: string;
  requestPath?: string | null;
  routeTemplate: string;
  responseStatus: number;
  headers?: Record<string, unknown> | null;
}): boolean {
  if (input.responseStatus !== 404 || input.httpMethod.toUpperCase() !== "GET") {
    return false;
  }

  const normalizedRoute = input.routeTemplate.toLowerCase().replace(/\/+$/, "") || "/";
  const normalizedPath = normalizePath(input.requestPath ?? input.routeTemplate);
  const routesToCheck = new Set([normalizedRoute, normalizedPath]);

  for (const route of routesToCheck) {
    if (isRouteOnlyExternalProbe(route)) {
      return true;
    }
  }

  return isDirectIpRequest(input.headers ?? null) && [...routesToCheck].some(isGenericDirectIpProbeRoute);
}

function normalizePath(path: string): string {
  const withoutQuery = path.split("?")[0] ?? path;
  return withoutQuery.toLowerCase().replace(/\/+$/, "") || "/";
}

function isRouteOnlyExternalProbe(normalizedRoute: string): boolean {
  const exactRoutes = new Set([
    "/.env",
    "/__debug__/render_panel",
    "/actuator",
    "/autodiscover/autodiscover.json",
    "/containers/json",
    "/developmentserver/metadatauploader",
    "/cpanel",
    "/favicon.ico",
    "/geoserver/web",
    "/hnap1",
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
    normalizedRoute.includes("/.git/") ||
    normalizedRoute.includes("/.svn/") ||
    normalizedRoute.includes("/api_keys") ||
    normalizedRoute.includes("/backup/api_keys") ||
    normalizedRoute.includes("/phpmyadmin") ||
    normalizedRoute.includes("/pma/") ||
    normalizedRoute.includes("/vendor/phpunit/") ||
    normalizedRoute.startsWith("/autodiscover/") ||
    normalizedRoute.startsWith("/cgi-bin/") ||
    normalizedRoute.startsWith("/ecp/") ||
    normalizedRoute.endsWith("/.git/config") ||
    normalizedRoute.endsWith("/composer.json") ||
    normalizedRoute.endsWith("/composer.lock") ||
    normalizedRoute.endsWith("/package-lock.json") ||
    normalizedRoute.endsWith("/package.json") ||
    normalizedRoute.endsWith("/server-status") ||
    normalizedRoute.includes("wp-config") ||
    normalizedRoute.startsWith("/owa/") ||
    normalizedRoute.startsWith("/rdweb/") ||
    normalizedRoute.startsWith("/vpn/") ||
    normalizedRoute.startsWith("/wp-") ||
    isSensitiveBackupFileProbe(normalizedRoute)
  );
}

function isSensitiveBackupFileProbe(normalizedRoute: string): boolean {
  if (!/\.(?:bak|backup|dump|old|orig|save|sql|swp|tar|tar\.gz|zip)$/.test(normalizedRoute)) {
    return false;
  }

  return /(?:^|\/|\.)(?:backup|config|database|db|dump|env|secret|site|www|wp-config)(?:\/|\.|_|-|$)/.test(normalizedRoute);
}

function isGenericDirectIpProbeRoute(normalizedRoute: string): boolean {
  return [
    "/admin",
    "/administrator",
    "/login",
    "/logincheck",
    "/remote/logincheck"
  ].includes(normalizedRoute);
}

function isDirectIpRequest(headers: Record<string, unknown> | null): boolean {
  if (headers === null) {
    return false;
  }

  const host = readHeader(headers, "x-forwarded-host") ?? readHeader(headers, "host");
  if (host === null) {
    return false;
  }

  return isIpLikeHost(host);
}

function readHeader(headers: Record<string, unknown>, name: string): string | null {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (typeof direct === "string") {
    return direct;
  }
  if (Array.isArray(direct) && typeof direct[0] === "string") {
    return direct[0];
  }
  return null;
}

function isIpLikeHost(value: string): boolean {
  const host = value.trim().replace(/:\d+$/, "");
  return (
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    /^\[[0-9a-f:]+\]$/i.test(host) ||
    (host.includes(":") && /^[0-9a-f:]+$/i.test(host))
  );
}
