import { describe, expect, it } from 'vitest';

import { SESSION_COOKIE_NAME } from '../../../packages/auth/src/index.js';
import { MCP_TOOL_NAMES } from '../../../apps/mcp/src/tool-catalog.js';
import { buildMachineReadableArtifacts } from '../../../scripts/public-site-artifacts.ts';
import { BundleV1Schema } from '../../../packages/shared-types/src/index.js';

const EXPECTED_MCP_TOOL_NAMES = [...MCP_TOOL_NAMES].sort();

describe('public site machine-readable artifacts', () => {
  it('publishes the first source-backed schema and example artifacts', async () => {
    const artifacts = await buildMachineReadableArtifacts();
    const routePaths = artifacts.map((artifact) => artifact.routePath);

    expect(routePaths).toEqual(
      expect.arrayContaining([
        '/llms.txt',
        '/openapi.json',
        '/schemas/bundle.json',
        '/schemas/mcp-tools.json',
        '/schemas/profile.json',
        '/schemas/webhook-events.json',
        '/examples/bundle.failure.json',
        '/examples/bundle.improvement.json',
      ]),
    );
  });

  it('emits JSON Schema documents with stable public ids', async () => {
    const artifacts = await buildMachineReadableArtifacts();
    const schemaArtifacts = artifacts.filter((artifact) => artifact.routePath.startsWith('/schemas/'));

    expect(schemaArtifacts).not.toHaveLength(0);

    for (const artifact of schemaArtifacts) {
      const document = JSON.parse(artifact.content) as { $id?: string; $schema?: string; title?: string };

      expect(artifact.contentType).toBe('application/json');
      expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema#');
      expect(document.$id).toBe(`https://debugbundle.com${artifact.routePath}`);
      expect(typeof document.title).toBe('string');
    }
  });

  it('keeps the published example bundles valid against the bundle contract', async () => {
    const artifacts = await buildMachineReadableArtifacts();
    const exampleArtifacts = artifacts.filter((artifact) => artifact.routePath.startsWith('/examples/'));

    expect(exampleArtifacts).toHaveLength(2);

    for (const artifact of exampleArtifacts) {
      const payload = JSON.parse(artifact.content) as unknown;
      expect(() => BundleV1Schema.parse(payload)).not.toThrow();
    }
  });

  it('publishes an MCP tool invocation schema aligned with the implemented tool registry', async () => {
    const artifacts = await buildMachineReadableArtifacts();
    const mcpToolSchemaArtifact = artifacts.find((artifact) => artifact.routePath === '/schemas/mcp-tools.json');

    expect(mcpToolSchemaArtifact).toBeDefined();

    const document = JSON.parse(mcpToolSchemaArtifact!.content) as {
      oneOf?: Array<{ properties?: { name?: { const?: string } } }>;
      $defs?: Record<string, { properties?: Record<string, { type?: string; enum?: string[] }>; required?: string[] }>;
    };
    const publishedToolNames =
      document.oneOf
        ?.map((entry) => entry.properties?.name?.const)
        .filter((toolName): toolName is string => typeof toolName === 'string')
        .sort() ?? [];

    expect(publishedToolNames).toEqual(EXPECTED_MCP_TOOL_NAMES);
    expect(publishedToolNames).not.toContain('activate_probes');
    expect(document.$defs?.['get_bundleArguments']?.required).toEqual(['incidentId']);
    expect(document.$defs?.['get_bundleArguments']?.properties?.['incidentId']?.type).toBe('string');
    expect(document.$defs?.['list_project_tokensArguments']?.required).toEqual(['bearerToken', 'projectId']);
    expect(document.$defs?.['start_trialArguments']?.required).toEqual(['bearerToken', 'targetPlan']);
    expect(document.$defs?.['set_project_github_repoArguments']?.required).toEqual(['bearerToken', 'projectId', 'owner', 'repo']);
    expect(document.$defs?.['test_webhookArguments']?.properties?.['eventType']?.enum).toEqual([
      'verification.passed',
      'verification.failed',
    ]);
  });

  it('publishes a source-backed OpenAPI document for the public HTTP API', async () => {
    const artifacts = await buildMachineReadableArtifacts();
    const openApiArtifact = artifacts.find((artifact) => artifact.routePath === '/openapi.json');

    expect(openApiArtifact).toBeDefined();

    const document = JSON.parse(openApiArtifact!.content) as {
      openapi?: string;
      paths?: Record<
        string,
        Record<
          string,
          {
            operationId?: string;
            requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
            responses?: Record<string, { description?: string; content?: Record<string, { schema?: { $ref?: string; oneOf?: unknown[] } }> }>;
            parameters?: Array<{ name?: string; in?: string; required?: boolean; schema?: { type?: string } }>;
          }
        >
      >;
      components?: {
        securitySchemes?: Record<string, { type?: string; scheme?: string; in?: string; name?: string }>;
        schemas?: Record<string, unknown>;
      };
    };

    expect(document.openapi).toBe('3.1.0');
    expect(document.components?.securitySchemes).toMatchObject({
      memberBearerToken: { type: 'http', scheme: 'bearer' },
      projectBearerToken: { type: 'http', scheme: 'bearer' },
      browserSession: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE_NAME },
    });
    expect(document.paths).toEqual(
      expect.objectContaining({
        '/v1/events': expect.any(Object),
        '/v1/incidents': expect.any(Object),
        '/v1/projects/{id}/capture-policy': expect.any(Object),
        '/v1/webhooks/{id}/test': expect.any(Object),
        '/v1/sdk/config': expect.any(Object),
      }),
    );
    expect(document.paths?.['/v1/events']?.['post']?.operationId).toBe('ingestEvents');
    expect(document.paths?.['/v1/events']?.['post']?.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/IngestionRequest',
    );
    expect(document.paths?.['/v1/incidents/{id}/bundle']?.['get']?.responses?.['200']?.content?.['application/json']?.schema).toMatchObject({
      oneOf: expect.any(Array),
    });
    expect(document.paths?.['/v1/projects/{id}/capture-policy']?.['patch']?.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/CapturePolicyUpdate',
    );
    expect(document.paths?.['/v1/webhooks/{id}/test']?.['post']?.responses?.['200']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/WebhookTestResponse',
    );
    expect(document.paths?.['/v1/projects/{id}/tokens']?.['get']?.parameters).toContainEqual(
      expect.objectContaining({ name: 'id', in: 'path', required: true, schema: expect.objectContaining({ type: 'string' }) }),
    );
    expect(document.components?.schemas).toEqual(
      expect.objectContaining({
        IngestionRequest: expect.any(Object),
        IncidentListResponse: expect.any(Object),
        WebhookTestResponse: expect.any(Object),
        CapturePolicyResponse: expect.any(Object),
      }),
    );
  });

  it('publishes llms.txt with stable links to the current public docs and machine-readable artifacts', async () => {
    const artifacts = await buildMachineReadableArtifacts();
    const llmsArtifact = artifacts.find((artifact) => artifact.routePath === '/llms.txt');

    expect(llmsArtifact).toBeDefined();
    expect(llmsArtifact?.contentType).toBe('text/plain');

    const lines = llmsArtifact!.content.trim().split('\n');
    const content = llmsArtifact!.content;

    expect(lines[0]).toBe('# DebugBundle');
    expect(content).toContain('Primary docs: https://debugbundle.com/docs/');
    expect(content).toContain('- Quickstart: https://debugbundle.com/docs/quickstart/');
    expect(content).toContain('- Installation: https://debugbundle.com/docs/installation/');
    expect(content).toContain('- Local-only mode: https://debugbundle.com/docs/project-setup/local-only/');
    expect(content).toContain('- Connect to Cloud: https://debugbundle.com/docs/project-setup/connect-to-cloud/');
    expect(content).toContain('- SDK overview: https://debugbundle.com/docs/sdks/');
    expect(content).toContain('- Browser relay: https://debugbundle.com/docs/sdks/browser-relay/');
    expect(content).toContain('- Android SDK: https://debugbundle.com/docs/sdks/android/');
    expect(content).toContain('- iOS SDK: https://debugbundle.com/docs/sdks/swift/');
    expect(content).toContain('- React Native SDK: https://debugbundle.com/docs/sdks/react-native/');
    expect(content).toContain('- WordPress integration: https://debugbundle.com/docs/integrations/wordpress/');
    expect(content).toContain('- CLI local workflow: https://debugbundle.com/docs/cli/local-workflow/');
    expect(content).toContain('- CLI cloud workflow: https://debugbundle.com/docs/cli/cloud-workflow/');
    expect(content).toContain('- API overview: https://debugbundle.com/docs/api/');
    expect(content).toContain('- MCP tools: https://debugbundle.com/docs/mcp/tools/');
    expect(content).toContain('- Availability checks: https://debugbundle.com/docs/availability-checks/');
    expect(content).toContain('- GitHub automation: https://debugbundle.com/docs/agent-workflows/automation-recipes/');
    expect(content).toContain('- Agent workflows: https://debugbundle.com/docs/agent-workflows/');
    expect(content).toContain('- Reference index: https://debugbundle.com/docs/v1/reference/');
    expect(content).toContain('- API endpoints: https://debugbundle.com/docs/v1/reference/api-endpoints/');
    expect(content).toContain('- CLI commands: https://debugbundle.com/docs/v1/reference/cli-commands/');
    expect(content).toContain('- MCP tools reference: https://debugbundle.com/docs/v1/reference/mcp-tools/');
    expect(content).toContain('- OpenAPI: https://debugbundle.com/openapi.json');
    expect(content).toContain('- Bundle schema: https://debugbundle.com/schemas/bundle.json');
    expect(content).toContain('- Webhook events schema: https://debugbundle.com/schemas/webhook-events.json');
    expect(content).toContain('- Profile schema: https://debugbundle.com/schemas/profile.json');
    expect(content).toContain('- MCP tools schema: https://debugbundle.com/schemas/mcp-tools.json');
    expect(content).toContain('- Failure bundle example: https://debugbundle.com/examples/bundle.failure.json');
    expect(content).toContain('- Improvement bundle example: https://debugbundle.com/examples/bundle.improvement.json');
    expect(content).toContain('- Prefer MCP tools when the environment exposes the DebugBundle MCP server.');
  });
});
