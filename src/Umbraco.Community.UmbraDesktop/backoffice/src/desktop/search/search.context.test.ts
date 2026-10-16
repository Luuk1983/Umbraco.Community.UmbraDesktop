import { expect, fixture, html } from '@open-wc/testing';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopSearchContext } from './search.context';
import { UMBRADESKTOP_HELP_SEARCH_ALIAS } from './help-source';
import type { UmbraDesktopSearchSource } from './types';

/** A provider api that answers every search with one item. */
class FakeProvider {
  /** @param _host The host core passes. */
  constructor(_host: unknown) {}
  /** @returns One document. */
  async search() {
    return { data: { items: [{ unique: 'k', entityType: 'document', name: 'Found' }], total: 1 } };
  }
  /** Core calls this on every api. */
  destroy() {}
}

/** A bare host for the context. */
@customElement('umbradesktop-search-context-host')
class SearchContextHost extends UmbLitElement {}

it('turns each permitted global search into a source, Help last', async () => {
  umbExtensionsRegistry.register({ type: 'searchProvider', alias: 'Test.SearchProvider', name: 'Test', api: FakeProvider } as never);
  umbExtensionsRegistry.register({ type: 'globalSearch', alias: 'Test.GlobalSearch', name: 'Test', weight: 5, meta: { label: 'Things', searchProviderAlias: 'Test.SearchProvider' } } as never);
  try {
    const host = await fixture<SearchContextHost>(html`<umbradesktop-search-context-host></umbradesktop-search-context-host>`);
    const context = new UmbraDesktopSearchContext(host);
    let sources: ReadonlyArray<UmbraDesktopSearchSource> = [];
    context.sources.subscribe((s) => (sources = s));
    for (let i = 0; i < 100 && !sources.some((s) => s.alias === 'Test.GlobalSearch'); i++) await new Promise((r) => setTimeout(r, 10));
    const test = sources.find((s) => s.alias === 'Test.GlobalSearch');
    expect(!!test, 'the test source appeared').to.equal(true);
    expect(sources[sources.length - 1].alias).to.equal(UMBRADESKTOP_HELP_SEARCH_ALIAS);
    const page = await test!.search('f', { skip: 0, take: 5 });
    expect(page.items.map((i) => i.name)).to.deep.equal(['Found']);
  } finally {
    umbExtensionsRegistry.unregister('Test.GlobalSearch');
    umbExtensionsRegistry.unregister('Test.SearchProvider');
  }
});
