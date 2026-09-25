import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Agent } from "undici";

type ResolvedAddress = { address: string; family: number };
type AddressResolver = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<ResolvedAddress[]>;

const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4]
] as const) blockedAddresses.addSubnet(address, prefix);
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96],
  ["100::", 64], ["2001::", 23], ["2001:db8::", 32], ["2002::", 16],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]
] as const) blockedAddresses.addSubnet(address, prefix, "ipv6");

function blocked(): Error {
  return new Error("alert_target_blocked");
}

function assertPublicAddress(address: string, family: number): void {
  if ((family !== 4 && family !== 6) || isIP(address) !== family ||
    blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6")) {
    throw blocked();
  }
}

function assertPublicHostname(hostname: string): void {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (!normalized.includes(".") || [".local", ".internal", ".localhost"]
    .some((suffix) => normalized.endsWith(suffix))) {
    throw blocked();
  }
}

/** Validate syntax and literal targets before any socket or DNS work. */
export function assertAlertOutboundTarget(target: string): URL {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw blocked();
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username || url.password ||
    (url.port && url.port !== "80" && url.port !== "443")) {
    throw blocked();
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(hostname);
  if (family) assertPublicAddress(hostname, family);
  else assertPublicHostname(hostname);
  return url;
}

/** Resolve once for the socket connector, rejecting mixed public/private answers. */
export async function resolveAlertOutboundAddress(
  hostname: string,
  resolve: AddressResolver = lookup
): Promise<{ address: string; family: 4 | 6 }> {
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    assertPublicAddress(hostname, literalFamily);
    return { address: hostname, family: literalFamily as 4 | 6 };
  }
  assertPublicHostname(hostname);
  let answers: ResolvedAddress[];
  try {
    answers = await resolve(hostname, { all: true, verbatim: true });
  } catch {
    throw blocked();
  }
  if (answers.length === 0) throw blocked();
  for (const answer of answers) assertPublicAddress(answer.address, answer.family);
  const first = answers[0]!;
  return { address: first.address, family: first.family as 4 | 6 };
}

// The connector uses the validated DNS answer for its socket. A bounded pool
// protects workers and API test sends from unbounded destination growth.
const outboundAgent = new Agent({
  connections: 4,
  maxOrigins: 128,
  connect: {
    lookup(hostname, options, callback) {
      resolveAlertOutboundAddress(hostname).then(
        ({ address, family }) => {
          if (options.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
        () => callback(blocked(), "")
      );
    }
  }
});

/** Send only to a validated public destination and expose redirects to the caller. */
export function fetchGuardedOutbound(target: string, init: RequestInit): Promise<Response> {
  assertAlertOutboundTarget(target);
  return fetch(target, {
    ...init,
    redirect: "manual",
    dispatcher: outboundAgent
  } as RequestInit & { dispatcher: Agent });
}
