import { expect, fixture, html } from '@open-wc/testing';
import './file-menu.element.js';
import './open-view.element.js';
import type { UmbraDesktopMediaFileMenuElement } from './file-menu.element.js';
import type { UmbraDesktopMediaOpenViewElement } from './open-view.element.js';
import type { FileMenuDeps } from './deps.js';
import type { MediaOpenOptions, MediaOpenResult } from '../files/media-open.js';
import type { RecentMediaEntry } from '../recent/recent-media.js';
import en from '../localization/en.js';

/**
 * Open: the images recently opened or saved, one tap each, and the media picker under them for
 * everything else. The same content in two places, so every test runs in both: the file menu's Open
 * panel, and the open view an app puts on its empty canvas. Issue #136, design §5 and §14.
 */

/** Where Open is drawn. */
type Host = 'menu' | 'view';

const words = en.umbraDesktopServicesMedia;

/** A recent entry. */
const entry = (unique: string, extension = 'jpg'): RecentMediaEntry => ({
  unique,
  name: `Name ${unique}`,
  extension,
  folder: 'f1',
  folderName: 'Holidays',
  at: 1,
});

/** What the fakes answer and what they saw. */
interface Fakes {
  recent: RecentMediaEntry[];
  thumbs: Map<string, string> | 'reject';
  /** What the item check answers: each entry's state, or 'unknown' for a check that failed. */
  items: Map<string, { trashed: boolean }> | 'unknown';
  opened: MediaOpenResult;
  discard: boolean;
  seen: {
    accept?: readonly string[];
    opens: Array<MediaOpenOptions | undefined>;
    forgotten: string[];
    asked: number;
  };
}

/**
 * Open in one of its hosts, with fakes for everything outside it.
 * @param host The file menu's panel, or the open view.
 * @param overrides What the fakes answer.
 * @param dirty Whether the app holds unsaved work.
 * @returns The element and the fakes.
 */
async function openPage(host: Host, overrides: Partial<Fakes> = {}, dirty = false) {
  const fakes: Fakes = {
    recent: [entry('a'), entry('b'), entry('c', 'txt')],
    thumbs: new Map([
      ['a', '/thumb/a.jpg'],
      ['b', '/thumb/b.jpg'],
      ['c', '/thumb/c.jpg'],
    ]),
    opened: { status: 'opened', unique: 'a', name: 'Name a', blob: new Blob(['x']), extension: 'jpg' },
    items: new Map([
      ['a', { trashed: false }],
      ['b', { trashed: false }],
      ['c', { trashed: false }],
    ]),
    discard: true,
    seen: { opens: [], forgotten: [], asked: 0 },
    ...overrides,
  };
  const deps: FileMenuDeps = {
    context: {
      open: async (options) => {
        fakes.seen.opens.push(options);
        return fakes.opened;
      },
      recent: async (accept) => {
        fakes.seen.accept = accept;
        const wanted = accept?.map((a) => a.toLowerCase());
        return fakes.recent.filter((e) => !wanted || wanted.includes(e.extension));
      },
      forgetRecent: (unique) => void fakes.seen.forgotten.push(unique),
      save: async () => ({ ok: false }),
      pickSaveFolder: async () => ({ status: 'cancelled' }),
      confirmOverwrite: async () => false,
    },
    thumbnails: async () => {
      if (fakes.thumbs === 'reject') throw new Error('offline');
      return fakes.thumbs;
    },
    items: async () => (fakes.items === 'unknown' ? undefined : fakes.items),
    confirmDiscard: async () => {
      fakes.seen.asked++;
      return fakes.discard;
    },
  };
  const element: UmbraDesktopMediaFileMenuElement | UmbraDesktopMediaOpenViewElement =
    host === 'menu'
      ? await fixture<UmbraDesktopMediaFileMenuElement>(
          html`<umbradesktop-media-file-menu
            style="position: relative; width: 900px; height: 640px"
            .deps=${deps}
            .accept=${['jpg', 'png']}
            .dirty=${dirty}></umbradesktop-media-file-menu>`,
        )
      : await fixture<UmbraDesktopMediaOpenViewElement>(
          html`<umbradesktop-media-open-view
            style="display: block; width: 900px; height: 640px"
            .deps=${deps}
            .accept=${['jpg', 'png']}
            .dirty=${dirty}></umbradesktop-media-open-view>`,
        );
  if (host === 'menu') (element as UmbraDesktopMediaFileMenuElement).show('open');
  await settle(element);
  return { element, fakes };
}

/** Let the page load its list and render it. */
async function settle(element: HTMLElement & { updateComplete: Promise<boolean> }): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await element.updateComplete;
  }
}

const tiles = (element: HTMLElement) => [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>('button.tile')];
const byAction = (element: HTMLElement, action: string) =>
  element.shadowRoot!.querySelector(`button[data-action="${action}"]`) as HTMLButtonElement;

