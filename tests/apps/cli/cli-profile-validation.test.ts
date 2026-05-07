import { describe, expect, it, vi } from "vitest";

import { validateProfile } from "../../../apps/cli/src/profile-validation.js";

describe("cli profile validation", () => {
  it("returns a missing-file error when the profile does not exist", async () => {
    const result = await validateProfile("/tmp/workspace", {
      stat: vi.fn().mockRejectedValue({ code: "ENOENT" })
    });

    expect(result).toEqual({
      valid: false,
      errors: [
        {
          path: ".debugbundle/profile.json",
          message: "Missing .debugbundle/profile.json"
        }
      ]
    });
  });

  it("returns an invalid-file error when the profile JSON is malformed", async () => {
    const result = await validateProfile("/tmp/workspace", {
      stat: vi.fn().mockResolvedValue({
        isDirectory: () => false
      }),
      readFile: vi.fn().mockResolvedValue("not json")
    });

    expect(result).toEqual({
      valid: false,
      errors: [
        {
          path: ".debugbundle/profile.json",
          message: "Invalid .debugbundle/profile.json"
        }
      ]
    });
  });

  it("rethrows unexpected stat failures", async () => {
    const failure = new Error("permission_denied");

    await expect(
      validateProfile("/tmp/workspace", {
        stat: vi.fn().mockRejectedValue(failure)
      })
    ).rejects.toBe(failure);
  });
});