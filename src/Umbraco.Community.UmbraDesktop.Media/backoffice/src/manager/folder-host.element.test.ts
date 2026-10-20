import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextConsumer } from '@umbraco-cms/backoffice/context-api';
import { of } from '@umbraco-cms/backoffice/external/rxjs';
import { UMB_ENTITY_CONTEXT } from '@umbraco-cms/backoffice/entity';
import './folder-host.element.js';
import type { UmbraDesktopMediaFolderHostElement } from './folder-host.element.js';
import type { UmbraDesktopMediaItem, UmbraDesktopMediaSource } from './media-source.js';
import type { UmbraDesktopMediaPlace } from './location.js';

const FOLDER = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const FOLDER_TYPE = 'f38bd2d7-65d0-48e6-95dc-87ce06ec2d3d';
const OWN_LIST = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** A source that answers from memory and records what it was asked. */
function source(): UmbraDesktopMediaSource & { listViews: Array<string> } {
  const item: UmbraDesktopMediaItem = {
    unique: FOLDER,
    name: 'People',
    variants: [{ name: 'People', culture: null }],
    mediaType: { unique: FOLDER_TYPE, icon: 'icon-folder', collection: { unique: OWN_LIST } },
    parent: null,
  };
  const listViews: string[] = [];
  return {
    listViews,
    item: async (unique) => (unique === FOLDER ? item : undefined),
    rename: async () => false,
    collectionConfig: async (unique, listView) => {
      listViews.push(listView);
      return { unique: unique ?? '', pageSize: 50 };
    },
  };
}

/**
 * A folder host, mounted at a place, waited on until it has built its collection.
 * @param place Where it is.
 * @param view The view it should open on.
 * @returns The host, the source and the names it announced.
 */
