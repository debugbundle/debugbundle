import { describe, expect, it, vi } from "vitest";

import { createGitHubDispatchTransport } from "../../../apps/worker/src/worker-notifications.js";
import { createGitHubInstallationTokenFixture } from "../../helpers/github-installation-token.js";

describe("GitHub dispatch transport", () => {
  it.each(["stateful", "stateless"] as const)(
    "preserves %s installation tokens through caching and dispatch authentication",
    async (tokenFormat) => {
      const installationToken = createGitHubInstallationTokenFixture(tokenFormat);
      const expectedTokenLength = tokenFormat === "stateful" ? 40 : 520;
      const expectedTokenSegments = tokenFormat === "stateful" ? 1 : 3;
      let cachedToken: string | null = null;
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ token: installationToken }))
        .mockResolvedValue(new Response(null, { status: 204 }));
      const get = vi.fn(async () => cachedToken);
      const set = vi.fn(async (_key: string, value: string) => {
        cachedToken = value;
      });

      const transport = createGitHubDispatchTransport({
        appId: "123",
        privateKey: "test-only-private-key-not-used",
        tokenCache: { get, set },
        fetchImpl,
        now: () => new Date("2026-08-26T00:00:00.000Z"),
        createAppJwt: () => "jwt_123"
      });

      const delivery = {
        delivery_id: "gdd_token_format",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "debugbundle",
        dispatch_payload: {}
      };

      await transport.deliver(delivery);
      await transport.deliver({ ...delivery, delivery_id: "gdd_token_format_cached" });

      expect(installationToken).toHaveLength(expectedTokenLength);
      expect(installationToken.split(".")).toHaveLength(expectedTokenSegments);
      expect(get).toHaveBeenCalledTimes(2);
      expect(set).toHaveBeenCalledWith(
        "github-installation-token:99",
        installationToken,
        50 * 60
      );
      expect(set).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(fetchImpl).toHaveBeenNthCalledWith(
        1,
        "https://api.github.com/app/installations/99/access_tokens",
        expect.objectContaining({ method: "POST" })
      );
      for (const callNumber of [2, 3]) {
        expect(fetchImpl).toHaveBeenNthCalledWith(
          callNumber,
          "https://api.github.com/repos/debugbundle/debugbundle/dispatches",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({ authorization: `Bearer ${installationToken}` })
          })
        );
      }
    }
  );
});
