import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { siteConfig } from '../../../site/src/site-config.js';

const appDir = join(process.cwd(), 'site/app');
const siteDir = join(appDir, '(site)');

describe('Phase 15 — Homepage, Marketing & Blog', () => {
  describe('landing page', () => {
    it('has a real landing page with product framing', () => {
      const landing = readFileSync(join(siteDir, 'page.tsx'), 'utf8');

      // Must have a real hero with product value proposition
      expect(landing).toContain('DebugBundle');
      // Must link to docs and app
      expect(landing).toContain('/docs/');
      expect(landing).toContain('app.debugbundle.com');
      // Must NOT still contain the scaffold notice
      expect(landing).not.toContain('Current scaffold status');
      expect(landing).not.toContain('first slice establishes');
    });

    it('includes a terminal quick-start example', () => {
      const landing = readFileSync(join(siteDir, 'page.tsx'), 'utf8');
      expect(landing).toContain('debugbundle setup');
    });

    it('has SEO metadata exports', () => {
      const landing = readFileSync(join(siteDir, 'page.tsx'), 'utf8');
      expect(landing).toContain('export const metadata');
    });
  });

  describe('pricing page', () => {
    it('has real tier pricing data from spec', () => {
      const pricing = readFileSync(join(siteDir, 'pricing/page.tsx'), 'utf8');

      // Must reference actual prices
      expect(pricing).toContain('$2.99');
      expect(pricing).toContain('$49');
      // Must reference all three tiers
      expect(pricing).toContain('Free');
      expect(pricing).toContain('Solo');
      expect(pricing).toContain('Team');
      // Must NOT still contain placeholder text
      expect(pricing).not.toContain('richer allowance and slot details');
    });

    it('includes extra capacity pricing and free-tier capacity wording', () => {
      const pricing = readFileSync(join(siteDir, 'pricing/page.tsx'), 'utf8');
      expect(pricing).toContain('$1.99');
      expect(pricing).toContain('$4.99');
      expect(pricing).toContain('Get-started capacity');
      expect(pricing).not.toContain('1 project');
    });

    it('includes shared allowance explanation', () => {
      const pricing = readFileSync(join(siteDir, 'pricing/page.tsx'), 'utf8');
      // Must explain the shared allowance model
      expect(pricing).toMatch(/shared.*allowance|allowance.*shared/i);
    });

    it('has SEO metadata exports', () => {
      const pricing = readFileSync(join(siteDir, 'pricing/page.tsx'), 'utf8');
      expect(pricing).toContain('export const metadata');
    });
  });

  describe('blog', () => {
    it('has the seed launch post', () => {
      const launchPost = join(process.cwd(), 'site/content/blog/launching-debugbundle.mdx');
      expect(existsSync(launchPost)).toBe(true);
    });

    it('has additional blog posts for launch', () => {
      const blogDir = join(process.cwd(), 'site/content/blog');
      // Must have at least 3 blog posts for a credible launch
      const whyPost = existsSync(join(blogDir, 'why-debugbundle.mdx'));
      const agentPost = existsSync(join(blogDir, 'agent-first-debugging.mdx'));
      const localPost = existsSync(join(blogDir, 'local-first-development.mdx'));
      expect(whyPost).toBe(true);
      expect(agentPost).toBe(true);
      expect(localPost).toBe(true);
    });

    it('all blog posts have required frontmatter', () => {
      const blogDir = join(process.cwd(), 'site/content/blog');
      const posts = [
        'launching-debugbundle.mdx',
        'why-debugbundle.mdx',
        'agent-first-debugging.mdx',
        'local-first-development.mdx',
      ];

      for (const post of posts) {
        const content = readFileSync(join(blogDir, post), 'utf8');
        expect(content).toMatch(/^---/);
        expect(content).toMatch(/title:/);
        expect(content).toMatch(/description:/);
        expect(content).toMatch(/date:/);
      }
    });

    it('blog posts are registered in content-source', () => {
      const contentSource = readFileSync(
        join(process.cwd(), 'site/src/content-source.ts'),
        'utf8',
      );
      expect(contentSource).toContain('why-debugbundle.mdx');
      expect(contentSource).toContain('agent-first-debugging.mdx');
      expect(contentSource).toContain('local-first-development.mdx');
    });
  });

  describe('legal and informational pages', () => {
    it('privacy page has real content', () => {
      const privacy = readFileSync(join(siteDir, 'privacy/page.tsx'), 'utf8');
      expect(privacy).not.toContain('placeholder route');
      expect(privacy).toContain('Privacy');
    });

    it('terms page has real content', () => {
      const terms = readFileSync(join(siteDir, 'terms/page.tsx'), 'utf8');
      expect(terms).not.toContain('placeholder route');
      expect(terms).toContain('Terms');
    });

    it('about page has real product philosophy content', () => {
      const about = readFileSync(join(siteDir, 'about/page.tsx'), 'utf8');
      // Must expand beyond the one-line scaffold
      expect(about).toContain('DebugBundle');
      expect(about).toMatch(/agent|debug|bundle/i);
      // Check it has substantive sections
      const lineCount = about.split('\n').length;
      expect(lineCount).toBeGreaterThan(20);
    });

    it('contact page has real content', () => {
      const contact = readFileSync(join(siteDir, 'contact/page.tsx'), 'utf8');
      expect(contact).not.toContain('placeholder route');
    });

    it('security page links to docs security section', () => {
      const security = readFileSync(join(siteDir, 'security/page.tsx'), 'utf8');
      expect(security).toContain('/docs/');
      expect(security).not.toContain('scaffold includes a trust route');
    });

    it('changelog page has substantive content', () => {
      const changelog = readFileSync(join(siteDir, 'changelog/page.tsx'), 'utf8');
      expect(changelog).not.toContain('scaffolded now so');
    });
  });

  describe('SEO fundamentals', () => {
    it('sitemap is dynamically generated from content sources', () => {
      const sitemap = readFileSync(join(appDir, 'sitemap.ts'), 'utf8');
      // Must import and iterate content sources instead of hardcoding all routes
      expect(sitemap).toContain('docsSource');
      expect(sitemap).toContain('blogSource');
      // Must still include static marketing routes
      expect(sitemap).toContain('/pricing/');
      expect(sitemap).toContain('/about/');
      expect(sitemap).toContain('/privacy/');
      expect(sitemap).toContain('/terms/');
    });

    it('sitemap covers doc pages dynamically', () => {
      const sitemap = readFileSync(join(appDir, 'sitemap.ts'), 'utf8');
      // Must use getPages() to enumerate all doc/blog pages
      expect(sitemap).toContain('getPages');
    });

    it('landing page has OpenGraph metadata', () => {
      const layout = readFileSync(join(appDir, 'layout.tsx'), 'utf8');
      expect(layout).toMatch(/openGraph/i);
    });
  });

  describe('structured data / JSON-LD', () => {
    it('root layout includes Organization JSON-LD', () => {
      const layout = readFileSync(join(appDir, 'layout.tsx'), 'utf8');
      expect(layout).toContain('application/ld+json');
      expect(layout).toContain('Organization');
      expect(layout).toContain('debugbundle.com');
    });

    it('landing page includes SoftwareApplication JSON-LD', () => {
      const landing = readFileSync(join(siteDir, 'page.tsx'), 'utf8');
      expect(landing).toContain('application/ld+json');
      expect(landing).toContain('SoftwareApplication');
    });

    it('pricing page includes FAQPage JSON-LD', () => {
      const pricing = readFileSync(join(siteDir, 'pricing/page.tsx'), 'utf8');
      expect(pricing).toContain('application/ld+json');
      expect(pricing).toContain('FAQPage');
    });

    it('blog post page includes Article JSON-LD', () => {
      const blogPost = readFileSync(
        join(appDir, '(blog)/blog/[...slug]/page.tsx'),
        'utf8',
      );
      expect(blogPost).toContain('application/ld+json');
      expect(blogPost).toContain('Article');
    });
  });

  describe('navigation correctness', () => {
    it('site config has all required navigation entries', () => {
      expect(siteConfig.primaryNav).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ href: '/docs/' }),
          expect.objectContaining({ href: '/pricing/' }),
          expect.objectContaining({ href: '/blog/' }),
        ]),
      );
    });

    it('footer nav includes legal pages', () => {
      expect(siteConfig.footerNav).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ href: '/privacy/' }),
          expect.objectContaining({ href: '/terms/' }),
        ]),
      );
    });
  });
});
