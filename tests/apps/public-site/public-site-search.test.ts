import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

type PublicSitePackageJson = {
  dependencies?: Record<string, string>;
};

const publicSiteRoot = join(process.cwd(), 'site');
const rootLayoutPath = join(publicSiteRoot, 'app/layout.tsx');
const contentDocsDir = join(publicSiteRoot, 'content/docs');
const searchIndexModule = join(publicSiteRoot, 'src/search-index.ts');
const generateScript = join(publicSiteRoot, 'scripts/generate-public-artifacts.ts');

/** Recursively collect all MDX files under a directory. */
function collectMdxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMdxFiles(full));
    } else if (entry.isFile() && extname(entry.name) === '.mdx') {
      files.push(full);
    }
  }
  return files;
}

describe('public site search', () => {
  it('enables static Orama search in the root layout', () => {
    const rootLayout = readFileSync(rootLayoutPath, 'utf8');

    // RootProvider must install the local dialog workaround and point it at the exported index.
    expect(rootLayout).toContain("search={");
    expect(rootLayout).toContain('DocsSearchDialog');
    expect(rootLayout).toContain("api: '/search-index.json'");
  });

  it('declares @orama/orama as a dependency for the search index', () => {
    const packageJson = JSON.parse(
      readFileSync(join(publicSiteRoot, 'package.json'), 'utf8'),
    ) as PublicSitePackageJson;
    expect(packageJson.dependencies).toHaveProperty('@orama/orama');
  });

  it('wires the search index generator into the build pipeline', () => {
    const generateSource = readFileSync(generateScript, 'utf8');
    expect(generateSource).toContain('writeSearchIndex');
    expect(generateSource).toContain('search-index');
  });

  it('provides a search index module that builds indexes from all MDX docs', () => {
    const moduleSource = readFileSync(searchIndexModule, 'utf8');

    // Must read MDX files and extract frontmatter
    expect(moduleSource).toContain('content/docs');
    expect(moduleSource).toContain('parseFrontmatter');
    expect(moduleSource).toContain('initSimpleSearch');
    // Must export a build function
    expect(moduleSource).toContain('export async function writeSearchIndex');
    // Must write to the public directory
    expect(moduleSource).toContain('search-index.json');
  });

  it('provides a local search dialog workaround for the Fumadocs static client bug', () => {
    const dialogSource = readFileSync(join(publicSiteRoot, 'src/components/docs-search-dialog.tsx'), 'utf8');

    expect(dialogSource).toContain('createStaticClient');
    expect(dialogSource).toContain('searchOrama');
    expect(dialogSource).toContain('SearchDialogList');
    expect(dialogSource).toContain('search-index.json');
  });

  it('has a title in every MDX page frontmatter so the search index is complete', () => {
    const mdxFiles = collectMdxFiles(contentDocsDir);
    expect(mdxFiles.length).toBeGreaterThanOrEqual(60);

    const missingTitles: string[] = [];
    for (const filePath of mdxFiles) {
      const source = readFileSync(filePath, 'utf8');
      const match = source.match(/^---\r?\n[\s\S]*?title:\s*["']?(.+?)["']?\s*$/m);
      if (!match?.[1]?.trim()) {
        missingTitles.push(relative(publicSiteRoot, filePath));
      }
    }

    expect(missingTitles).toEqual([]);
  });
});
