import { parsePublicStatusBaseUrl } from "../../../../packages/shared-types/src/public-status.js";
export function resolvePublicStatusRoute(
  base: string | undefined,
  origin: string
): { path: string; dedicated: boolean } {
  const url = base?.trim() ? parsePublicStatusBaseUrl(base) : null;
  const dedicated = url !== null && url.origin === origin && url.pathname.replace(/\/$/, "") === "";
  const prefix =
    url !== null && url.origin === origin ? url.pathname.replace(/\/$/, "") : "/status";
  return { path: `${prefix}/:publicId`, dedicated };
}
export function isPublicStatusLocation(
  base: string | undefined,
  location: Pick<Location, "origin" | "pathname">
): boolean {
  const route = resolvePublicStatusRoute(base, location.origin);
  return route.dedicated || location.pathname.startsWith(route.path.replace(":publicId", ""));
}
