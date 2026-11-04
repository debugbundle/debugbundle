export interface SharedArtifact {
  name: "@debugbundle/shared-types" | "@debugbundle/redaction";
  version: string;
  integrity: string;
}

export function planSharedPublication(
  candidates: readonly unknown[],
  published: readonly unknown[]
): { publish: string[]; retain: string[] };

export function readPublishedSharedArtifact(
  candidate: unknown,
  fetcher?: typeof fetch
): Promise<SharedArtifact | null>;
