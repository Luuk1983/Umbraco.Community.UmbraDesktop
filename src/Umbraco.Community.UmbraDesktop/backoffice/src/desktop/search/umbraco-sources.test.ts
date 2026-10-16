import { expect } from '@open-wc/testing';
import { toSearchItem, umbracoSearchSource } from './umbraco-sources';
import type { UmbraDesktopSearchProviderApi } from './umbraco-sources';

const KEY = 'aaaaaaaa-1111-2222-3333-444444444444';

it('names a variant document in the current culture', () => {
  const item = toSearchItem(
    { unique: KEY, entityType: 'document', name: 'Home', variants: [{ culture: 'en-US', name: 'Home' }, { culture: 'nl-NL', name: 'Thuis' }] },
    'nl-NL',
  );
  expect(item.name).to.equal('Thuis');
});

it('falls back to the invariant, then the given name, then the first variant, never a blank row', () => {
  expect(toSearchItem({ unique: KEY, entityType: 'document', variants: [{ culture: null, name: 'Invariant' }] }, 'da-DK').name).to.equal('Invariant');
  expect(toSearchItem({ unique: KEY, entityType: 'document', name: 'Given', variants: [{ culture: 'en-US', name: 'English' }] }, 'da-DK').name).to.equal('Given');
  expect(toSearchItem({ unique: KEY, entityType: 'document', variants: [{ culture: 'en-US', name: 'English' }] }, 'da-DK').name).to.equal('English');
  expect(toSearchItem({ unique: KEY, entityType: 'document', variants: [{ culture: 'en-US', name: '' }] }, 'da-DK').name).to.equal(KEY);
});

it('shows where a document lives from its ancestors', () => {
  const item = toSearchItem({ unique: KEY, entityType: 'document', name: 'Post', ancestors: [{ name: 'Home' }, { variants: [{ culture: 'en-US', name: 'News' }] }] }, 'en-US');
  expect(item.detail).to.equal('Home › News');
});

it("takes the icon from the item, else its document or media type's", () => {
  expect(toSearchItem({ unique: KEY, entityType: 'data-type', icon: 'icon-autofill' }).icon).to.equal('icon-autofill');
  expect(toSearchItem({ unique: KEY, entityType: 'document', documentType: { icon: 'icon-home' } }).icon).to.equal('icon-home');
  expect(toSearchItem({ unique: KEY, entityType: 'media', mediaType: { icon: 'icon-picture' } }).icon).to.equal('icon-picture');
});

it('keeps the href for opening, keyed by entity type and key', () => {
  const item = toSearchItem({ unique: KEY, entityType: 'media', name: 'Logo', href: `section/media/workspace/media/edit/${KEY}` });
  expect(item.key).to.equal(`media:${KEY}`);
  expect(item.open).to.deep.equal({ kind: 'entity', entityType: 'media', unique: KEY, href: `section/media/workspace/media/edit/${KEY}` });
});

it('asks the provider for the page and culture, and is full only for documents and media', async () => {
  const seen: unknown[] = [];
  const provider: UmbraDesktopSearchProviderApi = {
    search: async (args) => {
      seen.push(args);
      return { data: { items: [{ unique: KEY, entityType: 'document', name: 'Home' }], total: 7 } };
    },
  };
  const docs = umbracoSearchSource({ alias: 'Umb.GlobalSearch.Document', weight: 800, meta: { label: 'Documents', searchProviderAlias: 'p' } }, provider, () => 'en-US');
  const types = umbracoSearchSource({ alias: 'Umb.GlobalSearch.DataType', meta: { label: 'Data Types', searchProviderAlias: 'p' } }, provider, () => undefined);
  expect([docs.prominence, docs.weight, docs.label]).to.deep.equal(['full', 800, 'Documents']);
  expect([types.prominence, types.weight]).to.deep.equal(['folded', 0]);
  const page = await docs.search('home', { skip: 0, take: 5 });
  expect(seen[0]).to.deep.equal({ query: 'home', paging: { skip: 0, take: 5 }, culture: 'en-US' });
  expect(page.total).to.equal(7);
  expect(page.items.map((i) => i.name)).to.deep.equal(['Home']);
});

it('turns a provider error into a throw, which the engine treats as a failed source', async () => {
  const provider: UmbraDesktopSearchProviderApi = { search: async () => ({ error: new Error('403') }) };
  const src = umbracoSearchSource({ alias: 'x', meta: { label: 'X', searchProviderAlias: 'p' } }, provider, () => undefined);
  let threw = false;
  await src.search('a', { skip: 0, take: 1 }).catch(() => (threw = true));
  expect(threw).to.equal(true);
});
