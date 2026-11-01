# Zod 4 migration

The evidence-quality candidate uses Zod 4.6.7 throughout maintained JavaScript
schema code. This accompanies FR-EVID-01–09 and AC-EVID-01–09; the functional
evidence contract remains in [bundle-evidence-quality.md](bundle-evidence-quality.md).

## Versions and compatibility

`@debugbundle/shared-types` moves to **3.0.0** because its exported Zod schema
objects and TypeScript annotations change major APIs. Direct schema consumers
must migrate from Zod 3 effects/`innerType()` and three-parameter `ZodType`
annotations. Refined objects use Zod 4 `safeExtend()`.

Node and Browser remain **3.2.0** candidates: their capture signatures, ordinary
delivery, and optional evidence negotiation remain compatible. Core remains
**1.20.0**, CLI/MCP/OpenClaw **1.18.0**, redaction **2.7.0**, and the documentation
site **1.6.11**. These are proposed release versions, not publication receipts.
The owner must review the candidate before the release train starts.

Legacy UUID-shaped identifiers use `guid()` so Zod 4's stricter UUID version and
variant check does not reject persisted identifiers or existing requests. Explicit
UUIDv4 evidence references retain their separate stricter contract. Partial enum
maps remain partial, nullable metadata still accepts omission, and CLI profile
validation retains its existing user-facing messages. Zod 4 integer schemas reject
numbers outside JavaScript's safe integer range; callers must not use imprecise
numbers for counters, durations, sizes, or IDs.

## JSON Schema ownership

`packages/shared-types/src/json-schema.ts` uses Zod 4's native exporter with input
semantics. It retains advertised closed-object contracts and optional defaults,
removes the non-enumerable Standard Schema adapter before TypeBox consumption,
and keeps the vocabulary understood by maintained native validators. Reused
shapes are inlined; native validators are not expanded to accept arbitrary new
definition containers. Native wire fixtures remain draft 7; existing public
documents retain their declared dialect. Explicit regex and record-key constraints
are preserved. MCP/OpenClaw frozen-schema tests guard public tool contracts.

`make evidence-fixtures` regenerates the canonical schema and all nine maintained
native copies. For read-only comparison before regeneration, use
`FIXTURE_ARGS='--schema-output .tmp/evidence-release/<name>.json'`.

## Coordinated dependencies

Shared-types 3.0 and redaction 2.7 must be published before Node/Browser 3.2.
Before publication, the owned local candidate harness verifies the packed roots,
updates only their reviewed SDK lock identities and Zod graph, restores temporary
dependency links, and tests clean installed consumers. An ordinary registry-only
install cannot resolve unpublished versions; that is an ordered release step.

Core/site dogfooding pins remain on already published SDK 3.1 until the new SDKs
exist. Their transitive Zod 3 receives the existing verified collection-bound
patch and narrowly scoped audit accounting. It must not be forcibly overridden to
Zod 4. After the new SDK release, resolve these pins through the registry and
remove legacy patch/accounting only when no active dependency requires it.

No release tag, registry publication, hosted deployment, installed WordPress site,
or consumer-product adoption is authorised by these local qualification steps.
