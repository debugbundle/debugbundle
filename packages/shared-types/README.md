# @debugbundle/shared-types

Shared DebugBundle schemas, types, and constants.

This package is the low-level contract layer used by the DebugBundle SDKs and core services. Most consumers should install `@debugbundle/sdk-node` or `@debugbundle/sdk-browser` instead of depending on this package directly.

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

- Published from the core-owned shared-package release workflow in `debugbundle/debugbundle`.
- Source lives in the DebugBundle workspace during pre-production.