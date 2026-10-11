import { expect } from '@open-wc/testing';
import { buildHelpProduct } from './help-product.js';

const product = JSON.stringify({ id: 'umbradesktop', name: 'UmbraDesktop', repository: 'https://github.com/o/r', docsRoot: 'docs', ref: 'abc' });

/**
 * A page with front matter.
 * @param id The page id.
 * @param title The title.
 * @param extra More front matter lines, and the body after it.
 * @returns The Markdown source.
 */
const page = (id: string, title: string, extra = '') => `---\nid: ${id}\ntitle: ${title}\n${extra}---\n\n# ${title}\n`;

/**
 * Builds a product from an in-memory folder.
 * @param files Path relative to the docs folder to content.
 * @returns The product.
 */
const build = (files: Record<string, string>) => buildHelpProduct('/App_Plugins/X/docs', new Map(Object.entries({ 'product.json': product, ...files })));

describe('buildHelpProduct', () => {
  it('reads the product fields', () => {
    const result = build({ 'user/README.md': page('user-guide', 'User guide') })!;
    expect(result.id).to.equal('umbradesktop');
    expect(result.name).to.equal('UmbraDesktop');
    expect(result.basePath).to.equal('/App_Plugins/X/docs');
    expect(result.repository).to.equal('https://github.com/o/r');
    expect(result.docsRoot).to.equal('docs');
    expect(result.ref).to.equal('abc');
  });

  it('refuses a folder whose product.json has no id, since nothing could link to it', () => {
    expect(buildHelpProduct('/x', new Map([['product.json', '{"name":"X"}']]))).to.equal(undefined);
    expect(buildHelpProduct('/x', new Map([['product.json', 'not json']]))).to.equal(undefined);
    expect(buildHelpProduct('/x', new Map())).to.equal(undefined);
  });

  it('puts the user guide before the developer guide, each with its front page', () => {
    const result = build({
      'developer/README.md': page('developer-guide', 'Developer guide'),
      'user/README.md': page('user-guide', 'User guide'),
    })!;
    expect(result.parts.map((p) => [p.part, p.index?.id])).to.deep.equal([
      ['user', 'user-guide'],
      ['developer', 'developer-guide'],
    ]);
    expect(result.frontPage?.id).to.equal('user-guide');
  });

  it('orders categories by their _category_.json position and pages by sidebar_position, then title', () => {
    const result = build({
      'user/README.md': page('user-guide', 'User guide'),
      'user/windows/_category_.json': '{"label":"Windows","position":2}',
      'user/windows/README.md': page('windows', 'Windows'),
      'user/windows/snapping.md': page('snapping', 'Snapping', 'sidebar_position: 2\n'),
      'user/windows/moving.md': page('moving', 'Moving', 'sidebar_position: 1\n'),
      'user/windows/zzz.md': page('zzz', 'Aardvark'),
      'user/windows/yyy.md': page('yyy', 'Badger'),
      'user/getting-started/_category_.json': '{"label":"Getting started","position":1}',
      'user/getting-started/install.md': page('install', 'Install'),
    })!;
    const user = result.parts[0];
    expect(user.categories.map((c) => c.label)).to.deep.equal(['Getting started', 'Windows']);
    expect(user.categories[1].index?.id).to.equal('windows');
    expect(user.categories[1].pages.map((p) => p.id)).to.deep.equal(['moving', 'snapping', 'zzz', 'yyy']);
  });

  it('falls back to the category front page title, then the folder name, for a label', () => {
    const result = build({
      'user/apps/README.md': page('apps', 'Apps'),
      'user/apps/a.md': page('a', 'A'),
      'user/extra/b.md': page('b', 'B'),
    })!;
    expect(result.parts[0].categories.map((c) => c.label)).to.deep.equal(['Apps', 'extra']);
  });

  it('keeps pages directly in a part as that part\'s own pages', () => {
    const result = build({ 'developer/theming.md': page('theming', 'Adding a theme') })!;
    expect(result.parts[0].pages.map((p) => p.id)).to.deep.equal(['theming']);
  });

  it('indexes pages by id and by path, with headings, body and description', () => {
    const result = build({
      'user/windows/live-preview.md': page('live-preview', 'Live preview', 'description: See the page.\n') + '\n## Headless sites\n\nText.\n',
    })!;
    const preview = result.pageById.get('live-preview')!;
    expect(result.pageByPath.get('user/windows/live-preview.md')).to.equal(preview);
    expect(preview.description).to.equal('See the page.');
    expect(preview.headings.map((h) => h.anchor)).to.deep.equal(['live-preview', 'headless-sites']);
    expect(preview.body.startsWith('\n# Live preview')).to.equal(true);
    expect(preview.folder).to.equal('user/windows');
  });

  it('skips and reports a page without an id, and a second page with the same id', () => {
    const result = build({
      'user/a.md': '# No front matter\n',
      'user/b.md': page('same', 'B'),
      'user/c.md': page('same', 'C'),
    })!;
    expect(result.parts[0].pages.map((p) => p.title)).to.deep.equal(['B']);
    expect(result.problems).to.deep.equal([
      'user/a.md has no id in its front matter, so it is left out of Help',
      'user/c.md uses the id same, which user/b.md already uses, so it is left out of Help',
    ]);
  });

  it('takes the title from the first heading when the front matter has none', () => {
    const result = build({ 'user/a.md': '---\nid: a\n---\n\n# From the heading\n' })!;
    expect(result.pageById.get('a')!.title).to.equal('From the heading');
  });

  it('gives each part a front page: its README, else its first page, else its first category\'s', () => {
    const result = build({
      'user/windows/README.md': page('windows', 'Windows'),
      'user/windows/snapping.md': page('snapping', 'Snapping'),
      'developer/theming.md': page('theming', 'Theming'),
      'developer/README.md': page('developer-guide', 'Developer guide'),
    })!;
    expect(result.parts.map((p) => p.frontPage?.id)).to.deep.equal(['windows', 'developer-guide']);
  });

  it('tells each page which part it is in', () => {
    const result = build({ 'user/windows/snapping.md': page('snapping', 'Snapping'), 'developer/theming.md': page('theming', 'Theming') })!;
    expect(result.pageById.get('snapping')!.part).to.equal('user');
    expect(result.pageById.get('theming')!.part).to.equal('developer');
  });

  it('resolves a page\'s front matter image against the docs folder, and drops one that climbs out', () => {
    const result = build({
      'user/README.md': page('user-guide', 'User guide', 'image: ../screenshots/hero.png\n'),
      'user/a.md': page('a', 'A', 'image: ../../outside.png\n'),
      'user/b.md': page('b', 'B', 'image: https://example.com/b.png\n'),
    })!;
    expect(result.pageById.get('user-guide')!.image).to.equal('screenshots/hero.png');
    expect(result.pageById.get('a')!.image).to.equal(undefined);
    expect(result.pageById.get('b')!.image).to.equal(undefined);
  });

  it('ignores files outside user/ and developer/', () => {
    const result = build({ 'design/x.md': page('x', 'X'), 'user/README.md': page('user-guide', 'User guide') })!;
    expect(result.pageById.has('x')).to.equal(false);
  });
});
