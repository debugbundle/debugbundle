export interface WebExternalLinksEnv {
  DEV?: boolean;
  MODE?: string;
  VITE_DOCUMENTATION_URL?: string;
}

const HOSTED_DOCUMENTATION_URL = "https://debugbundle.com/docs";
const LOCAL_DOCUMENTATION_URL = "http://localhost:5292/docs";

function normalizeOrigin(currentLocation: URL | Location): string {
  if (typeof currentLocation.origin === "string" && currentLocation.origin.length > 0) {
    return currentLocation.origin;
  }

  return `${currentLocation.protocol}//${currentLocation.host}`;
}

function normalizeExternalUrl(value: string | undefined, currentLocation: URL | Location): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const origin = normalizeOrigin(currentLocation);
  if (trimmed.startsWith("/")) {
    return `${origin}${trimmed}`;
  }

  return `${origin}/${trimmed}`;
}

export function resolveDocumentationUrl(
  env: WebExternalLinksEnv = import.meta.env,
  currentLocation: URL | Location = window.location
): string {
  const explicitDocumentationUrl = normalizeExternalUrl(env.VITE_DOCUMENTATION_URL, currentLocation);
  if (explicitDocumentationUrl !== null) {
    return explicitDocumentationUrl;
  }

  if (env.DEV === true || env.MODE === "test") {
    return LOCAL_DOCUMENTATION_URL;
  }

  return HOSTED_DOCUMENTATION_URL;
}