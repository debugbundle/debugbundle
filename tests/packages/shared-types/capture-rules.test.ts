import { describe, expect, it } from "vitest";

import {
  CaptureRuleActionSchema,
  CaptureRuleCreateSchema,
  CaptureRuleMatcherSchema,
  CaptureRuleSchema,
  CaptureRuleUpdateSchema,
  CaptureRulesFileSchema,
  applyCaptureRuleEventClass,
  buildCaptureRuleEvaluationContext,
  evaluateCaptureRules,
  getCaptureRuleSpecificityScore,
  isCaptureRuleActive,
  type CaptureRule,
} from "../../../packages/shared-types/src/capture-rules.ts";

const baseRule: CaptureRule = {
  id: "00000000-0000-4000-8000-000000000101",
  project_id: "00000000-0000-4000-8000-000000000001",
  name: "Demote analytics resource noise",
  description: null,
  enabled: true,
  action: "demote",
  matcher: {
    event_types: ["frontend_exception"],
    browser_event_kind: "resource_error",
    resource_url: {
      host: "analytics.example.com",
    },
  },
  sample_rate: null,
  sample_event_class: null,
  created_by_user_id: null,
  created_from_incident_id: null,
  created_from_event_id: null,
  expires_at: null,
  hit_count: 0,
  last_matched_at: null,
  created_at: "2026-05-26T10:00:00.000Z",
  updated_at: "2026-05-26T10:00:00.000Z",
};

