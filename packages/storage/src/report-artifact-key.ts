import { createHash } from "node:crypto";
import { z } from "zod";
export const ReportArtifactKindSchema = z.enum(["facts", "ready", "pdf"]);
const KindSchema = ReportArtifactKindSchema;
type Kind = z.infer<typeof KindSchema>;
export function reportArtifactKey(input: {
  organization_id: string;
  definition_id: string;
  run_id: string;
  kind: Kind;
  sha256: string;
}): string {
  const org = z.uuid().parse(input.organization_id),
    definition = z.uuid().parse(input.definition_id),
    run = z.uuid().parse(input.run_id),
    kind = KindSchema.parse(input.kind),
    sha = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(input.sha256);
  return `smart-reports/${org}/${definition}/${run}/${kind}-${sha}.${kind === "pdf" ? "pdf" : "json"}`;
}
export function reportArtifactDigest(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}
