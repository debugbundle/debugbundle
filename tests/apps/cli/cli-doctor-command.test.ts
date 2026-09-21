import { describe, expect, it, vi } from "vitest";
import {
  writeFile,
  join,
  doctorCommand,
  setupCommand,
  createDoctorFixtureRepository,
  createRelaySpoolFixture,
  markProfileAgentValidated
} from "../../helpers/cli-doctor.js";

describe("cli-doctor core", () => {
  it("reports undelivered relay spool counts and ages when --check-relay is enabled", async () => {
    const rootDirectory = await createDoctorFixtureRepository();
    const now = new Date("2026-03-14T12:00:00.000Z");

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => now
      }
    );

    await createRelaySpoolFixture(rootDirectory, now);

    const result = await doctorCommand(
      {
        json: true,
        checkRelay: true
      },
      {
        cwd: () => rootDirectory,
        now: () => now,
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      warnings: string[];
      errors: string[];
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.status).toBe("warning");
    expect(parsed.checks[7]).toEqual({
      name: "relay-spool",
      status: "warning",
      message: "Found 2 undelivered relay spool files; oldest is 3 days old."
    });
    expect(parsed.warnings).toContain(
      "Found 2 undelivered relay spool files; oldest is 3 days old."
    );
    expect(parsed.errors).toEqual([]);
  });

  it("returns a deterministic privacy preview when --privacy is enabled", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await markProfileAgentValidated(rootDirectory);

    const result = await doctorCommand(
      {
        json: true,
        privacy: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "healthy",
      privacy_preview: {
        policy_version: "telemetry-privacy-v1",
        rule_families: expect.arrayContaining([
          "sensitive_keys",
          "credential_text",
          "urls",
          "private_keys",
          "payment_cards"
        ]),
        limits: { max_depth: 16, max_string_bytes: 16384, max_event_bytes: 262144 },
        redaction_count: expect.any(Number),
        sample_event_type: "request_event",
        sample_event_class: "incident_signal",
        sample_can_create_incident: true,
        redacted_fields: [
          "headers.authorization",
          "headers.cookie",
          "body.password",
          "body.card_number",
          "body.otp",
          "context.apiKey"
        ],
        omitted_fields: [],
        retained_metadata: {
          service: "checkout-api",
          environment: "production",
          method: "POST",
          route_template: "/checkout/:orderId",
          response_status: 503
        },
        incident_rule:
          "request_event incident classification follows the resolved capture preset: 5xx always create incidents, balanced also promotes 408/423/424/425/429, and investigative also promotes 409.",
        redacted_sample: {
          context: { apiKey: "[REDACTED]", operation: "checkout" },
          payload: {
            headers: {
              authorization: "[REDACTED]",
              cookie: "[REDACTED]"
            },
            body: {
              password: "[REDACTED]",
              card_number: "[REDACTED]",
              otp: "[REDACTED]"
            }
          }
        }
      }
    });
    expect(result.output).not.toContain("privacy-preview-api-key");
  });

  it("renders the privacy preview in human output using the default auth-state wiring", async () => {
    const rootDirectory = await createDoctorFixtureRepository();
    const authFilePath = join(rootDirectory, ".debugbundle", "auth.json");

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await markProfileAgentValidated(rootDirectory);
    await writeFile(
      authFilePath,
      `${JSON.stringify({ bearer_token: "dbundle_mem_secret_token", base_url: "https://api.debugbundle.com" }, null, 2)}\n`,
      "utf8"
    );

    vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    const result = await doctorCommand({ authFilePath, privacy: true });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("DebugBundle doctor report.");
    expect(result.output).toContain("Privacy preview:");
    expect(result.output).toContain("sample_can_create_incident: yes");
    expect(result.output).toContain("omitted_fields: none");
    expect(result.output).toContain("Redacted sample:");
    expect(result.output).toContain('"authorization": "[REDACTED]"');
  });

  it("reports an ok relay status when the spool directory exists but all events are delivered", async () => {
    const rootDirectory = await createDoctorFixtureRepository();
    const now = new Date("2026-03-14T12:00:00.000Z");

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => now
      }
    );

    await markProfileAgentValidated(rootDirectory);
    await createRelaySpoolFixture(rootDirectory, now);
    await writeFile(
      join(
        rootDirectory,
        ".debugbundle",
        "local",
        "browser-relay-spool",
        "20260314-1-checkout-web.events.json.delivered"
      ),
      "\n",
      "utf8"
    );
    await writeFile(
      join(
        rootDirectory,
        ".debugbundle",
        "local",
        "browser-relay-spool",
        "20260314-2-checkout-web.events.json.delivered"
      ),
      "\n",
      "utf8"
    );

    const result = await doctorCommand(
      {
        json: true,
        checkRelay: true
      },
      {
        cwd: () => rootDirectory,
        now: () => now,
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    const parsed = JSON.parse(result.output) as {
      status: string;
      checks: Array<{ name: string; status: string; message: string }>;
      warnings: string[];
      errors: string[];
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.status).toBe("healthy");
    expect(parsed.checks[7]).toEqual({
      name: "relay-spool",
      status: "ok",
      message: "No undelivered relay spool files found."
    });
    expect(parsed.warnings).toEqual([]);
    expect(parsed.errors).toEqual([]);
  });

  it("reports an ok relay status when the spool directory is missing", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    const result = await doctorCommand(
      {
        json: true,
        checkRelay: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    expect(JSON.parse(result.output)).toMatchObject({
      status: "warning",
      checks: expect.arrayContaining([
        {
          name: "relay-spool",
          status: "ok",
          message: "No undelivered relay spool files found."
        }
      ])
    });
  });

  it("reports a relay spool path that exists but is not a directory", async () => {
    const rootDirectory = await createDoctorFixtureRepository();

    await setupCommand(
      {},
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z")
      }
    );

    await writeFile(
      join(rootDirectory, ".debugbundle", "local", "browser-relay-spool"),
      "not-a-directory\n",
      "utf8"
    );

    const result = await doctorCommand(
      {
        json: true,
        checkRelay: true
      },
      {
        cwd: () => rootDirectory,
        now: () => new Date("2026-03-14T00:00:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        })
      }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.output)).toMatchObject({
      status: "error",
      checks: expect.arrayContaining([
        {
          name: "relay-spool",
          status: "error",
          message: "Invalid .debugbundle/local/browser-relay-spool"
        }
      ])
    });
  });
});
