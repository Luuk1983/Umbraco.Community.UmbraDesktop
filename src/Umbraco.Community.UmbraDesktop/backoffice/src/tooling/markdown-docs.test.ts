import { expect } from '@open-wc/testing';
import {
  checkDocs,
  extractLinks,
  githubSlug,
  headingAnchors,
  parseFrontMatter,
} from '../../scripts/docs/markdown-docs.mjs';

describe('githubSlug', () => {
  it('lowercases and hyphenates the way GitHub and Docusaurus both do', () => {
    expect(githubSlug('Live preview')).to.equal('live-preview');
  });

  it('drops punctuation, so an apostrophe does not survive into the anchor', () => {
    expect(githubSlug("The backoffice's own colours")).to.equal('the-backoffices-own-colours');
  });

  it('keeps hyphens and underscores and collapses nothing else', () => {
    expect(githubSlug('Connecting other Umbraco instances (experimental)')).to.equal(
      'connecting-other-umbraco-instances-experimental',
    );
    expect(githubSlug('A -- b')).to.equal('a----b');
  });
});

describe('headingAnchors', () => {
  it('collects an anchor for every heading level', () => {
    const anchors = headingAnchors('# Title\n\n## Two words\n\n### Third\n');
    expect([...anchors]).to.deep.equal(['title', 'two-words', 'third']);
  });

  it('suffixes repeated headings the way GitHub does', () => {
    const anchors = headingAnchors('## Notes\n\n## Notes\n\n## Notes\n');
    expect([...anchors]).to.deep.equal(['notes', 'notes-1', 'notes-2']);
  });

  it('ignores lines inside fenced code, where a # is a comment, not a heading', () => {
    const anchors = headingAnchors('# Real\n\n```bash\n# not a heading\n```\n');
    expect([...anchors]).to.deep.equal(['real']);
  });

  it('slugs the rendered text of a heading, not its markup', () => {
    const anchors = headingAnchors('## The `umbraDesktopApp` manifest\n\n## See [the guide](x.md)\n\n## **Bold** move\n');
    expect([...anchors]).to.deep.equal(['the-umbradesktopapp-manifest', 'see-the-guide', 'bold-move']);
  });

  it('does not treat front matter as content', () => {
    const anchors = headingAnchors('---\nid: x\ntitle: X\n---\n\n# X\n');
    expect([...anchors]).to.deep.equal(['x']);
  });
});

describe('extractLinks', () => {
  it('finds links and images with the line they are on', () => {
    const links = extractLinks('Intro\n\nSee [themes](themes.md#umbraco-4).\n\n![Shot](../screenshots/a.png)\n');
    expect(links).to.deep.equal([
      { target: 'themes.md#umbraco-4', line: 3, image: false },
      { target: '../screenshots/a.png', line: 5, image: true },
    ]);
  });

  it('finds an image nested inside a link, as the badges are', () => {
    const links = extractLinks('[![NuGet](https://img.shields.io/x)](https://www.nuget.org/y)\n');
    expect(links.map((l) => l.target)).to.deep.equal(['https://img.shields.io/x', 'https://www.nuget.org/y']);
  });

  it('skips fenced code and inline code, where brackets are not links', () => {
    const links = extractLinks('```md\n[not](a.md)\n```\n\nUse `[x](y.md)` literally, then [real](b.md).\n');
    expect(links.map((l) => l.target)).to.deep.equal(['b.md']);
  });

  it('drops a link title and keeps only the target', () => {
    const links = extractLinks('[a](b.md "Title")\n');
    expect(links.map((l) => l.target)).to.deep.equal(['b.md']);
  });
});

describe('parseFrontMatter', () => {
  it('reads simple key: value pairs and returns the body after them', () => {
    const { data, body } = parseFrontMatter('---\nid: live-preview\ntitle: Live preview\nsidebar_position: 3\n---\n\n# Live preview\n');
    expect(data).to.deep.equal({ id: 'live-preview', title: 'Live preview', sidebar_position: '3' });
    expect(body).to.equal('\n# Live preview\n');
  });

  it('unquotes a quoted value, which a title with a colon needs', () => {
    const { data } = parseFrontMatter('---\ntitle: "Desktop apps: the guide"\n---\n');
    expect(data.title).to.equal('Desktop apps: the guide');
  });

  it('returns no data for a file without front matter', () => {
    const { data, body } = parseFrontMatter('# Just a heading\n');
    expect(data).to.deep.equal({});
    expect(body).to.equal('# Just a heading\n');
  });
});