async function mounted(place: UmbraDesktopMediaPlace, view?: string) {
  const media = source();
  const names: string[] = [];
  const host = await fixture<UmbraDesktopMediaFolderHostElement>(
    html`<umbradesktop-media-folder-host
      .source=${media}
      .place=${place}
      .view=${view}
      @umbradesktop-media-folder-loaded=${(e: CustomEvent<{ name: string }>) => names.push(e.detail.name)}></umbradesktop-media-folder-host>`,
  );
  for (let tries = 0; tries < 40 && !host.shadowRoot!.querySelector('umbradesktop-media-hosted-collection'); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return { host, media, names };
}

/** The hosted collection element. */
const collectionOf = (host: HTMLElement) =>
  host.shadowRoot!.querySelector('umbradesktop-media-hosted-collection') as HTMLElement & {
    alias?: string;
    config?: { unique?: string; layouts?: unknown };
    interactionMemories?: unknown;
  };

/**
 * A context as seen from inside the hosted collection, where core's elements ask for it.
 * @param host The folder host.
 * @param alias The context alias.
 * @returns The instance, or undefined.
 */
async function contextInside(host: HTMLElement, alias: string | typeof UMB_ENTITY_CONTEXT) {
  const consumer = new UmbContextConsumer(collectionOf(host), alias as string);
  consumer.hostConnected();
  return consumer.asPromise({ preventTimeout: false }).catch(() => undefined);
}

describe('hosting core’s media collection for one place', () => {
  /**
   * Core lays some of its collection's layers out absolutely, its empty-folder upload box and its file
   * drag overlay, against whatever is positioned above them. In the Media section that is the folder's
   * workspace; in a window it was the whole window, so the box covered the tree and its rows could not
   * be clicked (owner's test, 2026-10-20). The folder area is what they lay out against.
   */
  it('keeps core’s absolutely placed layers inside the folder area, off the tree beside it', async () => {
    const window = document.createElement('div');
    window.style.cssText = 'position:relative;display:grid;grid-template-columns:200px 400px;height:300px';
    document.body.appendChild(window);
    try {
      const { host } = await mounted({ kind: 'root' });
      window.appendChild(host);
      const layer = document.createElement('div');
      layer.style.cssText = 'position:absolute;inset:10px 24px';
      host.shadowRoot!.appendChild(layer);
      const area = host.getBoundingClientRect();
      const placed = layer.getBoundingClientRect();
      expect(placed.left - area.left).to.equal(24);
      expect(placed.right).to.be.at.most(area.right);
    } finally {
      window.remove();
    }
  });

  it('hosts core’s media collection for a folder, configured from the folder’s own list view', async () => {
    const { host, media } = await mounted({ kind: 'folder', unique: FOLDER });
    const collection = collectionOf(host);
    expect(collection.alias).to.equal('Umb.Collection.Media');
    expect(collection.config?.unique).to.equal(FOLDER);
    expect(media.listViews).to.deep.equal([OWN_LIST]);
  });

  it('hosts the Media root from core’s default list view', async () => {
    const { host, media } = await mounted({ kind: 'root' });
    expect(collectionOf(host).config?.unique).to.equal('');
    expect(media.listViews).to.deep.equal(['3a0156c4-3b8c-4803-bdc1-6871faa83fff']);
  });

  it('hosts core’s recycle bin collection for the bin', async () => {
    const { host } = await mounted({ kind: 'bin' });
    expect(collectionOf(host).alias).to.equal('Umb.Collection.Media.RecycleBin.TreeItemChildren');
  });

  it('tells core’s actions which entity the window shows', async () => {
    const folder = await mounted({ kind: 'folder', unique: FOLDER });
    const entity = (await contextInside(folder.host, UMB_ENTITY_CONTEXT)) as unknown as { getEntityType(): string; getUnique(): string | null };
    expect([entity.getEntityType(), entity.getUnique()]).to.deep.equal(['media', FOLDER]);
    const root = await mounted({ kind: 'root' });
    const rootEntity = (await contextInside(root.host, UMB_ENTITY_CONTEXT)) as unknown as { getEntityType(): string; getUnique(): string | null };
    expect([rootEntity.getEntityType(), rootEntity.getUnique()]).to.deep.equal(['media-root', null]);
  });

  /** Hosting spike, workaround 1: Create and the dropzone read their parent from this context. */
  it('stands in for the media workspace in a folder, so Create and uploads land there', async () => {
    const { host } = await mounted({ kind: 'folder', unique: FOLDER });
    const workspace = (await contextInside(host, 'UmbWorkspaceContext')) as {
      getEntityType(): string;
      getUnique(): string | null;
      getContentTypeUnique(): string | undefined;
      getHostElement(): Element;
    };
    expect(workspace.getEntityType()).to.equal('media');
    expect(workspace.getUnique()).to.equal(FOLDER);
    expect(workspace.getContentTypeUnique()).to.equal(FOLDER_TYPE);
    expect(workspace.getHostElement()).to.equal(host);
  });

  it('announces the folder’s name, and core’s own words for the root and the bin', async () => {
    expect((await mounted({ kind: 'folder', unique: FOLDER })).names).to.deep.equal(['People']);
    expect((await mounted({ kind: 'root' })).names).to.deep.equal(['#sections_media']);
    expect((await mounted({ kind: 'bin' })).names).to.deep.equal(['#general_recycleBin']);
  });

  it('builds a new collection when the place changes', async () => {
    const { host } = await mounted({ kind: 'root' });
    const before = collectionOf(host);
    host.place = { kind: 'folder', unique: FOLDER };
    for (let tries = 0; tries < 40 && collectionOf(host) === before; tries++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(collectionOf(host) !== before, 'a new collection').to.equal(true);
    expect(collectionOf(host).config?.unique).to.equal(FOLDER);
  });

  it('opens on a remembered view through core’s interaction memory', async () => {
    const { host } = await mounted({ kind: 'root' }, 'Umb.CollectionView.Media.Table');
    expect(collectionOf(host).interactionMemories).to.deep.equal([
      { unique: 'UmbCollectionCurrentView', value: { alias: 'Umb.CollectionView.Media.Table' } },
    ]);
  });
});

/**
 * Core applies a changed view only when the address changes: its router slot ignores new routes whose
 * paths match the old ones, so setting the memory alone leaves the old view on screen (measured on
 * 17.7). A window switches by building its collection again, opening on the view.
 */
describe('switching the view of one window', () => {
  /** A collection context as far as a switch reads it. */
  const context = (selection: string[], memory = true) => ({
    ...(memory ? { interactionMemory: { setMemory: () => undefined } } : {}),
    view: { views: of([{ alias: 'Umb.CollectionView.Media.Grid' }, { alias: 'Umb.CollectionView.Media.Table' }]) },
    selection: { getSelection: () => selection, setSelection: (value: string[]) => selection.splice(0, selection.length, ...value) },
  });

  it('builds the collection again, remembering the view, where core has a memory', async () => {
    const { host } = await mounted({ kind: 'root' });
    host.collectionReady(context([]));
    const before = collectionOf(host);
    await host.setView('Umb.CollectionView.Media.Table');
    expect(collectionOf(host) !== before, 'a new collection').to.equal(true);
    expect(collectionOf(host).interactionMemories).to.deep.equal([
      { unique: 'UmbCollectionCurrentView', value: { alias: 'Umb.CollectionView.Media.Table' } },
    ]);
    expect(collectionOf(host).config?.layouts, 'the switcher keeps core’s order').to.equal(undefined);
    expect(host.view).to.equal('Umb.CollectionView.Media.Table');
  });

  it('keeps the selection across the switch', async () => {
    const { host } = await mounted({ kind: 'root' });
    host.collectionReady(context(['a', 'b']));
    await host.setView('Umb.CollectionView.Media.Table');
    const after: string[] = [];
    host.collectionReady(context(after));
    expect(after).to.deep.equal(['a', 'b']);
  });

  it('rebuilds with the view first when the collection has no memory', async () => {
    const { host } = await mounted({ kind: 'root' });
    host.collectionReady(context([], false));
    const before = collectionOf(host);
    await host.setView('Umb.CollectionView.Media.Table');
    for (let tries = 0; tries < 40 && collectionOf(host) === before; tries++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(collectionOf(host).config?.layouts).to.deep.equal([
      { collectionView: 'Umb.CollectionView.Media.Table' },
      { collectionView: 'Umb.CollectionView.Media.Grid' },
    ]);
  });
});

describe('reloading what a window shows', () => {
  it('asks core’s collection to load again', async () => {
    const { host } = await mounted({ kind: 'folder', unique: FOLDER });
    let loads = 0;
    host.collectionReady({ loadCollection: () => (loads += 1) });
    host.reload();
    expect(loads).to.equal(1);
  });

  it('does nothing before core has made its collection', async () => {
    const { host } = await mounted({ kind: 'folder', unique: FOLDER });
    host.collectionReady(undefined);
    host.reload();
  });
});

describe('core’s collection, as the window reads it', () => {
  it('gives the items in core’s order with their names, and core’s selection', async () => {
    const { host } = await mounted({ kind: 'folder', unique: FOLDER });
    const selected: string[][] = [];
    const selection = {
      getSelection: () => ['b'],
      setSelection: (keys: string[]) => selected.push(keys),
      select: () => undefined,
      deselect: () => undefined,
      clearSelection: () => undefined,
    };
    host.collectionReady({ items: of([{ unique: 'a', name: 'Banjo' }, { unique: 'b', name: 'Unicorn' }]), selection });
    const collection = host.collection()!;
    expect(collection.items()).to.deep.equal([
      { unique: 'a', name: 'Banjo' },
      { unique: 'b', name: 'Unicorn' },
    ]);
    expect(collection.selection.getSelection()).to.deep.equal(['b']);
    collection.selection.setSelection(['a']);
    expect(selected).to.deep.equal([['a']]);
  });

  it('gives nothing before core has made its collection', async () => {
    const { host } = await mounted({ kind: 'folder', unique: FOLDER });
    host.collectionReady(undefined);
    expect(host.collection()).to.equal(undefined);
  });
});
