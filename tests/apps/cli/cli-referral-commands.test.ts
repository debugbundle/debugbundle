import { expect, it, vi } from "vitest";
import { runCli } from "../../../apps/cli/src/main.js";
import { referralsWithAuthCommand } from "../../../apps/cli/src/referral-commands.js";
import { REFERRAL_TERMS_VERSION } from "../../../packages/referrals/src/referral-contracts.js";

it("requires explicit terms acceptance and explicit attribution correction", async () => {
  const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  expect((await runCli(["referrals", "join"], { referralsCommand: command })).exitCode).not.toBe(0);
  expect(command).not.toHaveBeenCalled();
  await runCli(["referrals", "join", "--accept-terms-version", REFERRAL_TERMS_VERSION, "--json"], {
    referralsCommand: command
  });
  expect(command).toHaveBeenLastCalledWith({
    action: "join",
    termsVersion: REFERRAL_TERMS_VERSION,
    json: true
  });
  await runCli(["referrals", "apply", "--code", "ABCD234567", "--confirm-change"], {
    referralsCommand: command
  });
  expect(command).toHaveBeenLastCalledWith({
    action: "apply",
    code: "ABCD234567",
    explicitCorrection: true,
    json: false
  });
});
it("rejects unknown options and extra identities before transport", async () => {
  const command = vi.fn();
  for (const args of [
    ["clients", "--limit", "101"],
    ["apply", "--code", "bad"],
    ["status", "--user-id", "other"]
  ]) {
    expect((await runCli(["referrals", ...args], { referralsCommand: command })).exitCode).not.toBe(
      0
    );
  }
  expect(command).not.toHaveBeenCalled();
});
it("uses the authenticated actor and preserves a policy refusal without exposing the credential", async () => {
  const request = vi.fn().mockResolvedValue({ status: 409, body: { error: "attribution_frozen" } });
  const result = await referralsWithAuthCommand(
    { action: "apply", code: "ABCD234567" },
    {
      readAuthState: vi.fn().mockResolvedValue({
        base_url: "https://api.debugbundle.com",
        bearer_token: "private-token"
      }),
      createHttpClient: () => ({ request })
    }
  );
  expect(result.exitCode).toBe(5);
  expect(result.output).toBe("attribution_frozen");
  expect(request).toHaveBeenCalledWith({
    bearerToken: "private-token",
    method: "POST",
    path: "/v1/referrals/attribution",
    body: { code: "ABCD234567", explicit_correction: false }
  });
});
it("requires a stable payout claim ID and explicit confirmation before recording an external payment", async () => {
  const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" }),
    id = "11111111-1111-4111-8111-111111111111";
  expect(
    (await runCli(["referrals", "claim-payout", "--partner", id], { referralsCommand: command }))
      .exitCode
  ).not.toBe(0);
  expect(
    (
      await runCli(["referrals", "payout-record", "--batch", id, "--reference", "bank-001"], {
        referralsCommand: command
      })
    ).exitCode
  ).not.toBe(0);
  expect(command).not.toHaveBeenCalled();
  await runCli(["referrals", "claim-payout", "--partner", id, "--claim", id], {
    referralsCommand: command
  });
  expect(command).toHaveBeenLastCalledWith({
    action: "claim-payout",
    partnerId: id,
    claimId: id,
    json: false
  });
  await runCli(
    [
      "referrals",
      "payout-record",
      "--batch",
      id,
      "--reference",
      "bank-001",
      "--confirm-external-payment"
    ],
    { referralsCommand: command }
  );
  expect(command).toHaveBeenLastCalledWith({
    action: "payout-record",
    batchId: id,
    externalReference: "bank-001",
    confirmedExternalPayment: true,
    json: false
  });
});
