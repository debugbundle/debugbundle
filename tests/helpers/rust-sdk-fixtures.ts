import { readFileSync } from "node:fs";
import { EventEnvelopeSchema } from "../../packages/shared-types/src/index.js";

/** Actual protected arrays emitted by the extracted Rust candidate's local
 * transport. Provenance is recorded in spec/sdks/rust-sdk-progress.md. */
export function rustSdkEvents() {
  return EventEnvelopeSchema.array().parse(
    JSON.parse(
      readFileSync(new URL("../fixtures/evidence/rust-local-events.json", import.meta.url), "utf8")
    )
  );
}
