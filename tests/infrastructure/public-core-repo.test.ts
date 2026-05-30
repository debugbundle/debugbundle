import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('public core repository export', () => {
  it('is shaped for publishing as the dedicated debugbundle/debugbundle repository', () => {
    const expectedRootFiles = [
      'package.json',
      'pnpm-lock.yaml',
      'README.md',
      'LICENSE',
      'SECURITY.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'CODE_OF_CONDUCT.md',
      'sdks.json',
      'scripts/bootstrap-sdks.sh',
      'release-manifest.json',
      '.github/workflows/ci.yml',
      '.github/workflows/release-cli-package.yml',
      '.github/workflows/release-mcp-package.yml',
      '.github/workflows/release-shared-js-packages.yml',
      '.github/ISSUE_TEMPLATE/bug_report.yml',
      '.github/ISSUE_TEMPLATE/feature_request.yml',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ];

    for (const fileName of expectedRootFiles) {
      expect(existsSync(join(repoRoot, fileName))).toBe(true);
    }

    const forbiddenFiles = [
      '.github/workflows/deploy-hosted-stack.yml',
      '.github/workflows/deploy-hosted-github-oauth.yml',
      '.github/workflows/README-hosted-deploy.md',
      '.github/workflows/README-hosted-github-oauth.md',
      'scripts/hosted-cloudwatch-agent-config.json',
      'scripts/hosted-refresh-log-links.sh',
      'scripts/prepare-public-release.sh',
      'scripts/public-release-allowlist.md',
    ];

    for (const fileName of forbiddenFiles) {
      expect(existsSync(join(repoRoot, fileName))).toBe(false);
    }

    const manifest = JSON.parse(readFileSync(join(repoRoot, 'release-manifest.json'), 'utf8')) as {
      package: string;
      publicRepository: string;
      sourceDirectory: string;
      distributionRef: string;
      requiredReleaseFiles: string[];
    };
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      private?: boolean;
      license?: string;
      packageManager?: string;
      repository?: { url?: string };
      bugs?: { url?: string };
      homepage?: string;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const ciWorkflow = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    const workspaceConfig = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
    const vitestConfig = readFileSync(join(repoRoot, 'vitest.config.ts'), 'utf8');
    const tsconfig = readFileSync(join(repoRoot, 'tsconfig.json'), 'utf8');
    const sdkBootstrapScript = readFileSync(join(repoRoot, 'scripts/bootstrap-sdks.sh'), 'utf8');
    const sdkBootstrapManifest = JSON.parse(readFileSync(join(repoRoot, 'sdks.json'), 'utf8')) as {
      repositories: Array<{ path: string; cloneUrl: string; branch: string }>;
    };
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
    const expressExample = JSON.parse(readFileSync(join(repoRoot, 'examples/express-basic/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const fastifyExample = JSON.parse(readFileSync(join(repoRoot, 'examples/fastify-basic/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const nextjsExample = JSON.parse(readFileSync(join(repoRoot, 'examples/nextjs-basic/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(manifest).toEqual({
      package: 'debugbundle/debugbundle',
      publicRepository: 'https://github.com/debugbundle/debugbundle',
      sourceDirectory: '.',
      distributionRef: 'debugbundle/debugbundle',
      requiredReleaseFiles: expectedRootFiles.filter((fileName) => fileName !== 'release-manifest.json'),
    });

    expect(packageJson.private).toBe(true);
    expect(packageJson.license).toBe('AGPL-3.0-only');
    expect(packageJson.packageManager).toBe('pnpm@11.3.0');
    expect(packageJson.repository?.url).toBe('git+https://github.com/debugbundle/debugbundle.git');
    expect(packageJson.bugs?.url).toBe('https://github.com/debugbundle/debugbundle/issues');
    expect(packageJson.homepage).toBe('https://github.com/debugbundle/debugbundle#readme');

    expect(readme).toContain('https://github.com/debugbundle/debugbundle');
    expect(readme).toContain('AGPL-3.0-only');
    expect(ciWorkflow).not.toContain('secrets.');
    expect(ciWorkflow).not.toContain('aws');

    expect(packageJson.devDependencies?.['@debugbundle/public-site']).toBeUndefined();
    expect(packageJson.scripts?.['public-site:dev']).toBe('tsx scripts/public-site-artifacts.ts && pnpm --dir ./site dev');
    expect(packageJson.scripts?.['public-site:build']).toBe('tsx scripts/public-site-artifacts.ts && pnpm --dir ./site build');
    expect(packageJson.scripts?.['public-site:typecheck']).toBe('pnpm --dir ./site typecheck');
    expect(workspaceConfig).not.toContain('sdks/debugbundle-js/packages/*');
    expect(workspaceConfig).not.toContain('site');
    expect(vitestConfig).not.toContain('sdks/debugbundle-js/tests');
    expect(tsconfig).not.toContain('sdks/debugbundle-js/**/*.ts');
    expect(expressExample.dependencies?.['@debugbundle/sdk-node']).not.toContain('file:../../sdks/');
    expect(fastifyExample.dependencies?.['@debugbundle/sdk-node']).not.toContain('file:../../sdks/');
    expect(nextjsExample.dependencies?.['@debugbundle/sdk-node']).not.toContain('file:../../sdks/');
    expect(nextjsExample.dependencies?.['@debugbundle/sdk-browser']).not.toContain('file:../../sdks/');

    expect(sdkBootstrapManifest.repositories).toEqual([
      {
        path: 'sdks/debugbundle-js',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-js.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-python',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-python.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-php',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-php.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-wordpress',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-wordpress.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-java',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-java.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-go',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-go.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-ruby',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-ruby.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-android',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-android.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-swift',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-swift.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-react-native',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-react-native.git',
        branch: 'main',
      },
      {
        path: 'sdks/debugbundle-dotnet',
        cloneUrl: 'https://github.com/debugbundle/debugbundle-dotnet.git',
        branch: 'main',
      },
    ]);

    expect(sdkBootstrapScript).toContain('sdks.json');
    expect(sdkBootstrapScript).toContain('git clone');
    expect(sdkBootstrapScript).toContain('fetch --prune origin');
    expect(sdkBootstrapScript).toContain('checkout "$branch"');
    expect(gitignore).toContain('sdks/');
    expect(gitignore).toContain('site/');
    expect(gitignore).toContain('dist/');
    expect(gitignore).toContain('.source/');
  });
});
