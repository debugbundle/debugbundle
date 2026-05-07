import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const docsRoot = join(process.cwd(), 'site/content/docs');

describe('Phase 17 — public GitHub automation docs', () => {
  it('positions agent workflows around repository dispatch and the reference action', () => {
    const landing = readFileSync(join(docsRoot, 'agent-workflows.mdx'), 'utf8');

    expect(landing).toContain('repository_dispatch');
    expect(landing).toContain('GitHub Actions');
    expect(landing).toContain('debugbundle/action');
    expect(landing).not.toContain('Webhook to bundle fetch');
  });

  it('replaces the old webhook bridge recipe with GitHub automation setup and workflow examples', () => {
    const recipes = readFileSync(join(docsRoot, 'agent-workflows/automation-recipes.mdx'), 'utf8');

    expect(recipes).toContain('Project GitHub');
    expect(recipes).toContain('GitHub automation');
    expect(recipes).toContain('repository_dispatch');
    expect(recipes).toContain('debugbundle/action@v1');
    expect(recipes).toContain('Recipe 1: Basic GitHub triage workflow');
    expect(recipes).toContain('Recipe 2: Agent-capable workflow');
    expect(recipes).toContain('Recipe 3: Issue creation workflow');
    expect(recipes).not.toContain('debugbundle webhook create');
    expect(recipes).not.toContain('Recipe 1: Auto-Investigate on Webhook');
  });
});