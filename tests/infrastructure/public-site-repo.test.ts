import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getSharedAgentInstallPrompt } from '../../site/src/lib/agent-install-prompt.js';

const repoRoot = process.cwd();
const siteRoot = join(repoRoot, 'site');
const describePublicSiteRepo = existsSync(siteRoot) ? describe : describe.skip;

describePublicSiteRepo('public site repository export', () => {
  it('is shaped for publishing as the dedicated debugbundle/site repository', () => {
    const expectedRootFiles = [
      'package.json',
      'pnpm-lock.yaml',
      'README.md',
      'LICENSE',
      'SECURITY.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'CODE_OF_CONDUCT.md',
      'release-manifest.json',
      '.github/workflows/ci.yml',
      '.github/workflows/release.yml',
      '.github/ISSUE_TEMPLATE/bug_report.yml',
      '.github/ISSUE_TEMPLATE/feature_request.yml',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ];

    for (const fileName of expectedRootFiles) {
      expect(existsSync(join(siteRoot, fileName))).toBe(true);
    }

    const manifest = JSON.parse(readFileSync(join(siteRoot, 'release-manifest.json'), 'utf8')) as {
      package: string;
      publicRepository: string;
      sourceDirectory: string;
      distributionRef: string;
      requiredReleaseFiles: string[];
    };

    expect(manifest).toEqual({
      package: 'debugbundle/site',
      publicRepository: 'https://github.com/debugbundle/site',
      sourceDirectory: 'site',
      distributionRef: 'debugbundle/site',
      requiredReleaseFiles: expectedRootFiles.filter((fileName) => fileName !== 'release-manifest.json'),
    });

    const packageJson = JSON.parse(readFileSync(join(siteRoot, 'package.json'), 'utf8')) as {
      packageManager?: string;
      repository?: { url?: string };
      homepage?: string;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const tsconfig = JSON.parse(readFileSync(join(siteRoot, 'tsconfig.json'), 'utf8')) as {
      extends?: string;
      compilerOptions?: Record<string, unknown>;
    };
    const readme = readFileSync(join(siteRoot, 'README.md'), 'utf8');
    const changelog = readFileSync(join(siteRoot, 'CHANGELOG.md'), 'utf8');
    const ciWorkflow = readFileSync(join(siteRoot, '.github/workflows/ci.yml'), 'utf8');
    const releaseWorkflow = readFileSync(join(siteRoot, '.github/workflows/release.yml'), 'utf8');
    const nextEnv = readFileSync(join(siteRoot, 'next-env.d.ts'), 'utf8');
    const securityTxtPath = join(siteRoot, 'public', '.well-known', 'security.txt');

    expect(packageJson.packageManager).toBe('pnpm@11.3.0');
    expect(packageJson.repository?.url).toBe('git+https://github.com/debugbundle/site.git');
    expect(packageJson.homepage).toBe('https://debugbundle.com');
    expect(packageJson.devDependencies?.['typescript']).toBe('^6.0.2');
    expect(packageJson.scripts?.['typecheck']).toBe('tsc --noEmit -p tsconfig.json');
    expect(tsconfig.extends).toBeUndefined();
    expect(tsconfig.compilerOptions?.['skipLibCheck']).toBe(true);
    expect(tsconfig.compilerOptions?.['strict']).toBe(true);
    expect(nextEnv).not.toContain('./.next/types/routes.d.ts');
    expect(readme).toContain('https://github.com/debugbundle/site');
    expect(readme).toContain('vendored generated artifacts');
    expect(readme).toContain('pnpm build');
    expect(changelog).toContain('## [Unreleased]');
    expect(changelog).toMatch(/## \[0\.1\.0\] - \d{4}-\d{2}-\d{2}/);
    expect(existsSync(securityTxtPath)).toBe(true);
    expect(readFileSync(securityTxtPath, 'utf8')).toContain('Canonical: https://debugbundle.com/.well-known/security.txt');
    expect(readFileSync(securityTxtPath, 'utf8')).toContain('Policy: https://github.com/debugbundle/site/security/policy');

    expect(ciWorkflow).toContain('release-manifest.json');
    expect(ciWorkflow).not.toContain('secrets.');
    expect(releaseWorkflow).toContain('tags:');
    expect(releaseWorkflow).toContain('v*');
    expect(releaseWorkflow).toContain('gh release create');
    expect(releaseWorkflow).not.toContain('aws');
    expect(releaseWorkflow).not.toContain('secrets.');
  });

  it('rehearses the copy-to-public-repo cutover from the staged site root', () => {
    const rehearsalRoot = mkdtempSync(join(tmpdir(), 'debugbundle-site-cutover-'));

    try {
      for (const entry of readdirSync(siteRoot)) {
        if (entry === 'node_modules' || entry === '.next' || entry === 'out' || entry === '.source') {
          continue;
        }

        cpSync(join(siteRoot, entry), join(rehearsalRoot, entry), { recursive: true });
      }

      const manifest = JSON.parse(readFileSync(join(rehearsalRoot, 'release-manifest.json'), 'utf8')) as {
        distributionRef: string;
        publicRepository: string;
        requiredReleaseFiles: string[];
      };
      const readme = readFileSync(join(rehearsalRoot, 'README.md'), 'utf8');
      const releaseWorkflow = readFileSync(join(rehearsalRoot, '.github/workflows/release.yml'), 'utf8');

      for (const fileName of ['release-manifest.json', ...manifest.requiredReleaseFiles]) {
        expect(existsSync(join(rehearsalRoot, fileName))).toBe(true);
      }

      expect(manifest.publicRepository).toBe('https://github.com/debugbundle/site');
      expect(manifest.distributionRef).toBe('debugbundle/site');
      expect(readme).toContain('copy the directory contents to that repo root');
      expect(readme).toContain('vendored generated artifacts');
      expect(releaseWorkflow).toContain('gh release create');
      expect(releaseWorkflow).toContain('release-manifest.json');
    } finally {
      rmSync(rehearsalRoot, { recursive: true, force: true });
    }
  }, 20_000);

  it('keeps the pricing page trial CTAs and no-card capacity messaging aligned with the hosted app flow', () => {
    const pricing = readFileSync(join(siteRoot, 'app', '(site)', 'pricing', 'page.tsx'), 'utf8');

    expect(pricing).toContain('https://app.debugbundle.com/signup');
    expect(pricing).toContain('https://app.debugbundle.com/signup?trial=solo');
    expect(pricing).toContain('https://app.debugbundle.com/signup?trial=team');
    expect(pricing).toContain('Start Solo trial');
    expect(pricing).toContain('Start Team trial');
    expect(pricing).toContain('30-day trial, no credit card required');
    expect(pricing).toContain('capacity after paid conversion');
  });

  it('tells the agent path to use the WordPress plugin instead of direct SDK installs on WordPress hosts', () => {
    const sharedPrompt = getSharedAgentInstallPrompt();
    const localOnlyPrompt = getSharedAgentInstallPrompt({ mode: 'local-only' });

    for (const prompt of [sharedPrompt, localOnlyPrompt]) {
      expect(prompt).toContain('https://debugbundle.com/docs/integrations/wordpress');
      expect(prompt).toContain('use the DebugBundle WordPress plugin instead of installing the PHP SDK or Browser SDK directly on the WordPress host');
      expect(prompt).toContain('let the plugin own backend capture, browser capture, relay setup, and token storage');
    }
  });
});
