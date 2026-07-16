import { describe, expect, it, vi } from "vitest";

import {
  BUNDLE_GENERATION_ID,
  FROM,
  TO,
  INCIDENT_ID,
  JOURNEY_SAMPLE_ID,
  PROJECT_ID,
  buildAnalyticsBundle,
  createAnalyticsBundleGeneration,
  createAnalyticsBundlesDependency,
  createAnalyticsOpportunitiesDependency,
  createAnalyticsJourneySamplesDependency,
  createAnalyticsSettingsManagementDependency,
  createBillingManagementForAnalyticsQuota,
  createDependencies,
  createJourneySample,
  createOpportunity,
  createProjectAccess,
  gzipSync,
  type AnalyticsJourneySampleResponse
} from "../../helpers/analytics-route-fixtures.js";

describe("analytics artifact routes", () => {
  it("lists AnalyticsBundle generation records through project access", async () => {
    const cursor = `${FROM}|${BUNDLE_GENERATION_ID}`;
    const generation = createAnalyticsBundleGeneration({
      analysis_kind: "funnel_dropoff",
      status: "completed",
      analysis_spec: { funnel: "checkout" }
    });
    const listAnalyticsBundleGenerationsForProject = vi.fn().mockResolvedValue({
      bundles: [generation],
      next_cursor: null
    });
    const analyticsBundles = createAnalyticsBundlesDependency({
      listAnalyticsBundleGenerationsForProject
    });
    const app = createDependencies({ analyticsBundles });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/bundles?project_id=${PROJECT_ID}&status=completed&kind=funnel_dropoff&cursor=${encodeURIComponent(cursor)}&limit=5`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      bundles: [
        {
          generation_id: BUNDLE_GENERATION_ID,
          project_id: PROJECT_ID,
          opportunity_id: null,
          requested_by_user_id: null,
          analysis_kind: "funnel_dropoff",
          analysis_spec: { funnel: "checkout" },
          input_fingerprint:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          status: "completed",
          has_artifact: true,
          failure_reason: null,
          created_at: FROM,
          claimed_at: FROM,
          completed_at: TO,
          updated_at: TO
        }
      ],
      next_cursor: null
    });
    expect(listAnalyticsBundleGenerationsForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      status: "completed",
      analysis_kind: "funnel_dropoff",
      cursor: {
        created_at: FROM,
        generation_id: BUNDLE_GENERATION_ID
      },
      limit: 5
    });
  });

  it("lists AnalyticsBundle generations across the caller organization with project metadata", async () => {
    const generation = createAnalyticsBundleGeneration({
      project_name: "Marketing site",
      project_color_tag: "blue"
    });
    const listAnalyticsBundleGenerationsForOrganization = vi.fn().mockResolvedValue({
      bundles: [generation],
      next_cursor: null
    });
    const analyticsBundles = createAnalyticsBundlesDependency({
      listAnalyticsBundleGenerationsForOrganization
    });
    const app = createDependencies({ analyticsBundles });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/bundles?status=completed&service=web&environment=production&from=2026-03-01T00%3A00%3A00.000Z&to=2026-03-09T00%3A00%3A00.000Z&cursor=${encodeURIComponent(`${FROM}|${BUNDLE_GENERATION_ID}`)}&limit=5`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      bundles: [
        {
          generation_id: BUNDLE_GENERATION_ID,
          project_id: PROJECT_ID,
          project_name: "Marketing site",
          project_color_tag: "blue"
        }
      ],
      next_cursor: null
    });
    expect(listAnalyticsBundleGenerationsForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      status: "completed",
      service: "web",
      environment: "production",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-09T00:00:00.000Z",
      cursor: {
        created_at: FROM,
        generation_id: BUNDLE_GENERATION_ID
      },
      limit: 5
    });
  });

  it("rejects invalid AnalyticsBundle list cursors and unavailable storage", async () => {
    const invalidCursor = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency()
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles?project_id=${PROJECT_ID}&cursor=not-a-cursor`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailable = await createDependencies().inject({
      method: "GET",
      url: `/v1/analytics/bundles?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const invertedWindow = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency()
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles?from=${encodeURIComponent(TO)}&to=${encodeURIComponent(FROM)}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json()).toEqual({ error: "invalid_query" });
    expect(invertedWindow.statusCode).toBe(400);
    expect(invertedWindow.json()).toEqual({ error: "invalid_query" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_bundles_not_available" });
  });

  it("lists retained analytics journey sample metadata through project access", async () => {
    const cursor = `${TO}|${JOURNEY_SAMPLE_ID}`;
    const listAnalyticsJourneySamplesForProject = vi.fn().mockResolvedValue({
      samples: [createJourneySample()],
      next_cursor: null
    });
    const analyticsJourneySamples = createAnalyticsJourneySamplesDependency({
      listAnalyticsJourneySamplesForProject
    });
    const app = createDependencies({ analyticsJourneySamples });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/journey-samples?project_id=${PROJECT_ID}&service=web&environment=production&tag=checkout&cursor=${encodeURIComponent(cursor)}&limit=5`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      samples: [
        {
          sample_id: JOURNEY_SAMPLE_ID,
          project_id: PROJECT_ID,
          service: "web",
          environment: "production",
          session_id_hash: "sha256:session",
          visitor_id_hash: "sha256:visitor",
          analysis_tags: ["checkout", "loop"],
          first_seen_at: FROM,
          last_seen_at: TO,
          dimensions_summary: { device_type: "mobile" },
          has_artifact: true,
          expires_at: "2026-03-15T00:00:00.000Z",
          created_at: TO
        }
      ],
      next_cursor: null
    });
    expect(listAnalyticsJourneySamplesForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      service: "web",
      environment: "production",
      tag: "checkout",
      cursor: {
        last_seen_at: TO,
        sample_id: JOURNEY_SAMPLE_ID
      },
      limit: 5,
      now: expect.any(String)
    });
  });

  it("returns retained analytics journey sample artifacts through project access", async () => {
    const journey: AnalyticsJourneySampleResponse["journey"] = {
      schema_version: "analytics_journey_sample.v1",
      sample_id: JOURNEY_SAMPLE_ID,
      project_id: PROJECT_ID,
      service: "web",
      environment: "production",
      session_id_hash: "sha256:session",
      visitor_id_hash: "sha256:visitor",
      first_seen_at: FROM,
      last_seen_at: TO,
      analysis_tags: ["route:/pricing", "transition:/pricing->/checkout"],
      dimensions_summary: { device_type: "mobile" },
      events: [
        {
          event_id: "550e8400-e29b-41d4-a716-446655440000",
          occurred_at: FROM,
          kind: "page_view",
          route: { path: "/pricing", normalized_path: "/pricing", title: "Pricing" },
          previous_route: null,
          signal: null,
          trace_id: null,
          deploy_id: null,
          dimensions: { device_type: "mobile", auth_state: "anonymous" },
          custom_dimensions: {}
        }
      ]
    };
    const sample = createJourneySample();
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(journey), "utf8")))
    };
    const analyticsJourneySamples = createAnalyticsJourneySamplesDependency({
      getAnalyticsJourneySampleForProject: vi.fn().mockResolvedValue(sample)
    });
    const app = createDependencies({ analyticsJourneySamples, objectStoreReader });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/journey-samples/${JOURNEY_SAMPLE_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sample: {
        sample_id: JOURNEY_SAMPLE_ID,
        project_id: PROJECT_ID,
        service: "web",
        environment: "production",
        session_id_hash: "sha256:session",
        visitor_id_hash: "sha256:visitor",
        analysis_tags: ["checkout", "loop"],
        first_seen_at: FROM,
        last_seen_at: TO,
        dimensions_summary: { device_type: "mobile" },
        has_artifact: true,
        expires_at: "2026-03-15T00:00:00.000Z",
        created_at: TO
      },
      journey
    });
    expect(analyticsJourneySamples.getAnalyticsJourneySampleForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      sample_id: JOURNEY_SAMPLE_ID,
      now: expect.any(String)
    });
    expect(objectStoreReader.getObject).toHaveBeenCalledWith({ key: sample.object_key });
  });

  it("rejects invalid analytics journey sample reads and unavailable storage", async () => {
    const invalidCursor = await createDependencies({
      analyticsJourneySamples: createAnalyticsJourneySamplesDependency()
    }).inject({
      method: "GET",
      url: `/v1/analytics/journey-samples?project_id=${PROJECT_ID}&cursor=not-a-cursor`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailable = await createDependencies().inject({
      method: "GET",
      url: `/v1/analytics/journey-samples?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const notFound = await createDependencies({
      analyticsJourneySamples: createAnalyticsJourneySamplesDependency({
        getAnalyticsJourneySampleForProject: vi.fn().mockResolvedValue(null)
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/journey-samples/${JOURNEY_SAMPLE_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json()).toEqual({ error: "invalid_query" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_journey_samples_not_available" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "analytics_journey_sample_not_found" });
  });

  it("requests AnalyticsBundle generation through project access", async () => {
    const requestAnalyticsBundleGenerationForProject = vi.fn().mockResolvedValue(
      createAnalyticsBundleGeneration({
        status: "pending",
        object_key: null
      })
    );
    const analyticsBundles = createAnalyticsBundlesDependency({
      requestAnalyticsBundleGenerationForProject
    });
    const analyticsSettingsManagement = createAnalyticsSettingsManagementDependency();
    const app = createDependencies({ analyticsBundles, analyticsSettingsManagement });

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "funnel_dropoff",
        from: FROM,
        to: TO,
        funnel: "checkout",
        incident_id: "44444444-4444-4444-8444-444444444444",
        deploy_id: "deploy_123",
        filters: { auth_state: "logged_in" }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "pending",
      bundle_generation_id: BUNDLE_GENERATION_ID
    });
    expect(response.headers["x-debugbundle-generation-id"]).toBe(BUNDLE_GENERATION_ID);
    expect(analyticsSettingsManagement.getAnalyticsSettingsForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID
    });
    expect(requestAnalyticsBundleGenerationForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      opportunity_id: null,
      requested_by_user_id: "usr_owner",
      analysis_kind: "funnel_dropoff",
      analysis_spec: {
        opportunity_id: null,
        from: FROM,
        to: TO,
        funnel: "checkout",
        route: null,
        incident_id: "44444444-4444-4444-8444-444444444444",
        deploy_id: "deploy_123",
        related_incident_ids: ["44444444-4444-4444-8444-444444444444"],
        related_deploy_ids: ["deploy_123"],
        filters: { auth_state: "logged_in" }
      }
    });
  });

  it("links bundle generation to stored opportunity evidence", async () => {
    const opportunity = createOpportunity({
      evidence: {
        analysis_window: { from: FROM, to: TO },
        funnel_key: "checkout"
      }
    });
    const requestAnalyticsBundleGenerationForProject = vi.fn().mockResolvedValue(
      createAnalyticsBundleGeneration({
        opportunity_id: opportunity.opportunity_id,
        analysis_kind: "funnel_dropoff",
        status: "pending",
        object_key: null
      })
    );
    const app = createDependencies({
      analyticsOpportunities: createAnalyticsOpportunitiesDependency({
        getAnalyticsOpportunityForProject: vi.fn().mockResolvedValue({ opportunity })
      }),
      analyticsBundles: createAnalyticsBundlesDependency({
        requestAnalyticsBundleGenerationForProject
      }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        opportunity_id: opportunity.opportunity_id,
        analysis_kind: "funnel_dropoff"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(requestAnalyticsBundleGenerationForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      opportunity_id: opportunity.opportunity_id,
      requested_by_user_id: "usr_owner",
      analysis_kind: "funnel_dropoff",
      analysis_spec: {
        opportunity_id: opportunity.opportunity_id,
        from: FROM,
        to: TO,
        funnel: "checkout",
        route: null,
        incident_id: null,
        deploy_id: "deploy-123",
        related_incident_ids: [],
        related_deploy_ids: ["deploy-123"],
        opportunity_evidence: {
          analysis_window: { from: FROM, to: TO },
          funnel_key: "checkout"
        },
        filters: { service: "web", environment: "production" }
      }
    });
  });

  it("preserves every related deploy from a linked comparison opportunity", async () => {
    const opportunity = createOpportunity({
      kind: "deploy_comparison",
      evidence: {
        analysis_window: { from: FROM, to: TO },
        deploy_id: "deploy-current",
        baseline_deploy_id: "deploy-baseline"
      },
      related_deploy_ids: ["deploy-current", "deploy-baseline"]
    });
    const requestAnalyticsBundleGenerationForProject = vi.fn().mockResolvedValue(
      createAnalyticsBundleGeneration({
        opportunity_id: opportunity.opportunity_id,
        analysis_kind: "deploy_comparison",
        status: "pending",
        object_key: null
      })
    );
    const app = createDependencies({
      analyticsOpportunities: createAnalyticsOpportunitiesDependency({
        getAnalyticsOpportunityForProject: vi.fn().mockResolvedValue({ opportunity })
      }),
      analyticsBundles: createAnalyticsBundlesDependency({
        requestAnalyticsBundleGenerationForProject
      }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        opportunity_id: opportunity.opportunity_id,
        analysis_kind: "deploy_comparison"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(requestAnalyticsBundleGenerationForProject).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis_spec: expect.objectContaining({
          deploy_id: "deploy-current",
          related_deploy_ids: ["deploy-current", "deploy-baseline"]
        })
      })
    );
  });

  it("rejects opportunity links with mismatched kinds or explicit context", async () => {
    const opportunity = createOpportunity({
      evidence: {
        analysis_window: { from: FROM, to: TO },
        funnel_key: "checkout"
      }
    });
    const dependencies = {
      analyticsOpportunities: createAnalyticsOpportunitiesDependency({
        getAnalyticsOpportunityForProject: vi.fn().mockResolvedValue({ opportunity })
      }),
      analyticsBundles: createAnalyticsBundlesDependency(),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    };
    const mismatchedKind = await createDependencies(dependencies).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        opportunity_id: opportunity.opportunity_id,
        analysis_kind: "usage_summary"
      }
    });
    const mismatchedFocus = await createDependencies(dependencies).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        opportunity_id: opportunity.opportunity_id,
        analysis_kind: "funnel_dropoff",
        funnel: "signup"
      }
    });

    expect(mismatchedKind.statusCode).toBe(400);
    expect(mismatchedKind.json()).toEqual({ error: "invalid_body" });
    expect(mismatchedFocus.statusCode).toBe(400);
    expect(mismatchedFocus.json()).toEqual({ error: "invalid_body" });
  });

  it("requires the analysis focus needed by focused bundle kinds", async () => {
    const app = createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency(),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    });

    for (const analysisKind of [
      "funnel_dropoff",
      "route_health",
      "incident_impact",
      "deploy_comparison",
      "conversion_path"
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/analytics/bundles",
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: { project_id: PROJECT_ID, analysis_kind: analysisKind, last: "7d" }
      });
      expect(response.statusCode, analysisKind).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_body" });
    }
  });

  it("enforces the Free AnalyticsBundle generation preview allowance", async () => {
    const requestAnalyticsBundleGenerationForProject = vi.fn();
    const claimAnalyticsUsageForOrganization = vi.fn().mockResolvedValue({
      allowed: false,
      metric: "monthly_analytics_bundle_generations",
      used: 4,
      limit: 3,
      usage: {
        monthly_analytics_events: 0,
        monthly_analytics_sessions: 0,
        monthly_analytics_journey_samples: 0,
        monthly_analytics_bundle_generations: 3
      }
    });
    const app = createDependencies({
      projectAccess: createProjectAccess({ organization_plan: "free" }),
      analyticsBundles: createAnalyticsBundlesDependency({
        requestAnalyticsBundleGenerationForProject
      }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency(),
      analyticsUsage: {
        getAnalyticsUsageForOrganization: vi.fn(),
        claimAnalyticsUsageForOrganization,
        releaseAnalyticsUsageForOrganization: vi.fn()
      },
      billingManagement: createBillingManagementForAnalyticsQuota("free")
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "usage_summary",
        last: "7d"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.json()).toMatchObject({
      error: "analytics_quota_exceeded"
    });
    expect(claimAnalyticsUsageForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        analytics_bundle_generations: 1,
        limits: expect.objectContaining({ monthly_analytics_bundle_generations: 3 })
      })
    );
    expect(requestAnalyticsBundleGenerationForProject).not.toHaveBeenCalled();
  });

  it("rejects AnalyticsBundle create requests when analytics is disabled or invalid", async () => {
    const requestAnalyticsBundleGenerationForProject = vi.fn();
    const disabled = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        requestAnalyticsBundleGenerationForProject
      }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency({
        getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(null)
      })
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "usage_summary",
        last: "7d"
      }
    });
    const invalid = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency(),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "usage_summary",
        route: "/checkout?step=payment",
        last: "7d"
      }
    });

    expect(disabled.statusCode).toBe(403);
    expect(disabled.json()).toEqual({ error: "analytics_disabled" });
    expect(requestAnalyticsBundleGenerationForProject).not.toHaveBeenCalled();
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: "invalid_body" });
  });

  it("requires an accessible incident for incident-impact bundle generation", async () => {
    const requestAnalyticsBundleGenerationForProject = vi.fn().mockResolvedValue(
      createAnalyticsBundleGeneration({
        analysis_kind: "incident_impact",
        status: "pending",
        object_key: null
      })
    );
    const missingIncident = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        requestAnalyticsBundleGenerationForProject
      }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: { project_id: PROJECT_ID, analysis_kind: "incident_impact" }
    });
    const unrelatedIncident = await createDependencies({
      incident: {
        project_id: "00000000-0000-0000-0000-000000000099",
        first_seen_at: FROM,
        last_seen_at: TO
      },
      analyticsBundles: createAnalyticsBundlesDependency({
        requestAnalyticsBundleGenerationForProject
      }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "incident_impact",
        incident_id: INCIDENT_ID
      }
    });
    const validIncident = await createDependencies({
      incident: {
        project_id: PROJECT_ID,
        first_seen_at: FROM,
        last_seen_at: TO
      },
      analyticsBundles: createAnalyticsBundlesDependency({
        requestAnalyticsBundleGenerationForProject
      }),
      analyticsSettingsManagement: createAnalyticsSettingsManagementDependency()
    }).inject({
      method: "POST",
      url: "/v1/analytics/bundles",
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        project_id: PROJECT_ID,
        analysis_kind: "incident_impact",
        incident_id: INCIDENT_ID
      }
    });

    expect(missingIncident.statusCode).toBe(400);
    expect(missingIncident.json()).toEqual({ error: "invalid_body" });
    expect(unrelatedIncident.statusCode).toBe(404);
    expect(unrelatedIncident.json()).toEqual({ error: "incident_not_found" });
    expect(validIncident.statusCode).toBe(200);
    expect(validIncident.json()).toEqual({
      status: "pending",
      bundle_generation_id: BUNDLE_GENERATION_ID
    });
    expect(requestAnalyticsBundleGenerationForProject).toHaveBeenCalledOnce();
    expect(requestAnalyticsBundleGenerationForProject).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis_kind: "incident_impact",
        analysis_spec: expect.objectContaining({
          incident_id: INCIDENT_ID,
          from: "2026-02-28T00:00:00.000Z",
          to: "2026-03-09T00:00:00.000Z"
        })
      })
    );
  });

  it("returns completed AnalyticsBundle artifacts through project access", async () => {
    const bundle = buildAnalyticsBundle({
      analysis_kind: "usage_summary",
      input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      project: {
        project_id: PROJECT_ID,
        service: "web",
        environment: "production"
      },
      analysis_window: {
        from: FROM,
        to: TO,
        granularity: "day"
      },
      summary: {
        title: "Usage summary",
        description: "Important usage evidence for agents.",
        confidence: "high",
        severity: "low"
      },
      metrics: {
        sessions_analyzed: 12,
        affected_sessions: 0
      },
      segments: [],
      journey_patterns: [],
      representative_journeys: [],
      linked_incidents: [],
      linked_deploys: [],
      recommendations: [],
      redaction: {
        rules_applied: ["analytics-aggregate-only"],
        omitted_fields: ["raw_click_text"]
      }
    });
    const generation = createAnalyticsBundleGeneration();
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(bundle), "utf8")))
    };
    const analyticsBundles = createAnalyticsBundlesDependency({
      getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(generation)
    });
    const app = createDependencies({ analyticsBundles, objectStoreReader });

    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-debugbundle-generation-id"]).toBe(BUNDLE_GENERATION_ID);
    expect(response.json()).toEqual(bundle);
    expect(analyticsBundles.getAnalyticsBundleGenerationForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID,
      generation_id: BUNDLE_GENERATION_ID
    });
    expect(objectStoreReader.getObject).toHaveBeenCalledWith({ key: generation.object_key });
  });

  it("returns AnalyticsBundle generation state when bundles are pending or failed", async () => {
    const pending = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(
          createAnalyticsBundleGeneration({
            status: "running",
            object_key: null
          })
        )
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const failed = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(
          createAnalyticsBundleGeneration({
            status: "failed",
            object_key: null,
            failure_reason: "monthly_quota_exceeded"
          })
        )
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toEqual({
      status: "pending",
      bundle_generation_id: BUNDLE_GENERATION_ID
    });
    expect(failed.statusCode).toBe(200);
    expect(failed.json()).toEqual({ status: "failed", reason: "monthly_quota_exceeded" });
  });

  it("rejects invalid AnalyticsBundle reads and unavailable storage", async () => {
    const invalidId = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        getAnalyticsBundleGenerationForProject: vi.fn()
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles/not-a-uuid?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const unavailable = await createDependencies().inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });
    const notFound = await createDependencies({
      analyticsBundles: createAnalyticsBundlesDependency({
        getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(null)
      })
    }).inject({
      method: "GET",
      url: `/v1/analytics/bundles/${BUNDLE_GENERATION_ID}?project_id=${PROJECT_ID}`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidId.json()).toEqual({ error: "invalid_bundle_generation_id" });
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({ error: "analytics_bundles_not_available" });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: "analytics_bundle_not_found" });
  });
});