for (const host of ['menu', 'view'] as const) {
  describe(`Open, in the ${host === 'menu' ? "file menu's panel" : 'open view'}`, () => {
    it('lists the recent images the app opens, as tiles with a thumbnail, a name and a folder', async () => {
      const { element, fakes } = await openPage(host);
      expect(fakes.seen.accept).to.deep.equal(['jpg', 'png']);
      expect(tiles(element)).to.have.length(2);
      const first = tiles(element)[0];
      expect(first.querySelector('img')?.getAttribute('src')).to.equal('/thumb/a.jpg');
      expect(first.querySelector('.name')?.textContent?.trim()).to.equal('Name a');
      expect(first.querySelector('.where')?.textContent?.trim()).to.equal('Holidays');
    });

    it('leaves out and forgets an item the media library says is deleted or in the recycle bin', async () => {
      const { element, fakes } = await openPage(host, { items: new Map([['b', { trashed: false }], ['a', { trashed: true }]]) });
      expect(tiles(element).map((tile) => tile.dataset.unique)).to.deep.equal(['b']);
      expect(fakes.seen.forgotten.sort()).to.deep.equal(['a']);
    });

    it('keeps every entry when the media library cannot be asked, and forgets none', async () => {
      const { element, fakes } = await openPage(host, { items: 'unknown' });
      expect(tiles(element)).to.have.length(2);
      expect(fakes.seen.forgotten).to.deep.equal([]);
    });

    /** From the review: Umbraco's imaging endpoint answers nothing on a failure rather than throwing. */
    it('keeps an entry with no thumbnail, which is a picture missing and not the item', async () => {
      const { element, fakes } = await openPage(host, { thumbs: new Map() });
      expect(tiles(element)).to.have.length(2);
      expect(tiles(element)[0].querySelector('img')).to.equal(null);
      expect(fakes.seen.forgotten).to.deep.equal([]);
    });

    it('forgets an entry that fails to open, as one this person can no longer reach', async () => {
      const { element, fakes } = await openPage(host, { opened: { status: 'failed', name: 'Name a' } });
      tiles(element)[0].click();
      await settle(element);
      expect(fakes.seen.forgotten).to.deep.equal(['a']);
    });

    it('lists every entry without thumbnails when they cannot be fetched, and shows no error', async () => {
      const { element, fakes } = await openPage(host, { thumbs: 'reject' });
      expect(tiles(element)).to.have.length(2);
      expect(tiles(element)[0].querySelector('img')).to.equal(null);
      expect(fakes.seen.forgotten).to.deep.equal([]);
    });

    it('opens a tile by its key, and hands the app the file', async () => {
      const { element, fakes } = await openPage(host);
      let opened: unknown;
      element.addEventListener('umbradesktop-media-file-open', (event) => (opened = (event as CustomEvent).detail));
      tiles(element)[0].click();
      await settle(element);
      expect(fakes.seen.opens).to.deep.equal([{ unique: 'a' }]);
      expect((opened as { unique: string }).unique).to.equal('a');
      expect((opened as { status?: string }).status, 'the file, not the result').to.equal(undefined);
    });

    it('fires nothing for a cancelled open, and says which file failed', async () => {
      const cancelled = await openPage(host, { opened: { status: 'cancelled' } });
      let events = 0;
      cancelled.element.addEventListener('umbradesktop-media-file-open', () => events++);
      cancelled.element.addEventListener('umbradesktop-media-file-failed', () => events++);
      byAction(cancelled.element, 'browse').click();
      await settle(cancelled.element);
      expect(events).to.equal(0);

      const failed = await openPage(host, { opened: { status: 'failed', name: 'Broken' } });
      let message: string | undefined;
      failed.element.addEventListener('umbradesktop-media-file-failed', (event) => (message = (event as CustomEvent).detail.message));
      tiles(failed.element)[0].click();
      await settle(failed.element);
      expect(message).to.equal(words.openFailed.replace('%0%', 'Broken'));
    });

    it('asks before opening over unsaved work, and opens nothing on no', async () => {
      const { element, fakes } = await openPage(host, { discard: false }, true);
      tiles(element)[0].click();
      await settle(element);
      expect(fakes.seen.asked).to.equal(1);
      expect(fakes.seen.opens).to.deep.equal([]);
    });

    it('opens the media picker from Browse and from Upload, which has its own upload', async () => {
      const { element, fakes } = await openPage(host);
      expect(byAction(element, 'browse').textContent?.trim()).to.equal(words.openBrowse);
      expect(byAction(element, 'upload').textContent?.trim()).to.equal(words.openUpload);
      byAction(element, 'browse').click();
      await settle(element);
      byAction(element, 'upload').click();
      await settle(element);
      expect(fakes.seen.opens).to.deep.equal([undefined, undefined]);
    });

    it('says so when there is nothing recent, and still offers Browse and Upload', async () => {
      const { element } = await openPage(host, { recent: [] });
      expect(tiles(element)).to.have.length(0);
      expect(element.shadowRoot!.textContent).to.contain(words.openNoRecent);
      expect(byAction(element, 'browse')).to.not.equal(null);
      expect(byAction(element, 'upload')).to.not.equal(null);
    });
  });
}

describe('the open view', () => {
  it('heads itself with what the app gives it, and with Open otherwise', async () => {
    const { element } = await openPage('view');
    expect(element.shadowRoot!.querySelector('h2')!.textContent!.trim()).to.equal(words.openHeading);
    (element as UmbraDesktopMediaOpenViewElement).heading = 'Open an image';
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('h2')!.textContent!.trim()).to.equal('Open an image');
  });
});
