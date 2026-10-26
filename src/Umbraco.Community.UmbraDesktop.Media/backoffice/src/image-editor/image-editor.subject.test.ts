import { expect } from '@open-wc/testing';
import { defineFakeFileMenu, mountEditor, openFixture, opened, settle } from './image-editor.test-helper.js';
import { UmbraDesktopImageEditorElement } from './image-editor.element.js';

/**
 * The editor says which media item it shows (#176), so the desktop can tell it when somebody else
 * saves that item: a clean editor reopens the new file, a dirty one gets the changed-elsewhere banner,
 * whose Discard mine reopens it and whose Keep my changes leaves Save to ask its overwrite question.
 */

defineFakeFileMenu();

/** What an editor reported as its subject. */
interface Reported {
  entityType: string;
  unique: string;
  version(): string | null | undefined;
  serverVersion(): Promise<string | null | undefined>;
  reload(): Promise<void>;
}

/** Every subject each editor reported, in order, heard at the document as the desktop's window hears it. */
const subjectsSent = new WeakMap<EventTarget, Array<Reported | null>>();
document.addEventListener('umbradesktop-app-subject', (event) => {
  const from = event.composedPath()[0];
  subjectsSent.set(from, [...(subjectsSent.get(from) ?? []), (event as CustomEvent<{ subject: Reported | null }>).detail.subject]);
});

/**
 * The last subject an editor reported.
 * @param editor The editor.
 * @returns It, null for none, or undefined when it never reported one.
 */
const subject = (editor: HTMLElement) => subjectsSent.get(editor)?.slice(-1)[0];

const realVersion = UmbraDesktopImageEditorElement.serverVersionOf;
afterEach(() => {
  UmbraDesktopImageEditorElement.serverVersionOf = realVersion;
});

describe('the item the editor shows', () => {
  it('reports none with nothing open', async () => {
    const { editor } = await mountEditor();
    expect(subject(editor)).to.equal(null);
  });

  it('reports the item it opened, as a media item at the update date it opened', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'picture.png', { unique: 'beach', updateDate: 'd1' });
    const reported = subject(editor)!;
    expect(reported.entityType).to.equal('media');
    expect(reported.unique).to.equal('beach');
    expect(reported.version()).to.equal('d1');
  });

  it("holds its own save's update date afterwards, so its own save is not news", async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'picture.png', { unique: 'beach', updateDate: 'd1' });
    menu!.fire('saved', { unique: 'beach', updateDate: 'd2', name: 'Beach', extension: 'png', folder: 'f1', copy: false, bytes: 90 });
    await settle(editor);
    expect(subject(editor)!.version()).to.equal('d2');
  });

  it('moves onto a saved copy', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'picture.png', { unique: 'beach' });
    menu!.fire('saved', { unique: 'copy1', updateDate: 'c1', name: 'Beach (copy)', extension: 'png', folder: 'f1', copy: true, bytes: 90 });
    await settle(editor);
    expect(subject(editor)!.unique).to.equal('copy1');
  });

  it("asks the server for the item's update date", async () => {
    const asked: string[] = [];
    UmbraDesktopImageEditorElement.serverVersionOf = async (_host, unique) => (asked.push(unique), 'd9');
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'picture.png', { unique: 'beach' });
    expect(await subject(editor)!.serverVersion()).to.equal('d9');
    expect(asked).to.deep.equal(['beach']);
  });

  it('reopens the item on reload: their file, nothing unsaved, no undo of mine', async () => {
    const theirs = await opened('picture.png', { unique: 'beach', updateDate: 'd3' });
    const { editor, menu, opens } = await mountEditor({ open: async () => ({ status: 'opened', ...theirs }) });
    await openFixture(editor, menu!, 'picture.png', { unique: 'beach', updateDate: 'd1' });
    editor.history!.push({ ...editor.history!.current, rotation: 90 } as never);
    await settle(editor);
    expect(editor.dirty).to.equal(true);
    await subject(editor)!.reload();
    await settle(editor);
    expect(opens).to.deep.equal([{ unique: 'beach' }]);
    expect(editor.fileMenuDocument?.updateDate).to.equal('d3');
    expect(editor.dirty).to.equal(false);
    expect(editor.history!.canUndo).to.equal(false);
  });

  it("keeps the date it opened until it saves, so Save asks before writing over theirs", async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'picture.png', { unique: 'beach', updateDate: 'd1' });
    // Keep my changes does nothing to the editor: the desktop only quiets its banner.
    expect(editor.fileMenuDocument?.updateDate).to.equal('d1');
  });
});
