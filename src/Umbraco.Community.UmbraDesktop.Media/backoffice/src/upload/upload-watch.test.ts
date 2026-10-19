import { expect } from '@open-wc/testing';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import { watchUploads, uploadBatch } from './upload-watch.js';
import type { UmbraDesktopUploadBatch, UmbraDesktopUploadItem } from './upload-watch.js';

/** Uploads in a manager window, for the Transfers window (plan task 7.3). */

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * An upload item as core's manager lists it.
 * @param unique Its key.
 * @param status Its status.
 * @param progress Its percent.
 * @returns The item.
 */
const item = (unique: string, status: string, progress = 0): UmbraDesktopUploadItem => ({
  unique,
  parentUnique: 'people',
  status,
  progress,
  temporaryFile: { file: new File(['12345'], `${unique}.jpg`) },
});

/**
 * A manager window with core's dropzone in a shadow root inside it, announcing itself as core's does,
 * by asking for a context.
 * @returns The window, the dropzone's list, and what was removed through its manager.
 */
function windowWithDropzone() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const list = new UmbArrayState<UmbraDesktopUploadItem>([], (each) => each.unique);
  const removed: string[] = [];
  const dropzone = Object.assign(document.createElement('div'), {
    progressItems: () => list.asObservable(),
    _manager: { remove: (items: UmbraDesktopUploadItem[]) => removed.push(...items.map((each) => each.unique)) },
  });
  root.attachShadow({ mode: 'open' }).appendChild(dropzone);
  cleanup.push(() => root.remove());
  const announce = () => dropzone.dispatchEvent(new CustomEvent('umb:context-request', { bubbles: true, composed: true }));
  return { root, list, removed, announce };
}

describe('uploads in a manager window', () => {
  it('finds core\'s dropzone by its context request and reports each batch once, from where the list was idle', async () => {
    const { root, list, announce } = windowWithDropzone();
    const batches: UmbraDesktopUploadBatch[] = [];
    cleanup.push(watchUploads(root, (batch) => batches.push(batch)));
    announce();
    list.setValue([item('old', 'complete', 100)]);
    list.setValue([item('old', 'complete', 100), item('a', 'waiting')]);
    expect(batches.length).to.equal(1);
    expect(batches[0].items().map((each) => each.unique)).to.deep.equal(['a']);
    expect(batches[0].parent).to.equal('people');
    list.setValue([item('old', 'complete', 100), item('a', 'complete', 100)]);
    await batches[0].done;
    list.setValue([item('old', 'complete', 100), item('a', 'complete', 100), item('b', 'waiting')]);
    expect(batches.length).to.equal(2);
    expect(batches[1].items().map((each) => each.unique)).to.deep.equal(['b']);
  });

  it('cancels what has not gone up, through core\'s own manager, and keeps what has', () => {
    const { root, list, removed, announce } = windowWithDropzone();
    const batches: UmbraDesktopUploadBatch[] = [];
    cleanup.push(watchUploads(root, (batch) => batches.push(batch)));
    announce();
    list.setValue([item('a', 'complete', 100), item('b', 'waiting', 40), item('c', 'waiting')]);
    batches[0].cancel();
    expect(removed).to.deep.equal(['b', 'c']);
  });

  it('follows an upload of its own manager in the same shape', async () => {
    const list = new UmbArrayState<UmbraDesktopUploadItem>([], (each) => each.unique);
    const removed: string[] = [];
    const batch = uploadBatch({ progressItems: list.asObservable(), remove: (items) => removed.push(...items.map((each) => each.unique)) }, 'design');
    list.setValue([item('x', 'waiting', 50)]);
    expect(batch.items().map((each) => each.progress)).to.deep.equal([50]);
    expect(batch.parent).to.equal('design');
    list.setValue([item('x', 'complete', 100)]);
    await batch.done;
  });
});
