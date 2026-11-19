import type { ProgrammeVersion } from "../../../../../packages/referrals/src/programme-policy.js";
import { OfferProgrammeDetails } from "./offer-programme-details.js";
import { OfferProgrammeVersionControl } from "./offer-programme-version-control.js";

/** One permanent programme owns its live revision, pending drafts and retained history. */
export function OfferProgrammeGroup({
  versions,
  claimsEnabled,
  onRevise,
  onChanged
}: {
  versions: ProgrammeVersion[];
  claimsEnabled: boolean;
  onRevise: (version: ProgrammeVersion) => void;
  onChanged: () => void;
}): JSX.Element | null {
  const ordered = [...versions].sort((a, b) => b.revision - a.revision);
  const current =
    ordered.find((v) => ["active", "scheduled", "paused"].includes(v.state)) ??
    ordered.find((v) => v.state === "draft") ??
    ordered[0];
  if (!current) return null;
  const drafts = ordered.filter((v) => v !== current && v.state === "draft");
  const history = ordered.filter((v) => v !== current && v.state !== "draft");
  const control = (version: ProgrammeVersion, readOnly = false): JSX.Element => (
    <OfferProgrammeVersionControl
      key={version.version_id}
      version={version}
      claimsEnabled={claimsEnabled}
      onRevise={() => onRevise(version)}
      onChanged={onChanged}
      readOnly={readOnly}
      embedded
    />
  );
  return (
    <OfferProgrammeVersionControl
      version={current}
      claimsEnabled={claimsEnabled}
      onRevise={() => onRevise(current)}
      onChanged={onChanged}
    >
      {drafts.map((v) => control(v))}
      {history.length ? (
        <OfferProgrammeDetails label={`Revision history (${history.length})`}>
          {history.map((v) => control(v, true))}
        </OfferProgrammeDetails>
      ) : null}
    </OfferProgrammeVersionControl>
  );
}
