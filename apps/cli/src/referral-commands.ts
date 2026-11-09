import {
  createReferralApi,
  ReferralApiError,
  type ReferralHttpClient
} from "../../../packages/referral-client/src/index.js";
import { ReferralCodeSchema } from "../../../packages/referrals/src/referral-contracts.js";
import { createCliHttpClient } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanOption,
  readIntegerOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult } from "./token-commands.js";
import { z } from "zod";
import { ReferralPayoutRecordSchema } from "../../../packages/referrals/src/referral-ledger-contracts.js";

const actions = [
  "status",
  "join",
  "clients",
  "customer",
  "apply",
  "earnings",
  "payouts",
  "operator-balances",
  "operator-payouts",
  "claim-payout",
  "payout-uncertain",
  "payout-record"
] as const;
export interface ReferralCommandInput {
  action: (typeof actions)[number];
  termsVersion?: string;
  code?: string;
  explicitCorrection?: boolean;
  expectedOrganizationId?: string;
  limit?: number;
  before?: string;
  authFilePath?: string;
  json?: boolean;
  partnerId?: string;
  claimId?: string;
  batchId?: string;
  externalReference?: string;
  confirmedExternalPayment?: boolean;
}
export async function referralsWithAuthCommand(
  input: ReferralCommandInput,
  dependencies: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => ReferralHttpClient;
  } = {}
): Promise<CliCommandResult> {
  try {
    const auth = await (dependencies.readAuthState ?? readCliAuthState)(
      input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }
    );
    const api = createReferralApi(
      (dependencies.createHttpClient ?? createCliHttpClient)({ baseUrl: auth.base_url })
    );
    const scope = { bearerToken: auth.bearer_token };
    const page = {
      ...scope,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.before === undefined ? {} : { before: input.before })
    };
    let result: unknown;
    switch (input.action) {
      case "earnings":
        result = await api.earnings(scope);
        break;
      case "payouts":
        result = { payouts: await api.payouts(page) };
        break;
      case "operator-balances":
        result = { partners: await api.operatorBalances(page) };
        break;
      case "operator-payouts":
        result = {
          payouts: await api.operatorPayouts({
            ...page,
            ...(input.partnerId === undefined ? {} : { partnerId: input.partnerId })
          })
        };
        break;
      case "claim-payout":
        if (!input.partnerId || !input.claimId)
          throw new CliInputError("--partner and a stable --claim UUID are required.");
        result = {
          payout: await api.claimPayout({
            ...scope,
            partnerId: input.partnerId,
            claimId: input.claimId
          })
        };
        break;
      case "payout-uncertain":
        if (!input.batchId) throw new CliInputError("Missing --batch.");
        result = { payout: await api.markPayoutUncertain({ ...scope, batchId: input.batchId }) };
        break;
      case "payout-record":
        if (!input.batchId || !input.externalReference || input.confirmedExternalPayment !== true)
          throw new CliInputError(
            "--batch, --reference and --confirm-external-payment are required. Record only an externally completed payment."
          );
        result = {
          payout: await api.recordPayout({
            ...scope,
            batchId: input.batchId,
            externalReference: input.externalReference,
            confirmedExternalPayment: true
          })
        };
        break;
      case "status":
        result = await api.partner(scope);
        break;
      case "join":
        if (!input.termsVersion)
          throw new CliInputError("Explicit --accept-terms-version is required.");
        result = await api.join({ ...scope, termsVersion: input.termsVersion });
        break;
      case "clients":
        result = {
          clients: await api.clients({
            ...scope,
            ...(input.limit === undefined ? {} : { limit: input.limit }),
            ...(input.before === undefined ? {} : { before: input.before })
          })
        };
        break;
      case "customer":
        result = await api.customer(scope);
        break;
      case "apply":
        if (!input.code) throw new CliInputError("Missing --code.");
        result = {
          attribution: await api.apply({
            ...scope,
            code: input.code,
            explicitCorrection: input.explicitCorrection ?? false,
            ...(input.expectedOrganizationId === undefined
              ? {}
              : { expectedOrganizationId: input.expectedOrganizationId })
          })
        };
        break;
    }
    return { exitCode: 0, output: JSON.stringify(result, null, input.json ? undefined : 2) };
  } catch (error) {
    return {
      exitCode:
        error instanceof ReferralApiError
          ? error.status === 401
            ? 2
            : error.status === 403 || error.status === 409
              ? 5
              : error.status === 400
                ? 4
                : 1
          : error instanceof CliInputError || error instanceof z.ZodError
            ? 4
            : 1,
      output:
        error instanceof ReferralApiError
          ? error.code
          : error instanceof CliInputError
            ? error.message
            : "referral_command_failed"
    };
  }
}
export async function handleReferralCommand(
  parsed: ParsedArgv,
  command: typeof referralsWithAuthCommand = referralsWithAuthCommand
): Promise<CliCommandResult> {
  const action = requirePositional(parsed, 1, "action");
  if (!actions.some((candidate) => candidate === action))
    throw new CliInputError("Unknown referrals action.");
  ensureNoExtraPositionals(parsed, 2);
  expectNoUnknownOptions(parsed, [
    "auth-file",
    "json",
    ...(action === "join"
      ? ["accept-terms-version"]
      : action === "apply"
        ? ["code", "confirm-change", "organization"]
        : action === "clients" || action === "payouts" || action === "operator-balances"
          ? ["limit", "before"]
          : action === "operator-payouts"
            ? ["limit", "before", "partner"]
            : action === "claim-payout"
              ? ["partner", "claim"]
              : action === "payout-uncertain"
                ? ["batch"]
                : action === "payout-record"
                  ? ["batch", "reference", "confirm-external-payment"]
                  : [])
  ]);
  const input: ReferralCommandInput = {
    action: action as ReferralCommandInput["action"],
    json: readBooleanOption(parsed, "json") ?? false
  };
  const authFilePath = readStringOption(parsed, "auth-file");
  if (authFilePath !== undefined) input.authFilePath = authFilePath;
  if (action === "join") {
    const version = readStringOption(parsed, "accept-terms-version");
    if (!version) throw new CliInputError("Explicit --accept-terms-version is required.");
    input.termsVersion = version;
  }
  if (action === "apply") {
    const code = ReferralCodeSchema.safeParse(readStringOption(parsed, "code"));
    if (!code.success) throw new CliInputError("Invalid --code.");
    input.code = code.data;
    input.explicitCorrection = readBooleanOption(parsed, "confirm-change") ?? false;
  }
  if (["clients", "payouts", "operator-balances", "operator-payouts"].includes(action)) {
    const limit = readIntegerOption(parsed, "limit");
    if (limit !== undefined) {
      if (limit < 1 || limit > 100) throw new CliInputError("Invalid --limit.");
      input.limit = limit;
    }
    const before = readStringOption(parsed, "before");
    if (before !== undefined) {
      if (!z.uuid().safeParse(before).success) throw new CliInputError("Invalid --before.");
      input.before = before;
    }
  }
  const readId = (name: string, required: boolean): string | undefined => {
    const value = readStringOption(parsed, name);
    if (value === undefined && !required) return undefined;
    if (!z.uuid().safeParse(value).success)
      throw new CliInputError(`A valid --${name} UUID is required.`);
    return value;
  };
  if (action === "apply") {
    const organizationId = readId("organization", false);
    if (organizationId !== undefined) input.expectedOrganizationId = organizationId;
  }
  if (action === "claim-payout" || action === "operator-payouts") {
    const partnerId = readId("partner", action === "claim-payout");
    if (partnerId !== undefined) input.partnerId = partnerId;
  }
  if (action === "claim-payout") input.claimId = readId("claim", true)!;
  if (action === "payout-uncertain" || action === "payout-record")
    input.batchId = readId("batch", true)!;
  if (action === "payout-record") {
    const reference = ReferralPayoutRecordSchema.shape.external_reference.safeParse(
      readStringOption(parsed, "reference")
    );
    if (!reference.success || readBooleanOption(parsed, "confirm-external-payment") !== true)
      throw new CliInputError(
        "A valid --reference and explicit --confirm-external-payment are required."
      );
    input.externalReference = reference.data;
    input.confirmedExternalPayment = true;
  }
  return command(input);
}
