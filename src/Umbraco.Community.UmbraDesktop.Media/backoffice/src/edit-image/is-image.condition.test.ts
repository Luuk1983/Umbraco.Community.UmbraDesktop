import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbEntityContext } from '@umbraco-cms/backoffice/entity';
import { UmbEntityContentTypeEntityContext } from '@umbraco-cms/backoffice/content-type';
import { UmbraDesktopIsImageCondition } from './is-image.condition.js';
import { clearImageTypeCache, isImageMediaTypeCached } from './image-type.js';
import type { ImageLookups } from './image-type.js';

/** Media types as the server describes them: which data type each one's `umbracoFile` uses. */
const TYPES: Record<string, Array<{ alias: string; dataType: { unique: string } }>> = {
  image: [{ alias: 'umbracoFile', dataType: { unique: 'cropper' } }, { alias: 'umbracoWidth', dataType: { unique: 'label' } }],
  file: [{ alias: 'umbracoFile', dataType: { unique: 'upload' } }],
  svg: [{ alias: 'umbracoFile', dataType: { unique: 'upload-svg' } }],
  folder: [],
  photo: [{ alias: 'umbracoFile', dataType: { unique: 'own-cropper' } }],
};

/** Data types by key, with the property editor each one uses. */
const DATA_TYPES: Record<string, string> = {
  cropper: 'Umbraco.ImageCropper',
  'own-cropper': 'Umbraco.ImageCropper',
  upload: 'Umbraco.UploadField',
  'upload-svg': 'Umbraco.UploadField',
  label: 'Umbraco.Label',
};

/** Media items by key, with their media type: what the item repository answers. */
const ITEMS: Record<string, string> = { beach: 'image', report: 'file', holidays: 'folder' };

/** How many times each lookup was asked, so a test can say which way the answer came. */
let asked = { items: 0, types: [] as string[] };

/** Lookups over the tables above, standing in for core's repositories. */
const LOOKUPS: ImageLookups = {
  mediaType: async (unique) => {
    asked.types.push(unique);
    return TYPES[unique] ? { properties: TYPES[unique] } : undefined;
  },
  dataType: async (unique) => (DATA_TYPES[unique] ? { editorAlias: DATA_TYPES[unique] } : undefined),
  itemMediaType: async (unique) => {
    asked.items++;
    return ITEMS[unique];
  },
};

let cleanup: Array<() => void> = [];
const realLookups = UmbraDesktopIsImageCondition.lookupsFor;
beforeEach(() => {
  asked = { items: 0, types: [] };
  clearImageTypeCache();
  UmbraDesktopIsImageCondition.lookupsFor = () => LOOKUPS;
});
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
  UmbraDesktopIsImageCondition.lookupsFor = realLookups;
});

/**
 * A controller host on a new element under a parent, connected.
 * @param parent Where the element goes.
 * @returns The element and its host.
 */
function hostUnder(parent: HTMLElement): { element: HTMLElement; host: UmbElementControllerHost } {
  const element = document.createElement('div');
  parent.appendChild(element);
  const host = new UmbElementControllerHost(element);
  cleanup.push(() => host.destroy());
  return { element, host };
}

/**
 * An entity context, as core gives every tree item, card, table row and workspace.
 * @param host Where it is provided.
 * @param unique The item.
 */
function entity(host: UmbElementControllerHost, unique: string): void {
  const context = new UmbEntityContext(host);
  context.setEntityType('media');
  context.setUnique(unique);
}

/**
 * A content-type context, as core gives a tree item, a grid card and a workspace, and not a table row.
 * @param host Where it is provided.
 * @param mediaType The item's media type.
 */
function contentType(host: UmbElementControllerHost, mediaType: string): void {
  const context = new UmbEntityContentTypeEntityContext(host);
  context.setEntityType('media-type');
  context.setUnique(mediaType);
}

/**
 * Evaluate the condition on an element, as core evaluates an action's conditions on the element that
 * shows it.
 * @param element Where the action is.
 * @returns Whether the action is permitted, once the answer has settled.
 */
async function evaluate(element: HTMLElement): Promise<boolean> {
  const { host } = hostUnder(element);
  let permitted = false;
  const condition = new UmbraDesktopIsImageCondition(host, {
    host,
    config: { alias: 'Umbraco.Community.UmbraDesktop.Media.Condition.IsImage' },
    onChange: (value) => (permitted = value),
  });
  host.hostConnected();
  for (let tick = 0; tick < 10; tick++) await new Promise((resolve) => setTimeout(resolve, 5));
  return permitted && condition.permitted;
}

/**
 * A grid card: the media type on the card, the item on the actions bundle inside it.
 * @param mediaType The item's media type.
 * @param unique The item.
 * @returns Where the action is.
 */
