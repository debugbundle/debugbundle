import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildMachineReadableArtifacts } from '../../scripts/public-site-artifacts.ts';

const siteRoot = join(process.cwd(), 'site');
const docsRoot = join(siteRoot, 'content', 'docs');

function readDoc(relativePath: string): string {
  return readFileSync(join(docsRoot, relativePath), 'utf8');
}

describe('public site AnalyticsBundle documentation', () => {
  it('ships every AnalyticsBundle page required by the documentation contract', () => {
    const requiredPages = [
      'analytics/index.mdx',
      'analytics/privacy.mdx',
      'analytics/self-hosting.mdx',
      'cli/analytics.mdx',
      'api/analytics.mdx',
    ];

    for (const page of requiredPages) {
      expect(existsSync(join(docsRoot, page))).toBe(true);
      expect(readDoc(page)).toMatch(/^---\n(?:.|\n)*?title:/);
      expect(readDoc(page)).toMatch(/description:/);
    }
  });

  it('documents the aggregate-first product model and direct-versus-generated evidence', () => {
    const concept = readDoc('analytics/index.mdx');

    expect(concept).toMatch(/does not create one\s+AnalyticsBundle per visit/);
    expect(concept).toContain('aggregate rollups');
    expect(concept).toContain('saved funnel');
    expect(concept).toContain('incident impact');
    expect(concept).toContain('API, CLI, MCP, and web');
  });

  it('documents privacy, retention, identity, and debug-capture isolation', () => {
    const privacy = readDoc('analytics/privacy.mdx');

    expect(privacy).toContain('strict');
    expect(privacy).toContain('standard');
    expect(privacy).toContain('custom');
    expect(privacy).toContain('raw_retention_days');
    expect(privacy).toContain('sample_retention_days');
    expect(privacy).toContain('aggregate_retention_months');
    expect(privacy).toContain('form values');
    expect(privacy).toContain('raw click text');
    expect(privacy).toContain('Debug capture remains independent');
  });

  it('documents self-host migration order without treating bootstrap as an upgrade path', () => {
    const selfHosting = readDoc('analytics/self-hosting.mdx');

    expect(selfHosting).toContain('db-migrate');
    expect(selfHosting).toContain('before API and Worker');
    expect(selfHosting).toContain('db-bootstrap');
    expect(selfHosting).toContain('empty databases only');
    expect(selfHosting).toContain('ANALYTICS_OPPORTUNITY_EVALUATION_INTERVAL_MS');
  });

  it('documents the shipped CLI and API analytics surfaces', () => {
    const cli = readDoc('cli/analytics.mdx');
    const api = readDoc('api/analytics.mdx');

    for (const command of [
      'analytics summary',
      'analytics journey-samples list',
      'analytics opportunities',
      'analytics bundle create',
      'analytics saved-funnels create',
      'analytics settings set',
    ]) {
      expect(cli).toContain(command);
    }

    for (const route of [
      '/v1/projects/{id}/analytics-settings',
      '/v1/projects/{id}/analytics/saved-funnels',
      '/v1/analytics/summary',
      '/v1/analytics/journey-samples',
      '/v1/analytics/opportunities',
      '/v1/analytics/bundles',
    ]) {
      expect(api).toContain(route);
    }
    expect(api).toContain('Member Token');
    expect(api).toMatch(/Project\s+tokens cannot read/);
  });

  it('documents browser capture and every agent-facing analytics tool family', () => {
    const browser = readDoc('sdks/browser.mdx');
    const mcpTools = readDoc('mcp/tools.mdx');

    for (const value of [
      'analytics.enabled',
      'analytics.setConsent',
      'analytics.track',
      'analytics.funnel',
      'analytics.convert',
      'analytics.marker',
    ]) {
      expect(browser).toContain(value);
    }

    for (const tool of [
      'get_usage_summary',
      'get_journey_patterns',
      'get_incident_impact',
      'list_analytics_opportunities',
      'generate_analytics_bundle',
      'get_analytics_settings',
      'create_saved_analytics_funnel',
    ]) {
      expect(mcpTools).toContain(tool);
    }
  });

  it('registers AnalyticsBundle pages in content navigation and agent discovery', () => {
    const contentSource = readFileSync(join(siteRoot, 'src', 'content-source.ts'), 'utf8');
    const artifactSource = readFileSync(
      join(process.cwd(), 'scripts', 'public-site-artifacts.ts'),
      'utf8',
    );

    expect(contentSource).toContain("'./analytics/meta.json'");
    expect(contentSource).toContain("'./analytics/index.mdx'");
    expect(contentSource).toContain("'./cli/analytics.mdx'");
    expect(contentSource).toContain("'./api/analytics.mdx'");
    expect(artifactSource).toContain("'/docs/analytics/'");
    expect(artifactSource).toContain("'/docs/analytics/privacy/'");
    expect(artifactSource).toContain("'/docs/cli/analytics/'");
    expect(artifactSource).toContain("'/docs/api/analytics/'");
  });

  it('publishes AnalyticsBundle links in the generated agent discovery artifact', async () => {
    const artifacts = await buildMachineReadableArtifacts();
    const llms = artifacts.find((artifact) => artifact.routePath === '/llms.txt');

    expect(llms?.content).toContain('- AnalyticsBundle: https://debugbundle.com/docs/analytics/');
    expect(llms?.content).toContain(
      '- AnalyticsBundle privacy: https://debugbundle.com/docs/analytics/privacy/',
    );
    expect(llms?.content).toContain(
      '- Self-hosted AnalyticsBundle: https://debugbundle.com/docs/analytics/self-hosting/',
    );
    expect(llms?.content).toContain(
      '- AnalyticsBundle CLI: https://debugbundle.com/docs/cli/analytics/',
    );
    expect(llms?.content).toContain(
      '- AnalyticsBundle API: https://debugbundle.com/docs/api/analytics/',
    );
  });
});
