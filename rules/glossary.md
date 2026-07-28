# DebugBundle Glossary

This glossary defines durable product terms used across requirements, contracts, interfaces,
and implementation documentation. Source-of-truth requirements and contracts remain
authoritative when a term's behavior is specified in more detail.

## SDK Reliability Terms

### Ingestion Acknowledgement

The indexed `accepted`, `rejected`, and `errors` result returned for a connected
event batch. SDKs use it to remove accepted or terminally rejected events,
retain only retryable rejections, and avoid reporting delivery health when no
event was accepted.

### SDK Compatibility Adapter

A narrow, authenticated ingestion normalization path for an exact previously
published SDK event shape. It protects installed projects during a documented
upgrade window without relaxing the canonical schema for new SDK versions.

### `beforeSend`

An optional synchronous, application-local SDK hook that receives a fully
built and redacted event immediately before local capture-policy evaluation.
Returning the event keeps it, returning the language-equivalent null drops it,
and hook failure or invalid output preserves the original event without
throwing into host code.

## Analytics Terms

### AnalyticsBundle

A deterministic, versioned analytics artifact for one bounded analysis question, such as
funnel dropoff, route health, journey friction, incident impact, deploy comparison, feature
usage, or conversion path analysis. An AnalyticsBundle is generated on demand or from an
analytics opportunity; it is not created for every visit or session.

### Analytics Event

An opt-in browser product-usage envelope with `event_type: "analytics_event"`. Analytics
events use independent consent, privacy, sampling, allowance, transport, processing, and
retention paths from debug events and never create incidents directly.

### Analytics Opportunity

A project-scoped, deterministic finding produced from aggregate or correlation-backed
evidence after a supported threshold is crossed. Opportunities have stable fingerprints and
an explicit open, snoozed, resolved, or recurring lifecycle; a listed opportunity does not
imply that an AnalyticsBundle has already been generated.

### Rollup

A precomputed aggregate row for a bounded time bucket and safe dimensions. Rollups support
metrics such as sessions, page views, routes, transitions, actions, funnels, conversions,
devices, referrers, and approved custom dimensions without retaining a long-term raw event
search index.

### Retained Journey Sample

A short-lived, privacy-safe structured timeline selected from an analytics session. It may
contain normalized routes, semantic actions, funnel steps, conversion or friction markers,
timing, and correlation-safe incident references, but never video, screenshots, raw DOM,
form values, or raw user text.

### Saved Funnel

A reusable project configuration containing a stable funnel key and an ordered set of two to
twenty unique semantic step keys. Saved funnels are configuration, not per-visit artifacts,
and their active count is bounded independently from monthly analytics usage allowances.

### Controlled Custom Dimension

A customer-defined, explicitly approved, low-cardinality analytics key/value used for
aggregate segmentation. Keys and values are schema-bounded, sensitive or high-cardinality
data is rejected, and the number of approved keys is capped by tier.

### Strict Privacy Mode

The default analytics identity mode. It keeps analytics session-scoped and omits durable
returning-visitor and user identity hashes; server settings may force this mode even when a
client requests a less restrictive mode.
