# @debugbundle/shared-types

Shared DebugBundle schemas, types, and constants.

This package is the low-level contract layer used by the DebugBundle SDKs and core services. Most consumers should install `@debugbundle/sdk-node` or `@debugbundle/sdk-browser` instead of depending on this package directly.

## Upgrading to 3.0

Version 3 uses Zod 4.6.7 or later. Direct consumers of the exported schema objects
must use Zod 4 types and APIs: refinements now remain on their object/string
schemas, and refined objects can be extended with `safeExtend()`. Replace Zod 3
`ZodEffects`/`innerType()` handling and three-parameter `ZodType` annotations with
their Zod 4 equivalents. The major version reflects this TypeScript/schema API
change. Event envelopes and Bundle v1 remain compatible, including legacy UUID
shape acceptance, optional fields, partial channel maps and nullable metadata.
Integer schemas now enforce JavaScript's safe integer range; avoid imprecise
numeric values. See the core repository's `spec/zod-v4-migration.md` for the
coordinated dependency and generated-schema migration.

The Node and Browser SDKs consume this dependency internally; their 3.2 capture
APIs and event formats remain compatible. The new bounded evidence and recovery
features still require a verified supporting receiver path.

## Install

Published package:

```bash
npm install @debugbundle/shared-types
```

## Example

```ts
import { EventEnvelopeSchema, createEventEnvelope } from "@debugbundle/shared-types";

const event = createEventEnvelope({
  event_type: "log_event",
  project_token: "dbundle_proj_example",
  service: {
    name: "example-service",
    environment: "development",
    runtime: "node"
  },
  payload: {
    level: "error",
    message: "example log"
  }
});

EventEnvelopeSchema.parse(event);
```

## Notes

- Version 2.1 adds browser page lifecycle and bounded target-attribute capture matchers, alert noise policies, and optional correlated recovery evidence. Bundle schemas remain version 1 and existing SDK event envelopes stay compatible.
- Published from the core-owned shared-package release workflow in `debugbundle/debugbundle`.
- Source remains core-owned in the DebugBundle workspace and is published through the shared-package release workflow.
