import type { HealthFolder, HealthItem, HealthOrphan } from './health.client.js';
import { resultOf } from './media-health.context.js';
import type { UmbraDesktopMediaHealthCleanupState, UmbraDesktopMediaHealthResult } from './media-health.context.js';

/*
 * A small checked library for the Media Health screens' tests: one oversized image in use, two
 * unused items (one of them an Engage-style item with no file), a used file and two orphaned files,
 * in two top-level folders and the root.
 */

/** A megabyte, as the model counts it. */
export const MB = 1024 * 1024;

/**
 * An item as the server lists it.
 * @param over What differs from a small used JPEG in Products.
 * @returns The item.
 */
export const item = (over: Partial<HealthItem> = {}): HealthItem => ({
  key: 'a',
  name: 'Banjo',
  mediaTypeAlias: 'Image',
  extension: 'jpg',
  sizeBytes: 100,
  parentKey: 'f',
  path: '/Products',
  usageCount: 1,
  used: true,
  url: '/media/a/banjo.jpg',
  width: null,
  height: null,
  updatedUtc: '2026-01-01T00:00:00Z',
  ...over,
});

/**
 * An orphaned file.
 * @param relativePath Its path under the media folder.
 * @param sizeBytes Its size.
 * @returns The file.
 */
export const orphan = (relativePath: string, sizeBytes = 10): HealthOrphan => ({
  relativePath,
  url: `/media/${relativePath}`,
  sizeBytes,
  lastModifiedUtc: '2026-01-01T00:00:00Z',
});

/** The folders of the library. */
export const FOLDERS: HealthFolder[] = [
  { key: 'f', name: 'Products', parentKey: null, path: '/Products' },
  { key: 'p', name: 'People', parentKey: null, path: '/People' },
];

/**
 * The checked library as the context holds it.
 * @returns The result.
 */
export function result(): UmbraDesktopMediaHealthResult {
  const items = [
    item({ key: 'big', name: 'Hero', sizeBytes: 3 * MB }),
    item({ key: 'old', name: 'Old banner', used: false, usageCount: 0, sizeBytes: 500, url: '/media/o/old.jpg' }),
    item({ key: 'persona', name: 'Persona', used: false, usageCount: 0, sizeBytes: null, extension: null, url: null, parentKey: 'p', path: '/People' }),
    item({ key: 'notes', name: 'Notes', sizeBytes: 900, extension: 'pdf', mediaTypeAlias: 'File', url: '/media/n/notes.pdf', parentKey: null, path: '/' }),
  ];
  return resultOf(1, new Date(), items, [orphan('1/x.jpg', 30), orphan('2/y.png', 10)], FOLDERS);
}

/**
 * A Clean up as the context holds it.
 * @param over What differs from one that is done and freed 540 bytes.
 * @returns The state.
 */
export function cleanupState(over: Partial<UmbraDesktopMediaHealthCleanupState> = {}): UmbraDesktopMediaHealthCleanupState {
  return {
    phase: 'done',
    done: 3,
    total: 3,
    freedBytes: 540,
    beforeBytes: 3 * MB + 1440,
    afterBytes: 3 * MB + 900,
    trashed: [{ unique: 'old', name: 'Old banner', parent: 'f', mediaType: 't', isFolder: false }],
    deleted: 2,
    skipped: [],
    failed: [],
    optimizing: undefined,
    ...over,
  };
}

/**
 * Wait for a click on a UUI control to land: `uui-button` and `uui-checkbox` click their inner
 * control only after their own update, so a click is asynchronous.
 * @returns When it has.
 */
export const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

/** What a screen may never name: keys, since nothing in Media Health relies on one (design §16.5). */
export const KEY_NAMES = /\b(Space|Enter|Esc|Ctrl)\b|⌘/;

/**
 * The text a screen renders, through its shadow roots, with the white space folded.
 * @param root The screen.
 * @returns Its text.
 */
export function textOf(root: Element): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent ?? '');
    const shadow = (node as Element).shadowRoot;
    if (shadow) shadow.childNodes.forEach(walk);
    node.childNodes.forEach(walk);
  };
  walk(root);
  return parts.join(' ').replace(/\s+/g, ' ');
}

/**
 * Let the browser's "ResizeObserver loop" notice pass in a test page, and nothing else. UUI 2.0.2's
 * tab group measures its tabs inside its own resize observer and sets their display there, so on its
 * first layout in some boxes the browser defers a notification and reports this as an error, which
 * the test runner counts as a failure (design §16.16). Step 2's grid had the same tab group and never
 * hit it; bisecting found nothing of the list's own that causes it, down to a list with no table. It is not an error in the page: the browser
 * delivers the notification on the next frame, and nothing in Media Cleanup observes the tab group.
 */
export function allowResizeObserverLoop(): void {
  // In a hook, since mocha sets its own `onerror` only once the run starts.
  before(() => {
    const previous = window.onerror;
    window.onerror = (message, ...rest) => (/ResizeObserver loop/.test(String(message)) ? true : (previous?.call(window, message, ...rest) ?? false));
  });
}
