import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { z as validator } from "zod";
import type {
  OfferCodeInventoryRecordSchema,
  OfferClaimInventoryRecordSchema,
  OfferGrantInventoryRecordSchema
} from "../../../../../packages/referrals/src/offer-inventory-contracts.js";
import { PublicOfferCodeSchema } from "../../../../../packages/referrals/src/programme-policy.js";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Field, FieldLabel, FieldGroup, FieldError } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select.js";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption
} from "../ui/table.js";
import { Button } from "../ui/button.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";
import { PendingButton } from "./pending-button.js";

type Resource = "codes" | "claims" | "grants";
type Code = z.infer<typeof OfferCodeInventoryRecordSchema>;
type Claim = z.infer<typeof OfferClaimInventoryRecordSchema>;
type Grant = z.infer<typeof OfferGrantInventoryRecordSchema>;
type Data =
  | { resource: "codes"; rows: Code[] }
  | { resource: "claims"; rows: Claim[] }
  | { resource: "grants"; rows: Grant[] };
type Query = { resource: Resource; code: string; scope: string; revision: number };
const id = (row: Code | Claim | Grant): string =>
  "code_id" in row ? row.code_id : "grant_id" in row ? row.grant_id : row.claim_id;
const date = (value: string | null): string => (value ? new Date(value).toLocaleString() : "—");
async function page(query: Query, before?: string): Promise<Data> {
  const paging = { limit: 25, ...(before ? { before } : {}) };
  if (query.resource === "codes")
    return {
      resource: "codes",
      rows: (
        await offerApi.execute("operator_codes", {
          ...paging,
          ...(query.code ? { code: query.code } : {}),
          ...(query.scope ? { partner_id: query.scope } : {})
        })
      ).codes
    };
  if (query.resource === "claims")
    return {
      resource: "claims",
      rows: (
        await offerApi.execute("operator_claims", {
          ...paging,
          ...(query.code ? { code: query.code } : {}),
          ...(query.scope ? { organization_id: query.scope } : {})
        })
      ).claims
    };
  return {
    resource: "grants",
    rows: (
      await offerApi.execute("operator_grants", {
        ...paging,
        ...(query.scope ? { claim_id: query.scope } : {})
      })
    ).grants
  };
}
function append(previous: Data | null, next: Data): Data {
  if (next.resource === "codes")
    return {
      ...next,
      rows: [...(previous?.resource === "codes" ? previous.rows : []), ...next.rows]
    };
  if (next.resource === "claims")
    return {
      ...next,
      rows: [...(previous?.resource === "claims" ? previous.rows : []), ...next.rows]
    };
  return {
    ...next,
    rows: [...(previous?.resource === "grants" ? previous.rows : []), ...next.rows]
  };
}
export function OfferOperatorInventory(): JSX.Element {
  const [query, setQuery] = useState<Query>({
      resource: "codes",
      code: "",
      scope: "",
      revision: 0
    }),
    [draftCode, setDraftCode] = useState(""),
    [draftScope, setDraftScope] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [paging, setPaging] = useState(false),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    busy = useRef(false);
  useEffect(() => {
    const current = ++generation.current;
    setData(null);
    setLoading(true);
    setError(null);
    setMore(false);
    void page(query)
      .then((next) => {
        if (current !== generation.current) return;
        setData(next);
        setMore(next.rows.length === 25);
      })
      .catch((reason) => {
        if (current === generation.current) setError(offerErrorMessage(reason));
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [query]);
  const filter = (): void => {
    const code = draftCode.trim(),
      scope = draftScope.trim();
    if (code && !PublicOfferCodeSchema.safeParse(code).success) {
      setError("Enter a valid public code.");
      return;
    }
    if (scope && !validator.uuid().safeParse(scope).success) {
      setError("Enter a valid partner, workspace or claim ID, or leave it blank.");
      return;
    }
    setQuery((previous) => ({
      ...previous,
      code: code.toUpperCase(),
      scope,
      revision: previous.revision + 1
    }));
  };
  const loadMore = async (): Promise<void> => {
    const last = data?.rows.at(-1);
    if (!last || busy.current) return;
    busy.current = true;
    setPaging(true);
    setError(null);
    const current = generation.current;
    try {
      const next = await page(query, id(last));
      if (current !== generation.current) return;
      setData((previous) => append(previous, next));
      setMore(next.rows.length === 25);
    } catch (reason) {
      if (current === generation.current) setError(offerErrorMessage(reason));
    } finally {
      busy.current = false;
      if (current === generation.current) setPaging(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Offer inventory</CardTitle>
        <CardDescription>
          Find public code ownership, customer offer states and approval history. Use the
          identifiers below in Codes &amp; access when a correction or grant is needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="offer-inventory-resource">Records</FieldLabel>
            <Select
              value={query.resource}
              disabled={loading || paging}
              onValueChange={(value) => {
                setDraftCode("");
                setDraftScope("");
                setQuery({ resource: value as Resource, code: "", scope: "", revision: 0 });
              }}
            >
              <SelectTrigger id="offer-inventory-resource">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="codes">Codes</SelectItem>
                <SelectItem value="claims">Customer offers</SelectItem>
                <SelectItem value="grants">Early-purchase grants</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              filter();
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {query.resource !== "grants" ? (
                <Field>
                  <FieldLabel htmlFor="inventory-code">Public code (optional)</FieldLabel>
                  <Input
                    id="inventory-code"
                    value={draftCode}
                    maxLength={24}
                    disabled={loading || paging}
                    onChange={(event) => setDraftCode(event.target.value)}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="inventory-scope">
                  {query.resource === "codes"
                    ? "Partner ID"
                    : query.resource === "claims"
                      ? "Workspace ID"
                      : "Claim ID"}{" "}
                  (optional)
                </FieldLabel>
                <Input
                  id="inventory-scope"
                  value={draftScope}
                  disabled={loading || paging}
                  onChange={(event) => setDraftScope(event.target.value)}
                />
              </Field>
            </div>
            <div>
              <Button type="submit" variant="outline" disabled={loading || paging}>
                Filter records
              </Button>
            </div>
          </form>
        </FieldGroup>
        {error ? (
          <Notice tone="warning">
            <FieldError>{error}</FieldError>
            <Button
              variant="outline"
              disabled={loading || paging}
              onClick={() =>
                setQuery((previous) => ({ ...previous, revision: previous.revision + 1 }))
              }
            >
              Retry inventory
            </Button>
          </Notice>
        ) : null}
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : data && !data.rows.length ? (
          <p className="text-sm text-muted-foreground">No matching records.</p>
        ) : data ? (
          <InventoryTable data={data} />
        ) : null}
        {more ? (
          <div>
            <PendingButton
              pending={paging}
              pendingLabel="Loading records"
              variant="outline"
              disabled={loading}
              onClick={() => void loadMore()}
            >
              Load more records
            </PendingButton>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
function InventoryTable({ data }: { data: Data }): JSX.Element {
  const headings =
    data.resource === "codes"
      ? ["Code", "Type / status", "Partner ID", "Version ID", "Created"]
      : data.resource === "claims"
        ? ["Offer / referral code", "Status", "Claim ID", "Workspace ID", "Claimed / deadline"]
        : ["Code / status", "Grant ID", "Claim ID", "Approval reason", "Expires"];
  return (
    <Table>
      <TableCaption>
        {data.resource === "codes"
          ? "Permanent aliases are never recycled. A blocked code stops new claims and retains its owner."
          : data.resource === "claims"
            ? "Used means the first eligible invoice is reserved, including a failed payment; it is not proof of collected cash."
            : "Expired or revoked grants prevent new admission. An already admitted checkout still reconciles its original terms."}
      </TableCaption>
      <TableHeader>
        <TableRow>
          {headings.map((heading) => (
            <TableHead key={heading}>{heading}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.resource === "codes"
          ? data.rows.map((row) => (
              <TableRow key={row.code_id}>
                <TableCell className="font-medium">{row.code}</TableCell>
                <TableCell>
                  {row.kind}
                  {row.preferred ? " · preferred" : ""}
                  {row.blocked ? " · blocked" : ""}
                </TableCell>
                <TableCell className="break-all font-mono text-xs">
                  {row.partner_id ?? "—"}
                </TableCell>
                <TableCell className="break-all font-mono text-xs">
                  {row.version_id ?? "Legacy agreement"}
                </TableCell>
                <TableCell>{date(row.created_at)}</TableCell>
              </TableRow>
            ))
          : data.resource === "claims"
            ? data.rows.map((row) => (
                <TableRow key={row.claim_id}>
                  <TableCell>
                    {row.code}
                    {row.referral_code && row.referral_code !== row.code ? (
                      <p className="text-muted-foreground">Referred by {row.referral_code}</p>
                    ) : null}
                    {row.legacy_referral ? (
                      <p className="text-muted-foreground">Legacy commission agreement</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell className="break-all font-mono text-xs">{row.claim_id}</TableCell>
                  <TableCell className="break-all font-mono text-xs">
                    {row.organization_id}
                  </TableCell>
                  <TableCell>
                    {date(row.claimed_at)}
                    {row.redeem_by ? <p>Use by {date(row.redeem_by)}</p> : null}
                  </TableCell>
                </TableRow>
              ))
            : data.rows.map((row) => (
                <TableRow key={row.grant_id}>
                  <TableCell>
                    {row.code}
                    <p>
                      {row.revoked_at
                        ? "Revoked"
                        : Date.parse(row.expires_at) <= Date.now()
                          ? "Expired"
                          : row.admitted_checkout
                            ? "Checkout admitted"
                            : "Available"}
                    </p>
                  </TableCell>
                  <TableCell className="break-all font-mono text-xs">{row.grant_id}</TableCell>
                  <TableCell className="break-all font-mono text-xs">{row.claim_id}</TableCell>
                  <TableCell>{row.reason}</TableCell>
                  <TableCell>{date(row.expires_at)}</TableCell>
                </TableRow>
              ))}
      </TableBody>
    </Table>
  );
}
