import { describe, expect, it } from "vitest";

import { isLowValueExternalProbeRequestFailure404 } from "../../../packages/shared-types/src/index.js";

describe("request failure noise classification", () => {
  it.each([
    "/.env",
    "/autodiscover/autodiscover.json",
    "/backup/api_keys.json",
    "/containers/json",
    "/developmentserver/metadatauploader",
    "/wp-config.php_old2024",
    "/wp-login.php",
    "/owa/auth/logon.aspx",
    "/cgi-bin/luci",
    "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
    "/site-backup.zip",
    "/database.sql"
  ])("classifies %s as low-value external probe noise", (routeTemplate) => {
    expect(
      isLowValueExternalProbeRequestFailure404({
        httpMethod: "GET",
        routeTemplate,
        responseStatus: 404
      })
    ).toBe(true);
  });

  it("does not suppress non-404s or non-GETs", () => {
    expect(
      isLowValueExternalProbeRequestFailure404({
        httpMethod: "POST",
        routeTemplate: "/wp-login.php",
        responseStatus: 404
      })
    ).toBe(false);
    expect(
      isLowValueExternalProbeRequestFailure404({
        httpMethod: "GET",
        routeTemplate: "/wp-login.php",
        responseStatus: 403
      })
    ).toBe(false);
  });

  it("keeps ordinary app 404s eligible for anomaly detection", () => {
    expect(
      isLowValueExternalProbeRequestFailure404({
        httpMethod: "GET",
        routeTemplate: "/checkout/:orderId",
        responseStatus: 404,
        headers: {
          host: "app.example.test"
        }
      })
    ).toBe(false);
  });

  it("suppresses generic admin/login probes only for direct-IP requests", () => {
    expect(
      isLowValueExternalProbeRequestFailure404({
        httpMethod: "GET",
        routeTemplate: "/login",
        responseStatus: 404,
        headers: {
          host: "203.0.113.10"
        }
      })
    ).toBe(true);
    expect(
      isLowValueExternalProbeRequestFailure404({
        httpMethod: "GET",
        routeTemplate: "/login",
        responseStatus: 404,
        headers: {
          host: "app.example.test"
        }
      })
    ).toBe(false);
  });
});
