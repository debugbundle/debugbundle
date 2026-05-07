import { describe, expect, it } from "vitest";

import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import {
  ACCEPTED_LOG_FORMATS,
  CANONICAL_LOG_FORMAT,
  buildProjectId,
  formatAcceptedLogFormats,
  parseAcceptedLogFormat,
  parseLogFile
} from "../../../packages/log-parser/src/index.js";

const profile = {
  project: {
    name: "Checkout App",
    repo_url: ""
  },
  services: [
    {
      name: "checkout-api",
      kind: "backend" as const,
      runtime: "php",
      framework: "laravel"
    }
  ]
};

describe("log parser registry", () => {
  it("distinguishes the canonical debugbundle ndjson format from the broader accepted input set", () => {
    expect(CANONICAL_LOG_FORMAT).toBe("debugbundle-ndjson");
    expect(ACCEPTED_LOG_FORMATS).toEqual(["debugbundle-ndjson", "php-error", "apache-error"]);
    expect(parseAcceptedLogFormat("debugbundle-ndjson")).toBe("debugbundle-ndjson");
    expect(parseAcceptedLogFormat("php-error")).toBe("php-error");
    expect(parseAcceptedLogFormat("apache-error")).toBe("apache-error");
    expect(parseAcceptedLogFormat("python-traceback")).toBeNull();
    expect(formatAcceptedLogFormats()).toBe("debugbundle-ndjson, php-error, apache-error");
  });

  it("treats debugbundle-ndjson as the canonical structured interchange format", () => {
    const envelope = createEventEnvelope({
      event_type: "backend_exception",
      project_id: buildProjectId(profile),
      sdk_name: "debugbundle-python",
      sdk_version: "0.1.0",
      occurred_at: "2026-03-21T10:20:30.000Z",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "python",
        framework: "fastapi"
      },
      payload: {
        name: "ValueError",
        message: "discount rule failed",
        stack: "ValueError: discount rule failed",
        handled: false,
        request: {
          method: "GET",
          path: "/checkout",
          query: {},
          headers: {}
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "3.12"
        }
      }
    });

    const events = parseLogFile(`${JSON.stringify(envelope)}\n`, {
      filePath: "/var/log/debugbundle.ndjson",
      format: "debugbundle-ndjson",
      profile
    });

    expect(events).toEqual([envelope]);
  });

  it("parses php error logs through the shared parser package", () => {
    const events = parseLogFile(
      [
        "[21-Mar-2026 10:20:30 UTC] PHP Fatal error:  Uncaught TypeError: Checkout failed in /srv/app/checkout.php:42",
        "Stack trace:",
        "#0 /srv/app/index.php(10): CheckoutService->run()",
        "#1 {main}",
        "  thrown in /srv/app/checkout.php on line 42"
      ].join("\n"),
      {
        filePath: "/var/log/php_errors.log",
        format: "php-error",
        profile
      }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production"
      },
      payload: {
        name: "TypeError",
        message: "Checkout failed"
      }
    });
  });
});