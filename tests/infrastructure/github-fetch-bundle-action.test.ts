import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const examplesRoot = join(repoRoot, 'examples', 'github-actions');

describe('GitHub reference action', () => {
  it('ships reference workflow examples for the core GitHub automation patterns', () => {
    const expectedFiles = [
      'basic.yml',
      'agent-capable.yml',
      'issue-creation.yml',
    ];

    for (const fileName of expectedFiles) {
      const filePath = join(examplesRoot, fileName);
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf8');
      expect(content).toContain('repository_dispatch');
      expect(content).toContain('debugbundle.incident');
      expect(content).toContain('uses: debugbundle/action@v1');
      expect(content).toContain('github.event.client_payload.incident_id');
    }
  });

  it('documents the standalone public action distribution path in the workflow examples', () => {
    const basicExample = readFileSync(join(examplesRoot, 'basic.yml'), 'utf8');

    expect(existsSync(join(examplesRoot, 'basic.yml'))).toBe(true);
    expect(basicExample).toContain('uses: debugbundle/action@v1');
    expect(basicExample).not.toContain('github-actions/action');
  });
});
