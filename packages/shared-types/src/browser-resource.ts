/** Resource identity is evidence; dependency importance and failure cause are separate decisions. */
export interface BrowserResource {
  host: string | null;
  path: string;
  type: string | null;
  first_party: boolean | null;
  role:
    | "analytics"
    | "advertising"
    | "tag_manager"
    | "authentication"
    | "application_asset"
    | "unknown";
  provider: string | null;
  title: string;
  optional_candidate: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function httpUrl(value: unknown, base?: URL): URL | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4096 ||
    /[\u0000-\u0020\u007f]/.test(value)
  )
    return null;
  try {
    const url = base === undefined ? new URL(value) : new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Resolve against the browser page, never a backend relay host. Missing origin stays unknown. */
export function browserResourceLocation(
  source: unknown,
  page: unknown
): {
  host: string | null;
  path: string;
  first_party: boolean | null;
} | null {
  if (typeof source !== "string") return null;
  const pageUrl = httpUrl(page);
  const url = httpUrl(source, pageUrl ?? undefined);
  if (url !== null) {
    if (url.pathname.length > 1024 || url.hostname.length > 255) return null;
    return {
      host: url.hostname.toLowerCase(),
      path: url.pathname || "/",
      first_party: pageUrl === null ? null : url.origin === pageUrl.origin
    };
  }
  // A root-relative URL is useful context, but without a page origin it cannot identify a host.
  if (
    source.startsWith("/") &&
    !source.startsWith("//") &&
    !source.includes("\\") &&
    !/[\u0000-\u0020\u007f]/.test(source)
  ) {
    const path = source.split(/[?#]/, 1)[0]!;
    if (path.length <= 1024) return { host: null, path, first_party: true };
  }
  return null;
}

export function describeBrowserResource(value: unknown): BrowserResource | null {
  const event = record(value);
  if (event?.["kind"] !== "resource_error") return null;
  const target = record(event["target"]);
  const page = record(event["page"]);
  const location = browserResourceLocation(
    target?.["source_url"] ?? event["file_name"],
    page?.["url"]
  );
  if (location === null) return null;
  const tag = typeof target?.["tag_name"] === "string" ? target["tag_name"].toLowerCase() : null;
  const type =
    tag !== null &&
    [
      "script",
      "link",
      "img",
      "audio",
      "video",
      "source",
      "iframe",
      "object",
      "embed",
      "input"
    ].includes(tag)
      ? tag
      : null;
  let role: BrowserResource["role"] =
    location.first_party === true ? "application_asset" : "unknown";
  let provider: string | null = null;
  if (type === "script") {
    if (location.host === "www.googletagmanager.com" && location.path === "/gtm.js") {
      provider = "Google Tag Manager";
      role = "tag_manager";
    } else if (
      location.host === "connect.facebook.net" &&
      /^\/[a-z]{2}_[A-Z]{2}\/fbevents\.js$/.test(location.path)
    ) {
      provider = "Meta Pixel";
      role = "advertising";
    } else if (location.host === "www.clarity.ms" && /^\/tag\/[A-Za-z0-9]+$/.test(location.path)) {
      provider = "Microsoft Clarity";
      role = "analytics";
    } else if (location.host === "accounts.google.com" && location.path === "/gsi/client") {
      provider = "Google sign-in";
      role = "authentication";
    }
  }
  const file = location.path.split("/").filter(Boolean).at(-1) ?? location.path;
  const kind =
    type === "img"
      ? "Image"
      : type === "script" || /\.m?js$/i.test(file)
        ? "JavaScript asset"
        : "Resource";
  return {
    ...location,
    type,
    role,
    provider,
    title:
      provider !== null
        ? `${provider} script failed to load`
        : `${kind} failed to load: ${file}${location.host === null ? "" : ` (${location.host})`}`,
    optional_candidate:
      event["opaque"] === true &&
      location.first_party !== true &&
      ["analytics", "advertising", "tag_manager"].includes(role)
  };
}

export function browserResourceDiagnosis(resource: BrowserResource | null): string {
  return resource?.optional_candidate === true
    ? "The browser reported that this script failed to load. Possibly blocked by privacy tools; network, CSP or provider failures are also possible. The captured event does not identify the cause."
    : "The browser reported that this resource failed to load. The captured event does not identify the cause or establish whether application functionality was affected.";
}
