# JavaScript Analytics cutover — local release draft

Status: draft for the first browser and Node release candidate. No package, site/app install, capability, or production setting has changed. Fill dates and exact published versions only after the complete acceptance gate; this document does not start the old-writer window.

## One current setup

New browser installs get one documented Analytics configuration and one Analytics UI. The temporary `analytics.schemaVersion` switch in the unpublished browser source is an internal rollout guard and must not be the first-install choice. The Node server writer is separate because it owns committed business facts and its `dbundle_anl_` credential stays on the backend. The browser never receives that credential. Internal date-stamped event schema values remain in persisted payloads for parsing; they are not customer-facing product editions.

Keep existing debug capture and `/v1/events` behavior. During the upgrade, accept old analytics payloads from installed browser packages without double emitting or counting them as new semantic facts. Historical saved funnels and `analytics_bundle.v1` artifacts remain readable for their retention/artifact obligations. An old `funnel_step` or `conversion` has no verified catalog revision or committed success boundary and must not be backfilled as one.

## Known installs to upgrade

| Install | Current source | Required cutover check |
| --- | --- | --- |
| Site | `site/package.json` pins browser SDK `3.0.3`; `site/src/lib/dogfooding.ts` uses direct project-token capture | Move to the accepted browser package and current Analytics setup; preserve the existing local enable flag and safe page/route behavior. Verify no duplicate page/session facts. |
| App | `apps/web/package.json` pins browser SDK `3.0.3`; `apps/web/src/lib/dogfooding.ts` uses direct capture in hosted mode and a same-origin debug relay in development | Move to the same accepted browser package and current Analytics setup. Keep route-ID templating and explicit router page views. A credential-free semantic relay must pass its own gate before it is used. |
| Backend | No installed semantic Node writer | Add the accepted Node package only at actual committed business boundaries, with application-owned outbox storage. Never treat a best-effort queue or fulfilled `flush()` as a durable business receipt. |

The site/app are the only known old analytics writers today, not a verified inventory of all active writers. Confirm the active token/source inventory and installed versions before setting a cutoff date. The mixed local fixture proves the old and new worker lanes and storage readers can coexist; it is not an actual installed site/app upgrade or a historical dashboard render.

## Cutover record and removal

1. Finish authenticated identity/relay, source and loss quality, complete projections, reports, UI, SDK package and integrated gates. Keep semantic capability and ingress disabled until then.
2. Publish/release only after separate owner authorization. Upgrade both known site/app installs, verify the real installed packages and both historical/current dashboard reads, and record the **later** actual upgrade date as `T0`.
3. If no other active old analytics writer exists, accept old analytics payloads for 30 days after `T0`; record `T0 + 30 days` as the earliest cutoff. If another writer exists, migrate it and revisit the cutoff before removal.
4. In a separate reviewed change after the window, remove the old analytics capture/processing lane and its no-longer-needed compatibility code. Keep historical readers only while retention and versioned artifact obligations require them. Do not remove debug event ingestion.

Release record to fill: accepted browser/Node package versions, site upgrade date, app upgrade date, `T0`, old-writer inventory result, cutoff date, historical read evidence, current report/quality evidence, and owner authorization for each publish/deploy/removal action.
