import { expect } from '@open-wc/testing';
import { fetchFile, openedFrom } from './media-open.js';
import type { OpenableDetail } from './media-open.js';

/**
 * What an open hands an app, mapped from the media item the backoffice returned. Beyond the file
 * itself, an editor needs where the item lives (the file menu's Info, and a copy saved next to it)
 * and the focal point it has now (drawn in the Image Editor's Crop mode). Issue #136.
 */

/** A media item's detail, as far as an open reads it. */
const detail = (value: unknown, updateDate: string | null = '2026-10-17T10:00:00Z'): OpenableDetail => ({
  unique: 'k1',
  variants: [{ name: 'Beach', updateDate }],
  values: [
    { alias: 'altText', value: 'x' },
    { alias: 'umbracoFile', value },
  ],
});

const blob = new Blob(['x'], { type: 'image/jpeg' });

it('maps the name, the extension, the update date, the focal point and the folder', () => {
  const opened = openedFrom(
    detail({ src: '/media/abc/beach.JPG', focalPoint: { left: 0.3, top: 0.6 } }),
    blob,
    { unique: 'f1', name: 'Holidays' },
  );
  expect(opened).to.deep.equal({
    unique: 'k1',
    name: 'Beach',
    blob,
    extension: 'jpg',
    updateDate: '2026-10-17T10:00:00Z',
    focalPoint: { left: 0.3, top: 0.6 },
    fileName: 'beach.JPG',
    folder: 'f1',
    folderName: 'Holidays',
    isTrashed: false,
  });
});

/**
 * Whether the item is in the recycle bin (#137): an app opening an item by key, as the Image Editor
 * does from Edit image or a reopened window, can refuse one somebody binned since, without asking for
 * the item again.
 */
it('says whether the item is in the recycle bin', () => {
  expect(openedFrom({ ...detail({ src: '/a.png' }), isTrashed: true }, blob, { unique: null })?.isTrashed).to.equal(true);
  expect(openedFrom(detail({ src: '/a.png' }), blob, { unique: null })?.isTrashed).to.equal(false);
});

it('answers a null focal point for an item without one, and a null folder at the root', () => {
  const opened = openedFrom(detail({ src: '/media/abc/beach.png' }), blob, { unique: null });
  expect(opened?.focalPoint).to.equal(null);
  expect(opened?.folder).to.equal(null);
  expect(opened?.folderName).to.equal(undefined);
});

it('ignores a focal point that is not two numbers', () => {
  const opened = openedFrom(detail({ src: '/a.png', focalPoint: { left: 'x' } }), blob, { unique: null });
  expect(opened?.focalPoint).to.equal(null);
});

it('answers null for an item with no file', () => {
  expect(openedFrom(detail({}), blob, { unique: null })).to.equal(null);
  expect(openedFrom(detail(null), blob, { unique: null })).to.equal(null);
});

it("names the file as the media library stores it", () => {
  const opened = openedFrom(detail({ src: '/media/abc/16403439029_f500be349b_o.jpg' }), blob, { unique: null });
  expect(opened?.fileName).to.equal('16403439029_f500be349b_o.jpg');
});

/**
 * A save over an item under the same file name keeps its address, so the browser's cache still holds
 * the file as it was. Found in a real backoffice: a picture saved turned reopened upright from the
 * cache. The file menu renames a changed file since #137; other ways of saving over an item do not.
 */
it('reads the file past the browser cache, which still holds it as it was before the last save', async () => {
  const original = window.fetch;
  const seen: RequestInit[] = [];
  window.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    seen.push(init ?? {});
    return new Response(new Blob(['x']));
  }) as typeof fetch;
  try {
    const blob = await fetchFile('/media/a/beach.jpg');
    expect(blob?.size).to.equal(1);
  } finally {
    window.fetch = original;
  }
  expect(seen[0].cache).to.equal('no-cache');
  expect(seen[0].credentials).to.equal('same-origin');
});
