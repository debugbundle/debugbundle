import { z } from "zod";

export const EvidenceCapabilityValues = [
  "exception_evidence_v1",
  "resource_observations_v1",
  "recovery_v1",
  "evidence_provenance_v1"
] as const;

export const EvidenceCapabilitiesSchema = z
  .object({
    version: z.literal(1),
    features: z.array(z.enum(EvidenceCapabilityValues)).max(EvidenceCapabilityValues.length)
  })
  .strict()
  .refine(
    (value) => new Set(value.features).size === value.features.length,
    "Evidence capabilities must be unique"
  );

export type EvidenceCapabilities = z.infer<typeof EvidenceCapabilitiesSchema>;

/** Pure support calculation for normalised descriptors; it never enables emission itself. */
export function intersectEvidenceCapabilities(hops: readonly unknown[]): EvidenceCapabilities {
  const unsupported: EvidenceCapabilities = { version: 1, features: [] };
  if (hops.length === 0 || hops.length > 8) return unsupported;
  let features: EvidenceCapabilities["features"] = [...EvidenceCapabilityValues];
  for (const hop of hops) {
    const parsed = EvidenceCapabilitiesSchema.safeParse(hop);
    if (!parsed.success) return unsupported;
    features = features.filter((feature) => parsed.data.features.includes(feature));
  }
  return { version: 1, features };
}