describe('checkDocs', () => {
  /**
   * Runs the checker over an in-memory tree.
   * @param files Repository-relative path to file content, for Markdown files.
   * @param other Paths of other files and directories that exist.
   * @param published Paths that are published pages, and the product each belongs to.
   * @returns The problems found, as the strings the build prints.
   */
  function run(files: Record<string, string>, other: string[] = [], published: Record<string, string> = {}) {
    const exists = new Set([...Object.keys(files), ...other]);
    return checkDocs({
      files: new Map(Object.entries(files)),
      exists: (path: string) => exists.has(path),
      productOf: (path: string) => published[path],
    }).map((p) => `${p.file}:${p.line} ${p.message}`);
  }

  it('passes a link to a page and heading that exist', () => {
    expect(
      run({
        'README.md': 'See [preview](docs/user/live-preview.md#headless-sites).\n',
        'docs/user/live-preview.md': '# Live preview\n\n## Headless sites\n',
      }),
    ).to.deep.equal([]);
  });

  it('reports a link to a file that does not exist', () => {
    expect(run({ 'README.md': 'x\n[gone](docs/developer/theming.md)\n' })).to.deep.equal([
      'README.md:2 links to docs/developer/theming.md, which does not exist',
    ]);
  });

  it('reports a link to a heading that does not exist in the target', () => {
    expect(
      run({
        'docs/a.md': '[b](b.md#missing)\n',
        'docs/b.md': '# B\n',
      }),
    ).to.deep.equal(['docs/a.md:1 links to #missing in docs/b.md, which has no such heading']);
  });

  it('checks a link to a heading on the same page', () => {
    expect(run({ 'README.md': '# Top\n\n[up](#top) [down](#bottom)\n' })).to.deep.equal([
      'README.md:3 links to #bottom in README.md, which has no such heading',
    ]);
  });

  it('resolves ../ against the linking file', () => {
    expect(
      run({ 'docs/user/windows/snapping.md': '![shot](../../screenshots/snap.png)\n' }, ['docs/screenshots/snap.png']),
    ).to.deep.equal([]);
  });

  it('accepts a link to a directory that exists', () => {
    expect(run({ 'README.md': '[guide](docs/user/)\n' }, ['docs/user'])).to.deep.equal([]);
  });

  it('decodes an escaped space in a path', () => {
    expect(run({ 'README.md': '[x](docs/a%20b.md)\n', 'docs/a b.md': '# A\n' })).to.deep.equal([]);
  });

  it('leaves external links and mail links alone', () => {
    expect(run({ 'README.md': '[a](https://example.com/x.md) [b](mailto:x@example.com)\n' })).to.deep.equal([]);
  });

  it('requires an id and a title on every published page', () => {
    expect(
      run({ 'docs/user/a.md': '# A\n' }, [], { 'docs/user/a.md': 'umbradesktop' }),
    ).to.deep.equal([
      'docs/user/a.md:1 has no id in its front matter',
      'docs/user/a.md:1 has no title in its front matter',
    ]);
  });

  it('reports two published pages of one product that share an id', () => {
    const page = '---\nid: themes\ntitle: Themes\n---\n';
    expect(
      run({ 'docs/user/a.md': page, 'docs/user/b.md': page }, [], {
        'docs/user/a.md': 'umbradesktop',
        'docs/user/b.md': 'umbradesktop',
      }),
    ).to.deep.equal(['docs/user/b.md:1 uses the id themes, which docs/user/a.md already uses']);
  });

  it('allows the same id in two different products', () => {
    const page = '---\nid: overview\ntitle: Overview\n---\n';
    expect(
      run({ 'docs/user/README.md': page, 'addon/docs/user/README.md': page }, [], {
        'docs/user/README.md': 'umbradesktop',
        'addon/docs/user/README.md': 'entertainment',
      }),
    ).to.deep.equal([]);
  });

  it('does not ask front matter of a file that is not published, such as a design doc', () => {
    expect(run({ 'docs/design/x.md': '# X\n' })).to.deep.equal([]);
  });

  it('flags an absolute link into this repository from a published page, which pins nothing to a version', () => {
    expect(
      run(
        {
          'docs/user/a.md':
            '---\nid: a\ntitle: A\n---\n![x](https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/main/docs/screenshots/a.png)\n',
        },
        [],
        { 'docs/user/a.md': 'umbradesktop' },
      ),
    ).to.deep.equal([
      'docs/user/a.md:5 links to this repository by absolute URL; use a relative path so it follows the version',
    ]);
  });

  it('flags the same in a README, which is packed and pinned at release', () => {
    expect(
      run({ 'README.md': '[l](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/LICENSE)\n' }),
    ).to.deep.equal([
      'README.md:1 links to this repository by absolute URL; use a relative path so it follows the version',
    ]);
  });

  it('allows a link to an issue in a design doc, which is not a file in the repository', () => {
    expect(
      run({ 'docs/design/x.md': '[#78](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/78)\n' }),
    ).to.deep.equal([]);
  });

  it('allows an absolute link into another product, which is how an add-on links to the desktop', () => {
    expect(
      run(
        {
          'addon/docs/user/games.md':
            '---\nid: games\ntitle: Games\n---\n[apps](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/developer/desktop-apps.md)\n',
        },
        [],
        { 'addon/docs/user/games.md': 'entertainment', 'docs/developer/desktop-apps.md': 'umbradesktop' },
      ),
    ).to.deep.equal([]);
  });

  it('still flags an absolute link into the same product', () => {
    expect(
      run(
        {
          'docs/user/a.md':
            '---\nid: a\ntitle: A\n---\n[b](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/user/b.md)\n',
        },
        [],
        { 'docs/user/a.md': 'umbradesktop', 'docs/user/b.md': 'umbradesktop' },
      ),
    ).to.deep.equal([
      'docs/user/a.md:5 links to this repository by absolute URL; use a relative path so it follows the version',
    ]);
  });

  it('allows a link to an issue from a published page too', () => {
    expect(
      run(
        { 'docs/user/a.md': '---\nid: a\ntitle: A\n---\n[#78](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/78)\n' },
        [],
        { 'docs/user/a.md': 'umbradesktop' },
      ),
    ).to.deep.equal([]);
  });
});
