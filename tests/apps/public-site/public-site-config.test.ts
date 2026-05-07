import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { siteConfig, supportedThemes } from '../../../site/src/site-config.js';

const nextConfigPath = join(process.cwd(), 'site/next.config.mjs');

describe('public site scaffold', () => {
  it('supports the public-site navigation contract', () => {
    expect(siteConfig.primaryNav).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: '/docs/' }),
        expect.objectContaining({ href: '/pricing/' }),
        expect.objectContaining({ href: '/blog/' }),
      ]),
    );

    expect(siteConfig.appUrl).toBe('https://app.debugbundle.com');
  });

  it('ships with dual-theme support from the first slice', () => {
    expect(supportedThemes).toEqual(['light', 'dark', 'system']);
  });

  it('keeps the public site static-export compatible', () => {
    const nextConfig = readFileSync(nextConfigPath, 'utf8');

    expect(nextConfig).toContain("output: 'export'");
    expect(nextConfig).toContain('trailingSlash: true');
    expect(nextConfig).toContain('unoptimized: true');
  });
});