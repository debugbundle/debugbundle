import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { referenceRouteEntries } from '../../../site/src/reference-content.js';
import {
  buildReferenceData,
} from '../../../scripts/public-site-artifacts.ts';
import { siteConfig } from '../../../site/src/site-config.js';

type ReferenceRouteEntry = {
  href: string;
};

const typedReferenceRouteEntries: readonly ReferenceRouteEntry[] = referenceRouteEntries;
const workspacePackageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as { version: string };

describe('public site reference documentation', () => {
  it('exposes the planned reference routes in the docs tree', () => {
    expect(siteConfig.docsNav).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Reference', href: '/docs/v1/reference/' })]),
    );

    expect(typedReferenceRouteEntries.map((entry) => entry.href)).toEqual([
      '/docs/v1/reference/api-endpoints/',
      '/docs/v1/reference/cli-commands/',
      '/docs/v1/reference/mcp-tools/',
      '/docs/v1/reference/webhook-events/',
      '/docs/v1/reference/bundle-schema/',
      '/docs/v1/reference/profile-schema/',
      '/docs/v1/reference/error-codes/',
    ]);
  });

  it('builds API endpoint reference entries from the published OpenAPI source', async () => {
    const { apiEntries: entries, release } = await buildReferenceData();

    expect(release).toEqual({
      coreVersion: workspacePackageJson.version,
    });

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/v1/events', operationId: 'ingestEvents' }),
        expect.objectContaining({ method: 'GET', path: '/v1/incidents', operationId: 'listIncidents' }),
        expect.objectContaining({ method: 'GET', path: '/v1/incidents/{id}/bundle', operationId: 'getBundle' }),
      ]),
    );
    expect(entries.find((entry) => entry.path === '/v1/events')?.auth).toContain('Project bearer token');
    expect(entries.find((entry) => entry.path === '/v1/incidents')?.auth).toContain('Member bearer token');
  });

  it('builds CLI command reference entries from the implemented usage surface', async () => {
    const { cliEntries: entries } = await buildReferenceData();

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ commandPath: 'setup', usage: 'debugbundle setup [--non-interactive] [--json]' }),
        expect.objectContaining({ commandPath: 'incidents', usage: expect.stringContaining('--source <local|cloud>') }),
        expect.objectContaining({ commandPath: 'resolve', usage: expect.stringContaining('[incident-id ...]') }),
        expect.objectContaining({ commandPath: 'reopen', usage: expect.stringContaining('[incident-id ...]') }),
        expect.objectContaining({
          commandPath: 'webhook retry',
          usage: 'debugbundle webhook retry <webhook-id> <delivery-id> --project-id <id> [--auth-file <path>] [--json]',
        }),
      ]),
    );
  });

  it('builds MCP tool reference groups from the implemented tool catalog', async () => {
    const { mcpGroups: groups } = await buildReferenceData();
    const retrievalGroup = groups.find((group) => group.group === 'retrieval');
    const bundleTool = retrievalGroup?.tools.find((tool) => tool.name === 'get_bundle');

    expect(retrievalGroup?.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'get_bundle' })]));
    expect(bundleTool?.requiredArguments).toEqual(['incidentId']);
    expect(bundleTool?.optionalArguments).toContain('source');
  });

  it('builds webhook, schema, and error-code references from shipped contracts', async () => {
    const { webhookReference, schemaLinks, errorReference } = await buildReferenceData();

    expect(webhookReference.eventTypes).toEqual([
      'bundle.created',
      'bundle.updated',
      'bundle.reopened',
      'bundle.resolved',
      'verification.passed',
      'verification.failed',
      'improvement_bundle.created',
      'incident.spike_detected',
    ]);
    expect(webhookReference.schemaPath).toBe('/schemas/webhook-events.json');

    expect(schemaLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: '/schemas/bundle.json' }),
        expect.objectContaining({ href: '/schemas/profile.json' }),
        expect.objectContaining({ href: '/examples/bundle.failure.json' }),
      ]),
    );

    expect(errorReference.codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_member_token', statusCodes: ['401'] }),
        expect.objectContaining({ code: 'project_not_found', statusCodes: ['404'] }),
      ]),
    );
    expect(errorReference.categories).toContain('auth_error');
  });
});
