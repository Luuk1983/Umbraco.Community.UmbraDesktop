import { expect } from '@open-wc/testing';
import { defineFakeFileMenu, mountEditor, openFixture, opened, settle } from './image-editor.test-helper.js';
import type { UmbraDesktopImageEditorElement } from './image-editor.element.js';
import en from '../localization/en.js';

/**
 * The editor's location (#137, design §4.1): the media item it has open. Edit image opens the editor
 * at an item, a reopened window opens at the item it had, and the editor reports where it is so the
 * desktop can bring its window forward for that item instead of opening a second editor.
 */

defineFakeFileMenu();

const words = en.umbraDesktopMedia;

/**
 * Every location each editor reported through `umbradesktop-app-location`, in order. Heard at the
 * document, as the title tests hear titles, because an editor speaks in its first update.
 */
const locationsSent = new WeakMap<EventTarget, unknown[]>();
document.addEventListener('umbradesktop-app-location', (event) => {
  const from = event.composedPath()[0];
  locationsSent.set(from, [...(locationsSent.get(from) ?? []), (event as CustomEvent<{ location?: unknown }>).detail?.location]);
});

/**
 * The last location an editor reported, or undefined when it never reported one.
 * @param editor The editor.
 * @returns The location.
 */
const location = (editor: HTMLElement) => locationsSent.get(editor)?.slice(-1)[0];

/**
 * Wait for an editor opened at a location to finish opening it, or to give up.
 * @param editor The editor.
 */
async function opening(editor: UmbraDesktopImageEditorElement): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!editor.picture && !editor.notice && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await settle(editor);
}

/** The status bar's text. */
const status = (editor: HTMLElement) => editor.shadowRoot!.querySelector('.status')!.textContent ?? '';

describe('opened at a location', () => {
  it('opens that media item by key, without the picker, and says it is there', async () => {
    const file = await opened('picture.png', { unique: 'beach' });
    const { editor, opens } = await mountEditor({ location: 'beach', open: async () => ({ status: 'opened', ...file }) });
    await opening(editor);
    expect(opens).to.deep.equal([{ unique: 'beach' }]);
    expect(editor.hasDocument).to.equal(true);
    expect(editor.fileMenuDocument?.unique).to.equal('beach');
    expect(location(editor)).to.equal('beach');
  });

  /** Until the open answers, a second Edit image on the same item must still find this window. */
  it('does not clear its location while the open is under way', async () => {
    let answer: (value: unknown) => void = () => {};
    const { editor } = await mountEditor({ location: 'beach', open: () => new Promise((resolve) => (answer = resolve)) });
    await settle(editor);
    expect(locationsSent.get(editor) ?? []).to.not.include('');
    answer({ status: 'cancelled' });
    await settle(editor);
  });

  it('shows Open with the reason, and clears its location, when the item cannot be opened', async () => {
    const { editor } = await mountEditor({ location: 'gone', open: async () => ({ status: 'failed', name: 'Beach' }) });
    await opening(editor);
    expect(editor.hasDocument).to.equal(false);
    expect(editor.shadowRoot!.querySelector('umbradesktop-media-open-view')).to.not.equal(null);
    expect(status(editor)).to.contain(words.openFailed.replace('%0%', 'Beach'));
    expect(location(editor)).to.equal('');
  });

  /** Opening by key reads an item wherever it is, so one binned since the action was drawn opens too. */
  it('refuses an item in the recycle bin, and clears its location', async () => {
    const file = await opened('picture.png', { unique: 'beach', isTrashed: true });
    const { editor } = await mountEditor({ location: 'beach', open: async () => ({ status: 'opened', ...file }) });
    await opening(editor);
    expect(editor.hasDocument).to.equal(false);
    expect(status(editor)).to.contain(words.openTrashed.replace('%0%', 'Beach'));
    expect(location(editor)).to.equal('');
  });

  /**
   * Only a definite answer clears it. A media library that did not answer in time (a cold reload, a
   * package that registered late, a dropped connection) says nothing about the image, and clearing
   * the location would lose it from the window for good (found by the reviewer of #137).
   */
  it('keeps its location when the media library cannot be reached', async () => {
    const { editor, opens } = await mountEditor({ location: 'beach', media: false });
    await opening(editor);
    expect(opens).to.deep.equal([]);
    expect(locationsSent.get(editor) ?? []).to.not.include('');
  });

  it('keeps its location when the open itself fails to reach the library', async () => {
    const { editor } = await mountEditor({
      location: 'beach',
      open: async () => {
        throw new Error('offline');
      },
    });
    await opening(editor);
    expect(locationsSent.get(editor) ?? []).to.not.include('');
  });
});

describe('reporting where it is', () => {
  it('asks to open nothing without a location', async () => {
    const { editor, opens } = await mountEditor();
    expect(opens).to.deep.equal([]);
    expect(location(editor) ?? '').to.equal('');
  });

  it('reports the item opened from the file menu', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'picture.png', { unique: 'beach' });
    expect(location(editor)).to.equal('beach');
  });

  it('moves onto a saved copy', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'picture.png', { unique: 'beach' });
    menu!.fire('saved', { unique: 'copy1', updateDate: 'c1', name: 'Beach (copy)', extension: 'png', folder: 'f1', copy: true, bytes: 90 });
    await settle(editor);
    expect(location(editor)).to.equal('copy1');
  });

  it('refuses a binned item opened from the file menu too, and stays where it was', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'picture.png', { unique: 'beach' });
    await openFixture(editor, menu!, 'picture.png', { unique: 'binned', name: 'Old', isTrashed: true });
    expect(editor.fileMenuDocument?.unique).to.equal('beach');
    expect(status(editor)).to.contain(words.openTrashed.replace('%0%', 'Old'));
    expect(location(editor)).to.equal('beach');
  });
});
