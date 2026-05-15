import { describe, expect, it, vi } from "vitest";

import { buildGravatarAvatarUrl, importUserAvatarFromUrl } from "../../../packages/storage/src/index.js";

describe("user avatar service", () => {
  it("builds gravatar URLs from normalized email addresses", () => {
    expect(buildGravatarAvatarUrl(" Owen@Example.com ")).toBe(
      "https://www.gravatar.com/avatar/ed101575f84994d1bdb81db86bb6a23b?d=404&s=256"
    );
  });

  it("caches supported avatar images in object storage", async () => {
    const saveUserAvatar = vi.fn().mockResolvedValue({
      user_id: "usr_123",
      source: "github",
      object_key: "avatars/users/usr_123/profile",
      content_type: "image/png",
      updated_at: "2026-05-15T00:00:00.000Z"
    });
    const putObject = vi.fn().mockResolvedValue(undefined);
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(Buffer.from("avatar"), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": "6"
        }
      })
    ) as typeof fetch;

    const result = await importUserAvatarFromUrl({
      user_id: "usr_123",
      source: "github",
      url: "https://avatars.example.test/u/123",
      store: { saveUserAvatar },
      objectStoreWriter: { putObject },
      fetchImplementation,
      now: "2026-05-15T00:00:00.000Z"
    });

    expect(result).toEqual({
      ok: true,
      avatar: {
        user_id: "usr_123",
        source: "github",
        object_key: "avatars/users/usr_123/profile",
        content_type: "image/png",
        updated_at: "2026-05-15T00:00:00.000Z"
      }
    });
    expect(putObject).toHaveBeenCalledWith({
      key: "avatars/users/usr_123/profile",
      body: Buffer.from("avatar"),
      contentType: "image/png"
    });
  });

  it("times out slow avatar fetches", async () => {
    const fetchImplementation = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }) as typeof fetch;

    await expect(
      importUserAvatarFromUrl({
        user_id: "usr_123",
        source: "gravatar",
        url: "https://www.gravatar.com/avatar/test",
        store: { saveUserAvatar: vi.fn() },
        objectStoreWriter: { putObject: vi.fn() },
        fetchImplementation,
        timeoutMs: 1
      })
    ).resolves.toEqual({ ok: false, error: "fetch_failed" });
  });
});
