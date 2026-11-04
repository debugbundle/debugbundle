import { expect, it, vi } from "vitest";
import { resolveProbeSigningContext } from "../../../packages/storage/src/metadata-probe-signing.js";
const origin = "10000000-0000-4000-8000-000000000001";
it("rejects a credential-bearing historical input before producing signed runtime context", async () => {
  const query = vi.fn();
  await expect(
    resolveProbeSigningContext(
      { query },
      {
        root_id: origin,
        origin_id: origin,
        activation_origins: [origin],
        definition: {
          id: "10000000-0000-4000-8000-000000000002",
          origin_project_id: origin,
          input_name: "dbundle_proj_synthetic_not_a_real_credential"
        }
      }
    )
  ).rejects.toMatchObject({ code: "probe_sdk_context_invalid" });
  expect(query).not.toHaveBeenCalled();
});
