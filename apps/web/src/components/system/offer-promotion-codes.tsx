import { useEffect, useState } from "react";
import type { z } from "zod";
import type { OfferCodeInventoryRecordSchema } from "../../../../../packages/referrals/src/offer-inventory-contracts.js";
import type { ProgrammeState } from "../../../../../packages/referrals/src/programme-policy.js";
import { offerApi } from "../../lib/offer-api.js";
import { Button } from "../ui/button.js";
import { Notice } from "../ui/notice.js";

/** Read the authoritative reservation rather than echoing an unsaved input. */
export function OfferPromotionCodes({
  versionId,
  state
}: {
  versionId: string;
  state: ProgrammeState;
}): JSX.Element {
  const [codes, setCodes] = useState<z.infer<typeof OfferCodeInventoryRecordSchema>[] | null>(null);
  const [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setCodes(null);
    setError(false);
    void offerApi.execute("operator_codes", { version_id: versionId, limit: 25 }).then(
      (result) => {
        if (active) setCodes(result.codes);
      },
      () => {
        if (active) setError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [versionId, state, revision]);
  if (error)
    return (
      <Notice tone="warning" title="Promotional code could not be loaded">
        <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
          Retry code
        </Button>
      </Notice>
    );
  return (
    <div className="flex flex-col gap-2 text-sm" aria-busy={codes === null}>
      <p className="font-medium">Promotional code</p>
      {codes === null ? (
        <p className="text-muted-foreground">Loading saved code…</p>
      ) : codes.length ? (
        <ul className="flex flex-col gap-1">
          {codes.map((code) => (
            <li key={code.code_id}>
              <code className="break-all">{code.code}</code>
              {code.blocked ? " — blocked for new claims" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          {state === "draft"
            ? "No code saved. Activation will generate one for this existing draft."
            : "No promotional code recorded for this revision."}
        </p>
      )}
      {codes?.length ? (
        <p className="text-muted-foreground">
          Usable while this programme is live and the customer is eligible.
        </p>
      ) : null}
      {codes?.length === 25 ? (
        <p className="text-muted-foreground">
          Showing the latest 25 codes. Review the full list in Inventory.
        </p>
      ) : null}
    </div>
  );
}