function card(mediaType: string, unique = 'beach'): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  cleanup.push(() => root.remove());
  const cardHost = hostUnder(root);
  contentType(cardHost.host, mediaType);
  cardHost.host.hostConnected();
  const bundle = hostUnder(cardHost.element);
  entity(bundle.host, unique);
  bundle.host.hostConnected();
  return bundle.element;
}

/**
 * Edit image is for images only (design §3, condition 4): a media type whose `umbracoFile` uses the
 * Image Cropper, which is how Umbraco itself tells an image type from a file type.
 */
describe('the is-image condition', () => {
  it('permits an item of the Image type', async () => {
    expect(await evaluate(card('image'))).to.equal(true);
  });

  it("permits a site's own image type, which copies the Image type's cropper", async () => {
    expect(await evaluate(card('photo'))).to.equal(true);
  });

  /** Each refusal is a decision reached by reading the type, not the condition's default of false. */
  it('refuses a file, an SVG and a folder', async () => {
    expect(await evaluate(card('file')), 'file').to.equal(false);
    expect(await evaluate(card('svg')), 'svg').to.equal(false);
    expect(await evaluate(card('folder')), 'folder').to.equal(false);
    expect(asked.types, 'each type was read').to.deep.equal(['file', 'svg', 'folder']);
  });

  it('reads the media type from the item context, without asking for the item', async () => {
    await evaluate(card('image'));
    expect(asked.items).to.equal(0);
  });

  /** A tree item and a workspace provide both contexts from one place, for one item. */
  it('reads the media type where both contexts are provided together', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    cleanup.push(() => root.remove());
    const item = hostUnder(root);
    entity(item.host, 'beach');
    contentType(item.host, 'image');
    item.host.hostConnected();
    expect(await evaluate(item.element)).to.equal(true);
    expect(asked.items).to.equal(0);
  });

  /** Core's table view gives a row an entity context and no content-type context (design §3). */
  it('asks for the item when there is no content-type context, as in a table row', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    cleanup.push(() => root.remove());
    const row = hostUnder(root);
    entity(row.host, 'beach');
    row.host.hostConnected();
    expect(await evaluate(row.element)).to.equal(true);
    expect(asked.items).to.equal(1);
  });

  /**
   * A table inside a folder's workspace: the nearest content-type context is the folder's, provided
   * with the folder's own entity context, so it is not the row's and must not answer for it.
   */
  it("does not take the folder's media type for a table row inside it", async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    cleanup.push(() => root.remove());
    const workspace = hostUnder(root);
    entity(workspace.host, 'holidays');
    contentType(workspace.host, 'folder');
    workspace.host.hostConnected();
    const row = hostUnder(workspace.element);
    entity(row.host, 'beach');
    row.host.hostConnected();
    expect(await evaluate(row.element)).to.equal(true);
    expect(asked.items).to.equal(1);
  });

  it('refuses when nothing says what the item is', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    cleanup.push(() => root.remove());
    expect(await evaluate(root)).to.equal(false);
  });
});

/**
 * One lookup per media type, not per card (found by the reviewer of #137): core keeps what its
 * repositories read only while the server-event connection is up, so without it a grid of a hundred
 * photos would read the Image type a hundred times.
 */
describe('the image type cache', () => {
  it('reads a media type once, however many items ask', async () => {
    const answers = await Promise.all([
      isImageMediaTypeCached(LOOKUPS, 'image'),
      isImageMediaTypeCached(LOOKUPS, 'image'),
      isImageMediaTypeCached(LOOKUPS, 'file'),
    ]);
    expect(answers).to.deep.equal([true, true, false]);
    expect(await isImageMediaTypeCached(LOOKUPS, 'image')).to.equal(true);
    expect(asked.types).to.deep.equal(['image', 'file']);
  });

  it('does not keep an answer it could not read, so the next item asks again', async () => {
    expect(await isImageMediaTypeCached(LOOKUPS, 'missing')).to.equal(false);
    await isImageMediaTypeCached(LOOKUPS, 'missing');
    expect(asked.types).to.deep.equal(['missing', 'missing']);
  });
});

/**
 * Core may create a condition before the element showing the action is in the page, so the decision
 * is made again when it is (found by the reviewer of #137).
 */
it('decides again when its host connects', async () => {
  const root = document.createElement('div');
  cleanup.push(() => root.remove());
  const cardHost = hostUnder(root);
  contentType(cardHost.host, 'image');
  const bundle = hostUnder(cardHost.element);
  entity(bundle.host, 'beach');
  const { host } = hostUnder(bundle.element);
  let permitted = false;
  new UmbraDesktopIsImageCondition(host, {
    host,
    config: { alias: 'Umbraco.Community.UmbraDesktop.Media.Condition.IsImage' },
    onChange: (value) => (permitted = value),
  });
  expect(permitted, 'not in the page yet').to.equal(false);
  document.body.appendChild(root);
  cardHost.host.hostConnected();
  bundle.host.hostConnected();
  host.hostConnected();
  for (let tick = 0; tick < 10; tick++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(permitted).to.equal(true);
});
