import { expect } from '@open-wc/testing';
import { helpSearchSource } from './help-source';
import { buildHelpProduct } from '../help/help-product';
import type { UmbraDesktopHelpProduct } from '../help/help-product';

/** A product with two user-guide pages, built the way the loader builds one. */
function product(): UmbraDesktopHelpProduct {
  const files = new Map<string, string>([
    ['product.json', JSON.stringify({ id: 'umbradesktop', name: 'UmbraDesktop' })],
    ['user/README.md', '---\nid: user\ntitle: User guide\n---\n\n# User guide\n'],
    ['user/snapping.md', '---\nid: snapping\ntitle: Snapping windows\n---\n\n# Snapping windows\n\nDrag a window to an edge.\n\n## Snap layouts\n\nPick a layout.\n'],
    ['user/themes.md', '---\nid: themes\ntitle: Themes\n---\n\n# Themes\n\nPick a theme.\n'],
  ]);
  return buildHelpProduct('/docs', files)!;
}

it('is a folded source that opens Help on the page and heading found', async () => {
  const src = helpSearchSource(async () => [product()]);
  expect(src.prominence).to.equal('folded');
  const page = await src.search('snap', { skip: 0, take: 10 });
  expect(page.total).to.be.greaterThan(0);
  expect(page.items[0].open.kind).to.equal('help');
  expect((page.items[0].open as { target: string }).target.startsWith('umbradesktop/snapping')).to.equal(true);
});

it('pages through its results and reports the full count', async () => {
  const src = helpSearchSource(async () => [product()]);
  const all = await src.search('pick', { skip: 0, take: 10 });
  const first = await src.search('pick', { skip: 0, take: 1 });
  expect(first.total).to.equal(all.total);
  expect(first.items.length).to.equal(1);
});

it('loads the docs once, on the first search', async () => {
  let loads = 0;
  const src = helpSearchSource(async () => {
    loads++;
    return [product()];
  });
  await src.search('snap', { skip: 0, take: 1 });
  await src.search('theme', { skip: 0, take: 1 });
  expect(loads).to.equal(1);
});
