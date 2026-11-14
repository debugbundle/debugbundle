export interface RustRelease {
  repository: "debugbundle/debugbundle-rust";
  registry: "crates.io";
  package: "debugbundle";
  version: string;
  workflow: "release.yml";
}

export interface RustReleaseReceipt extends RustRelease {
  checksum: string;
  size: number;
  artifactUrl: string;
}

export type RustRegistryFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function readRustRelease(manifest: unknown): RustRelease;
export function verifyRustRelease(
  specification: unknown,
  fetcher?: RustRegistryFetch
): Promise<RustReleaseReceipt>;