describe("capture rule schemas", () => {
  it("accepts valid rule actions", () => {
    expect(CaptureRuleActionSchema.safeParse("demote").success).toBe(true);
    expect(CaptureRuleActionSchema.safeParse("sample").success).toBe(true);
    expect(CaptureRuleActionSchema.safeParse("drop").success).toBe(true);
  });

  it("rejects invalid rule actions", () => {
    expect(CaptureRuleActionSchema.safeParse("ignore").success).toBe(false);
  });

  it("normalizes structured host matchers", () => {
    const parsed = CaptureRuleMatcherSchema.parse({
      event_types: ["frontend_exception"],
      browser_event_kind: "resource_error",
      resource_url: {
        host: "ANALYTICS.EXAMPLE.COM",
        path_prefix: "/bundle.js",
      },
    });

    expect(parsed.resource_url).toEqual({
      host: "analytics.example.com",
      path_prefix: "/bundle.js",
    });
  });

  it("rejects matchers that only constrain event type", () => {
    expect(
      CaptureRuleMatcherSchema.safeParse({
        event_types: ["frontend_exception"],
      }).success
    ).toBe(false);
  });

  it("rejects browser resource rules without host, path, or fingerprint narrowing", () => {
    expect(
      CaptureRuleMatcherSchema.safeParse({
        browser_event_kind: "resource_error",
        event_types: ["frontend_exception"],
        first_party: false,
      }).success
    ).toBe(false);
  });

  it("accepts valid persisted rules", () => {
    expect(CaptureRuleSchema.safeParse(baseRule).success).toBe(true);
  });

  it("accepts prefixed project and user identifiers", () => {
    const parsed = CaptureRuleSchema.parse({
      ...baseRule,
      project_id: "proj_123",
      created_by_user_id: "usr_owner",
    });

    expect(parsed.project_id).toBe("proj_123");
    expect(parsed.created_by_user_id).toBe("usr_owner");
  });

  it("requires sample fields for sample rules", () => {
    expect(
      CaptureRuleSchema.safeParse({
        ...baseRule,
        id: "00000000-0000-4000-8000-000000000102",
        action: "sample",
      }).success
    ).toBe(false);

    const parsed = CaptureRuleSchema.parse({
      ...baseRule,
      id: "00000000-0000-4000-8000-000000000103",
      action: "sample",
      sample_rate: 0.25,
      sample_event_class: "context",
    });

    expect(parsed.sample_rate).toBe(0.25);
    expect(parsed.sample_event_class).toBe("context");
  });

  it("defaults sample create event class to preserve", () => {
    const parsed = CaptureRuleCreateSchema.parse({
      name: "Sample noisy requests",
      action: "sample",
      matcher: {
        event_types: ["request_event"],
        request_url: { path_prefix: "/api/search" },
      },
      sample_rate: 0.25,
    });

    expect(parsed.sample_event_class).toBe("preserve");
  });

  it("rejects sample-only fields on non-sample actions", () => {
    expect(
      CaptureRuleSchema.safeParse({
        ...baseRule,
        sample_rate: 0.5,
      }).success
    ).toBe(false);
  });

  it("accepts partial rule updates when at least one field is present", () => {
    expect(
      CaptureRuleUpdateSchema.safeParse({
        enabled: false,
      }).success
    ).toBe(true);
  });

  it("requires sample update fields to be paired with action sample", () => {
    expect(
      CaptureRuleUpdateSchema.safeParse({
        sample_rate: 0.25,
      }).success
    ).toBe(false);

    expect(
      CaptureRuleUpdateSchema.safeParse({
        action: "sample",
        sample_rate: 0.25,
        sample_event_class: "preserve",
      }).success
    ).toBe(true);
  });

  it("allows non-sample action updates without sample fields", () => {
    expect(
      CaptureRuleUpdateSchema.safeParse({
        action: "drop",
      }).success
    ).toBe(true);
  });

  it("rejects empty rule updates", () => {
    expect(CaptureRuleUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("validates local capture-rules files", () => {
    expect(
      CaptureRulesFileSchema.parse({
        version: 1,
        rules: [baseRule],
      })
    ).toEqual({
      version: 1,
      rules: [baseRule],
    });
  });
});

describe("capture rule activity", () => {
  it("treats disabled rules as inactive", () => {
    expect(
      isCaptureRuleActive(
        {
          ...baseRule,
          enabled: false,
        },
        "2026-05-26T10:00:00.000Z"
      )
    ).toBe(false);
  });

  it("treats expired rules as inactive", () => {
    expect(
      isCaptureRuleActive(
        {
          ...baseRule,
          expires_at: "2026-05-25T10:00:00.000Z",
        },
        "2026-05-26T10:00:00.000Z"
      )
    ).toBe(false);
  });
});

describe("capture rule matching", () => {
  it("prefers the most specific matching rule", () => {
    const broaderRule: CaptureRule = {
      ...baseRule,
      id: "00000000-0000-4000-8000-000000000104",
      name: "Broader analytics noise",
      matcher: {
        event_types: ["frontend_exception"],
        browser_event_kind: "resource_error",
        resource_url: {
          host_suffix: "example.com",
        },
      },
    };

    const result = evaluateCaptureRules(
      [broaderRule, baseRule],
      {
        project_id: baseRule.project_id,
        event_id: "00000000-0000-4000-8000-000000000201",
        event_type: "frontend_exception",
        runtime: "browser",
        service: "web",
        environment: "production",
        first_party: false,
        browser_event_kind: "resource_error",
        resource_url: {
          host: "analytics.example.com",
          path: "/bundle.js",
        },
      },
      "2026-05-26T10:00:00.000Z"
    );

    expect(result?.rule_id).toBe(baseRule.id);
    expect(result?.outcome).toBe("demote");
    expect(getCaptureRuleSpecificityScore(baseRule)).toBeGreaterThan(
      getCaptureRuleSpecificityScore(broaderRule)
    );
  });

  it("returns sampled_out deterministically for sample rules", () => {
    const sampleRule: CaptureRule = {
      ...baseRule,
      id: "00000000-0000-4000-8000-000000000105",
      action: "sample",
      sample_rate: 0,
      sample_event_class: "preserve",
    };

    const result = evaluateCaptureRules(
      [sampleRule],
      {
        project_id: baseRule.project_id,
        event_id: "00000000-0000-4000-8000-000000000202",
        event_type: "frontend_exception",
        runtime: "browser",
        service: "web",
        environment: "production",
        first_party: false,
        browser_event_kind: "resource_error",
        resource_url: {
          host: "analytics.example.com",
          path: "/bundle.js",
        },
      },
      "2026-05-26T10:00:00.000Z"
    );

    expect(result).toEqual({
      rule_id: sampleRule.id,
      action: "sample",
      outcome: "sampled_out",
      sample_rate: 0,
      sample_event_class: "preserve",
    });
  });

  it("supports exact fingerprint matching", () => {
    const fingerprintRule: CaptureRule = {
      ...baseRule,
      id: "00000000-0000-4000-8000-000000000106",
      matcher: {
        event_types: ["frontend_exception"],
        fingerprint: {
          version: "v1",
          value: "fp_browser_noise",
        },
      },
    };

    const result = evaluateCaptureRules(
      [fingerprintRule],
      {
        project_id: baseRule.project_id,
        event_id: "00000000-0000-4000-8000-000000000203",
        event_type: "frontend_exception",
        runtime: "browser",
        fingerprint: {
          version: "v1",
          value: "fp_browser_noise",
        },
      },
      "2026-05-26T10:00:00.000Z"
    );

    expect(result?.rule_id).toBe(fingerprintRule.id);
    expect(result?.outcome).toBe("demote");
  });

  it("builds evaluation context from frontend resource exceptions", () => {
    const context = buildCaptureRuleEvaluationContext({
      project_id: baseRule.project_id,
      event: {
        event_id: "00000000-0000-4000-8000-000000000204",
        event_type: "frontend_exception",
        service: {
          name: "web",
          environment: "production",
          runtime: "browser",
        },
        payload: {
          name: "ResourceLoadError",
          message: "Failed to load resource",
          browser_event: {
            kind: "resource_error",
            file_name: "https://analytics.example.com/tag.js?v=1",
            target: {
              source_url: "https://analytics.example.com/tag.js?v=1",
            },
          },
        },
      },
    });

    expect(context).toEqual({
      project_id: baseRule.project_id,
      event_id: "00000000-0000-4000-8000-000000000204",
      event_type: "frontend_exception",
      service: "web",
      environment: "production",
      runtime: "browser",
      first_party: false,
      error_name: "ResourceLoadError",
      message: "Failed to load resource",
      browser_event_kind: "resource_error",
      resource_url: {
        host: "analytics.example.com",
        path: "/tag.js",
      },
    });
  });

  it("builds evaluation context for prefixed project identifiers", () => {
    const context = buildCaptureRuleEvaluationContext({
      project_id: "proj_123",
      event: {
        event_id: "00000000-0000-4000-8000-000000000205",
        event_type: "frontend_exception",
        service: {
          name: "web",
          environment: "production",
          runtime: "browser",
        },
        payload: {
          name: "ResourceLoadError",
          message: "Failed to load resource",
          browser_event: {
            kind: "resource_error",
            target: {
              source_url: "https://analytics.example.com/tag.js",
            },
          },
        },
      },
    });

    expect(context.project_id).toBe("proj_123");
    expect(context.resource_url).toEqual({
      host: "analytics.example.com",
      path: "/tag.js",
    });
  });

  it("demotes event class when a demotion rule matched", () => {
    expect(
      applyCaptureRuleEventClass({
        event_class: "incident_signal",
        capture_rule: {
          rule_id: baseRule.id,
          action: "demote",
          outcome: "demote",
          sample_rate: null,
          sample_event_class: null,
        },
      })
    ).toBe("context_signal");
  });
});
