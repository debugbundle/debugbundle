import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { blog, docs } from '../../../site/source.config.js';

const publicSiteRoot = join(process.cwd(), 'site');
const nextConfigPath = join(publicSiteRoot, 'next.config.mjs');
const rootLayoutPath = join(publicSiteRoot, 'app/layout.tsx');
const docsLayoutPath = join(publicSiteRoot, 'app/(docs)/docs/layout.tsx');
const docsPagePath = join(publicSiteRoot, 'app/(docs)/docs/[[...slug]]/page.tsx');
const blogLayoutPath = join(publicSiteRoot, 'app/(blog)/blog/layout.tsx');
const blogPostPath = join(publicSiteRoot, 'app/(blog)/blog/[...slug]/page.tsx');
const mdxComponentsPath = join(publicSiteRoot, 'src/content-components.tsx');

describe('public site content source', () => {
  it('wraps the public site with the Next MDX integration required for Fumadocs content', () => {
    const nextConfigSource = readFileSync(nextConfigPath, 'utf8');

    expect(nextConfigSource).toContain("createMDX");
    expect(nextConfigSource).toContain("source.config.ts");
    expect(nextConfigSource).toContain("pageExtensions: ['ts', 'tsx', 'mdx']");
  });

  it('declares separate docs and blog collections for the public content tree', () => {
    expect(docs.type).toBe('docs');
    expect(docs.dir).toBe('content/docs');
    expect(blog.type).toBe('docs');
    expect(blog.dir).toBe('content/blog');
  });

  it('ships MDX content files for the stable docs routes and initial blog post', () => {
    expect(existsSync(join(publicSiteRoot, 'content/docs/index.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/what-is-debugbundle.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/quickstart.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/how-it-works.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/installation.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/core-concepts.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/agent-workflows.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/agent-workflows/skill-file.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/agent-workflows/automation-recipes.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/index.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/node.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/browser.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/browser-relay.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/python.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/php.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/android.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/swift.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/react-native.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/sdks/universal-interface.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/cli/index.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/cli/setup.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/cli/local-workflow.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/cli/cloud-workflow.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/cli/log-ingestion.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/cli/tokens.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/cli/webhooks.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/cli/alerts.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/api/index.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/api/authentication.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/api/incidents.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/api/ingestion.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/api/alerts.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/api/projects.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/api/probes.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/api/webhooks.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/api/billing.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/mcp/index.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/mcp/tools.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/mcp/workflows.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/alerts.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/probes.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/bundles/index.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/bundles/schema.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/incidents/index.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/incidents/reproduction.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/webhooks/events.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/webhooks/verification.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/webhooks.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/security.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/security/redaction.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/security/tokens.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/project-setup/index.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/project-setup/profile.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/project-setup/local-only.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/project-setup/connect-to-cloud.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/capture-policy.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/self-hosting.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/pricing.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/billing.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/changelog.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/llms-txt.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/troubleshooting.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/faq.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/v1/overview.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/v1/api.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/v1/cli.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/v1/mcp.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/docs/v1/webhooks.mdx'))).toBe(true);
    expect(existsSync(join(publicSiteRoot, 'content/blog/launching-debugbundle.mdx'))).toBe(true);
  });

  it('wires the docs and blog experience through Fumadocs UI primitives', () => {
    const rootLayout = readFileSync(rootLayoutPath, 'utf8');
    const docsLayout = readFileSync(docsLayoutPath, 'utf8');
    const docsPage = readFileSync(docsPagePath, 'utf8');
    const blogLayout = readFileSync(blogLayoutPath, 'utf8');
    const blogPost = readFileSync(blogPostPath, 'utf8');
    const mdxComponents = readFileSync(mdxComponentsPath, 'utf8');

    expect(rootLayout).toContain("RootProvider");
    expect(rootLayout).toContain("attribute: 'class'");

    expect(docsLayout).toContain("DocsLayout");
    expect(docsLayout).toContain('docsSource.getPageTree()');

    expect(docsPage).toContain('DocsPage');
    expect(docsPage).toContain('DocsBody');
    expect(docsPage).toContain('DocsTitle');
    expect(docsPage).toContain('DocsDescription');
    expect(docsPage).toContain('pageData.toc');

    expect(blogLayout).toContain('HomeLayout');
    expect(blogPost).toContain('DocsBody');
    expect(blogPost).toContain('DocsTitle');
    expect(blogPost).toContain('DocsDescription');

    expect(mdxComponents).toContain('defaultMdxComponents');
  });
});
