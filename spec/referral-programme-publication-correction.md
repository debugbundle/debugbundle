# Programme publication and revision correction

18 November 2026. Local implementation; no deployment or live data/provider write.
Maps FR/AC-REF-02, 04, 09 and 10. The owner approved grouped history, archived
mistakes, native local date/time controls and responsive form columns.

## Confirmed cause

A read of the live public catalogue returned revision 2 of Black Friday at
DebugBundle, with a 30% introductory discount and an eligible claim window.
The no-code `/v2/offers/context` response was `{ "offer": null }`.
The homepage already mounts the shared offer provider/banner. That route only
read explicit codes or signed visitor hints, so activation alone never supplied
an anonymous public promotion to the existing component.

The list rendered each immutable revision as a separate card. Activation changed
the permanent programme's current pointer but left earlier live state labels
unchanged. In the supplied example the first revision was already ended.

## Corrected behaviour

- Public context preserves selected referral identity and compares eligible
  promotions through the ordinary code resolver. The owner's subsequent
  [cheapest-offer rule](referral-offer-selection.md) prefers the lowest eligible
  invoice amount, with referral priority on ties. Explicit invalid codes do not
  substitute a different promotion.
- Choose the best eligible discount, then claim start/version creation/ID and newest
  unblocked code creation/ID. Scheduled promotions appear only after their start.
  Paused, ended, future, expired, capped and blocked offers are excluded.
- Activation/scheduling reserves a stable `PROMO-` code when the version has no
  code. Existing or blocked codes are retained. Conflicting ownership fails the
  transaction rather than moving a public alias.
- Public reads create no cookies, claims, reservations or provider objects.
  Existing site banner/details/pricing/signup components consume the response.
  Following signup carries its code into the normal verified claim path.
- No-offer visitors see no banner, including after failed background discovery.
  A supplied code or previously loaded offer keeps the existing warning/retry
  controls after failure. Only notice relevance survives a failed refresh; stale
  prices are cleared. Successful empty reads clear the remembered offer; successful
  code removal also clears the supplied code.
- Activation/scheduling ends superseded live revisions under the same programme
  lock. Saving/discarding a draft leaves the current offer alone. Frozen claims,
  accepted terms, provider bindings and financial obligations remain unchanged.
- The operator list shows one programme, with pending draft controls and closed
  revision history. Fully ended programmes start in closed Archives. Discard draft
  and End and archive use the existing confirmed lifecycle operation. Immutable
  recorded revisions are retained instead of adding a destructive delete API.
- The editor reuses FieldGroup, FieldSet, Input and existing design tokens. Fields
  form responsive columns; native `datetime-local` controls display device-local
  time and convert to UTC. Untouched timestamps retain seconds/milliseconds;
  invalid calendar values and nonexistent DST times are rejected.

## Upgrade and rollback

Run ordered migrations before candidate API/worker startup. New data-only migration
`202611180001_reconcile_offer_publication` inserts missing codes only for already
current active/scheduled/paused promotions and ends stale superseded live labels.
It creates no programme or provider coupon and changes no commercial policy.
Existing codes, including intentional blocks, are retained. The existing ledger
and runtime readiness reject a missing migration; a recovered bootstrap ledger
cannot infer this data repair from matching table shape.

Migration/coupon/code identities remain compatible with the retained offer-aware
runtime. A code collision rolls back and leaves readiness closed. Do not edit
bootstrap SQL, rewrite old migration checksums or remove retained offer data.
Hosted rollout belongs to the private cloud companion and requires release
authorization. No package version, tag, publication or deployment is included.

## Verification

Focused source/UI/API tests first reproduced the missing fallback, ungrouped
history and text date inputs. Disposable Postgres tests first reproduced missing
publication and a superseded revision retaining its active label.
Final results are recorded in STATUS.md after qualification.

Final local qualification: 332 core cases, 106 offer integration cases, one
immutable-predecessor upgrade case, 10 Europe/Ljubljana timezone/form cases and
13 final artifact/UI cases pass. Site checks pass (115 functional and 10
dependency-policy cases). Core/site types, scoped lint/format, diff checks and
the app production build pass. The build reports its existing large-chunk warning.
Pre-ship review found no outstanding correctness or scope issue. These results
do not claim deployment, a real customer payment or owner visual acceptance.
