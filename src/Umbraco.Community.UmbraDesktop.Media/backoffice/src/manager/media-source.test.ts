import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_DEFAULT_MEDIA_LIST_VIEW, collectionConfigFrom, isFolder, isPlace, itemName } from './media-source.js';

describe('a folder or an item', () => {
  /** Design decision 6: a folder is a media item whose type has a collection. */
  it('is a folder when its media type has a collection', () => {
    expect(isFolder({ mediaType: { collection: { unique: 'list-view' } } })).to.equal(true);
    expect(isFolder({ mediaType: { collection: null } })).to.equal(false);
    expect(isFolder(undefined)).to.equal(false);
  });

  /**
   * #158: a place is decided by what an item can do, never by its type's name: a collection, a type
   * with insert options (empty or not), or items under it already, as when a type's insert options
   * were taken away later. Out of the box only Folder is one.
   */
  it('is a place when it is a folder, its type may hold items, or it holds some', () => {
    const plain = { hasChildren: false, mediaType: { collection: null } };
    expect(isPlace({ hasChildren: false, mediaType: { collection: { unique: 'list-view' } } }, false)).to.equal(true);
    expect(isPlace(plain, true)).to.equal(true);
    expect(isPlace({ ...plain, hasChildren: true }, false)).to.equal(true);
    expect(isPlace(plain, false)).to.equal(false);
    expect(isPlace(plain, undefined), 'insert options not read yet').to.equal(false);
    expect(isPlace(undefined, true)).to.equal(false);
  });

  it('is named by its first variant, then its own name', () => {
    expect(itemName({ name: 'Own', variants: [{ name: 'Variant', culture: null }] })).to.equal('Variant');
    expect(itemName({ name: 'Own', variants: [] })).to.equal('Own');
  });
});

/**
 * The collection's configuration, read from a list view data type the way core's media dashboard
 * reads it (`media-dashboard.element.js`), so a window shows the columns, order and page size the
 * Media section does.
 */
describe('a collection configuration from a list view', () => {
  it('uses the same default list view as core', () => {
    expect(UMBRADESKTOP_DEFAULT_MEDIA_LIST_VIEW).to.equal('3a0156c4-3b8c-4803-bdc1-6871faa83fff');
  });

  it('copies the layouts, order, page size and columns', () => {
    const layouts = [{ collectionView: 'Umb.CollectionView.Media.Grid' }];
    const columns = [{ alias: 'updateDate', header: 'Last edited', isSystem: 1 }];
    expect(
      collectionConfigFrom('folder-key', [
        { alias: 'layouts', value: layouts },
        { alias: 'orderBy', value: 'name' },
        { alias: 'orderDirection', value: 'desc' },
        { alias: 'pageSize', value: '25' },
        { alias: 'includeProperties', value: columns },
      ]),
    ).to.deep.equal({
      unique: 'folder-key',
      dataTypeId: '',
      layouts,
      orderBy: 'name',
      orderDirection: 'desc',
      pageSize: 25,
      userDefinedProperties: columns,
    });
  });

  it('falls back to core’s defaults for what the list view leaves out', () => {
    expect(collectionConfigFrom(null, [{ alias: 'pageSize', value: 'many' }])).to.deep.equal({
      unique: '',
      dataTypeId: '',
      layouts: undefined,
      orderBy: 'updateDate',
      orderDirection: 'asc',
      pageSize: 50,
      userDefinedProperties: undefined,
    });
  });
});
