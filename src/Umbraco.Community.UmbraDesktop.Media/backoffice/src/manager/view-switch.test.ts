import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_VIEW_MEMORY, layoutsLeading, memoryOf, viewMemory } from './view-switch.js';

/**
 * Core switches a collection's view through the backoffice address, which every hosted collection
 * follows, so one window switching to table would switch them all (hosting spike, workaround 2).
 * The manager sets each window's view on its own collection instead: through the collection's own
 * interaction memory where core has one (17.7 onwards), and by putting the view first in the
 * collection's layouts where it has not, since core shows the first layout when the address names
 * none.
 */
describe('switching one window’s view', () => {
  it('remembers a view under the key core’s view manager reads', () => {
    expect(UMBRADESKTOP_VIEW_MEMORY).to.equal('UmbCollectionCurrentView');
    expect(viewMemory('Umb.CollectionView.Media.Table')).to.deep.equal({
      unique: 'UmbCollectionCurrentView',
      value: { alias: 'Umb.CollectionView.Media.Table' },
    });
  });

  it('finds the memory on a collection context that has one, and nothing on one that has not', () => {
    const memory = { setMemory: () => undefined };
    expect(memoryOf({ interactionMemory: memory })).to.equal(memory);
    expect(memoryOf({})).to.equal(undefined);
    expect(memoryOf({ interactionMemory: {} })).to.equal(undefined);
    expect(memoryOf(undefined)).to.equal(undefined);
  });

  it('puts the chosen view first and keeps the others in order', () => {
    const views = [{ alias: 'grid' }, { alias: 'table' }, { alias: 'third-party' }];
    expect(layoutsLeading(views, undefined, 'table')).to.deep.equal([
      { collectionView: 'table' },
      { collectionView: 'grid' },
      { collectionView: 'third-party' },
    ]);
  });

  it('keeps a configured layout’s name and icon, and its restriction to the configured views', () => {
    const views = [{ alias: 'grid' }, { alias: 'table' }, { alias: 'third-party' }];
    const layouts = [
      { collectionView: 'grid', name: 'Grid', icon: 'icon-grid' },
      { collectionView: 'table', name: 'List', icon: 'icon-list' },
    ];
    expect(layoutsLeading(views, layouts, 'table')).to.deep.equal([
      { collectionView: 'table', name: 'List', icon: 'icon-list' },
      { collectionView: 'grid', name: 'Grid', icon: 'icon-grid' },
    ]);
  });

  it('leaves the layouts alone for a view that is not on offer', () => {
    const layouts = [{ collectionView: 'grid' }];
    expect(layoutsLeading([{ alias: 'grid' }], layouts, 'gone')).to.deep.equal(layouts);
  });
});
