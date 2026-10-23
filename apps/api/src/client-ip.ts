import { isIP } from "node:net";

function canonicalIp(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("::ffff:") && isIP(normalized.slice(7)) === 4
    ? normalized.slice(7)
    : normalized;
}

// Caddy must overwrite untrusted forwarding headers. Trust only the immediate,
// explicitly configured peer, never every private network or an arbitrary chain.
export function createTrustedProxyPolicy(
  raw: string | undefined
): false | ((address: string, hop: number) => boolean) {
  if (raw === undefined || raw.trim() === "") return false;
  const ips = raw.split(",").map(canonicalIp);
  if (ips.length > 16 || ips.some((ip) => isIP(ip) === 0)) {
    throw new Error("API_TRUSTED_PROXY_IPS must contain at most 16 explicit IP addresses");
  }
  const trusted = new Set(ips);
  // A disconnected socket may no longer have an address. Never trust its headers.
  return (address, hop) =>
    hop === 0 && typeof address === "string" && trusted.has(canonicalIp(address));
}
