import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import { offersWithAuthCommand } from "../../../apps/cli/src/offer-commands.js";
import { offerVersion } from "../../helpers/offer-fixtures.js";
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
it("saves a chosen promotional code through the existing delegated draft command", async () => {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-promotion-draft-"));
  temporary.push(root);
  const file = join(root, "proof");
  await writeFile(file, "a".repeat(43), { mode: 0o600 });
  const version = {
    ...offerVersion,
    state: "draft" as const,
    policy: { ...offerVersion.policy, kind: "promotion" as const, commission_basis_points: 0 }
  };
  const request = vi.fn().mockResolvedValue({ status: 200, body: { programme: version } });
  const result = await offersWithAuthCommand(
    {
      action: "draft",
      operatorProofFile: file,
      payload: {
        name: version.name,
        public_description: version.public_description,
        policy: version.policy,
        promotion_code: "blckfryd26"
      }
    },
    {
      readAuthState: async () => ({ base_url: "https://api.test", bearer_token: "member" }),
      createHttpClient: () => ({ request })
    }
  );
  expect(result.exitCode).toBe(0);
  expect(request).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      path: "/v2/offers/operator/programmes",
      body: expect.objectContaining({ promotion_code: "BLCKFRYD26" })
    })
  );
});
it("submits a commission above 50 percent without changing the selected rate", async () => {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-offer-rate-"));
  temporary.push(root);
  const file = join(root, "proof");
  await writeFile(file, "a".repeat(43), { mode: 0o600 });
  const version = {
    ...offerVersion,
    state: "draft" as const,
    policy: { ...offerVersion.policy, commission_basis_points: 7500 }
  };
  const request = vi.fn().mockResolvedValue({ status: 200, body: { programme: version } });
  const result = await offersWithAuthCommand(
    {
      action: "draft",
      operatorProofFile: file,
      payload: {
        name: version.name,
        public_description: version.public_description,
        policy: version.policy
      }
    },
    {
      readAuthState: async () => ({ base_url: "https://api.test", bearer_token: "member" }),
      createHttpClient: () => ({ request })
    }
  );
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.output)).toMatchObject({
    programme: { policy: { commission_basis_points: 7500 } }
  });
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ body: expect.objectContaining({ policy: version.policy }) })
  );
});
it("maps explicit workspace and correction flags without accepting a proof on the command line", async () => {
  const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  expect(
    (
      await runCli(
        [
          "offers",
          "apply",
          "--code",
          "OWEN20",
          "--organization",
          "11111111-1111-4111-8111-111111111111",
          "--confirm-change"
        ],
        { offersCommand: command }
      )
    ).exitCode
  ).toBe(0);
  expect(command).toHaveBeenCalledWith({
    action: "apply",
    payload: {
      code: "OWEN20",
      expected_organization_id: "11111111-1111-4111-8111-111111111111",
      explicit_correction: true
    }
  });
  expect(
    (
      await runCli(["offers", "operator_programmes", "--operator-proof", "secret"], {
        offersCommand: command
      })
    ).exitCode
  ).toBe(4);
  expect(command).toHaveBeenCalledOnce();
});
it("sends a private, bounded proof only as supplemental authority and never prints it", async () => {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-offer-cli-"));
  temporary.push(root);
  const file = join(root, "proof"),
    proof = "a".repeat(43);
  await writeFile(file, proof, { mode: 0o600 });
  const request = vi.fn().mockResolvedValue({ status: 200, body: { programmes: [] } }),
    dependencies = {
      readAuthState: async () => ({ base_url: "https://api.test", bearer_token: "member-secret" }),
      createHttpClient: () => ({ request })
    };
  const input = {
    action: "operator_programmes" as const,
    payload: { limit: 25 },
    operatorProofFile: file
  };
  const result = await offersWithAuthCommand(input, dependencies);
  expect(result).toEqual({ exitCode: 0, output: '{\n  "programmes": []\n}' });
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      operatorProof: proof,
      bearerToken: "member-secret",
      path: "/v2/offers/operator/programmes?limit=25"
    })
  );
  expect(result.output).not.toContain(proof);
  await chmod(file, 0o644);
  expect((await offersWithAuthCommand(input, dependencies)).exitCode).toBe(1);
  expect(request).toHaveBeenCalledOnce();
  await chmod(file, 0o600);
  await writeFile(file, "a".repeat(2048));
  expect((await offersWithAuthCommand(input, dependencies)).exitCode).toBe(1);
  expect(request).toHaveBeenCalledOnce();
});
it("uses bounded JSON inputs for complex operations and returns safe provider errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-offer-input-"));
  temporary.push(root);
  const file = join(root, "input.json");
  await writeFile(
    file,
    JSON.stringify({ from: "2026-11-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" })
  );
  const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  expect(
    (
      await runCli(
        [
          "offers",
          "operator_performance",
          "--input",
          file,
          "--operator-proof-file",
          "/private-proof"
        ],
        { offersCommand: command }
      )
    ).exitCode
  ).toBe(0);
  expect(command).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "operator_performance",
      payload: { from: "2026-11-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" }
    })
  );
  await writeFile(file, "[]");
  expect(
    (await runCli(["offers", "draft", "--input", file], { offersCommand: command })).exitCode
  ).toBe(4);
  const result = await offersWithAuthCommand(
    { action: "context", payload: { code: "OWEN20" } },
    {
      readAuthState: async () => ({ base_url: "https://api.test", bearer_token: "member-secret" }),
      createHttpClient: () => ({
        request: async () => ({ status: 503, body: { error: "raw-private-provider-secret" } })
      })
    }
  );
  expect(result.exitCode).toBe(1);
  expect(result.output).not.toMatch(/raw-private|member-secret/);
});
it("requires a private preferences input file and prints only the masked response", async () => {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-payout-input-"));
  temporary.push(root);
  const file = join(root, "preferences.json"),
    id = "11111111-1111-4111-8111-111111111111";
  const payload = {
    expected_user_id: id,
    programme_id: id,
    expected_revision: null,
    details: {
      method: "wise",
      holder: "Private Recipient",
      destination: "@private",
      country: "CA",
      currency: "cad"
    }
  };
  await writeFile(file, JSON.stringify(payload), { mode: 0o644 });
  const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  expect(
    (
      await runCli(["offers", "save_payout_preferences", "--input", file], {
        offersCommand: command
      })
    ).exitCode
  ).toBe(4);
  expect(command).not.toHaveBeenCalled();
  await chmod(file, 0o600);
  expect(
    (
      await runCli(["offers", "save_payout_preferences", "--input", file], {
        offersCommand: command
      })
    ).exitCode
  ).toBe(0);
  expect(command).toHaveBeenCalledWith({ action: "save_payout_preferences", payload });
  const request = vi.fn().mockResolvedValue({
    status: 200,
    body: {
      preference: {
        programme_id: id,
        revision: id,
        method: "wise",
        country: "CA",
        currency: "cad",
        masked_destination: "••••vate",
        updated_at: "2026-11-16T00:00:00.000Z"
      }
    }
  });
  const result = await offersWithAuthCommand(
    { action: "save_payout_preferences", payload },
    {
      readAuthState: async () => ({ base_url: "https://api.test", bearer_token: "member-secret" }),
      createHttpClient: () => ({ request })
    }
  );
  expect(result.exitCode).toBe(0);
  expect(result.output).not.toMatch(/Private Recipient|@private|member-secret/);
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ path: "/v2/referrals/payout-preferences", body: payload })
  );
});
