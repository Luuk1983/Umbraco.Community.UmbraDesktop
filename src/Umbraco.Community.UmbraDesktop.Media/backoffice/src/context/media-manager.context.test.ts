import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbraDesktopMediaManagerContext } from './media-manager.context.js';
import type { UmbraDesktopMediaClipboard } from '../clipboard/clipboard.js';
import { afterPaste, cutKeys, pasteInto, pasteKind } from '../clipboard/clipboard.js';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef } from '../operations/media-api.js';
import type { UmbraDesktopDragWindowHandle } from '../drag/drag.controller.js';

/** The Media add-on's desktop context: the clipboard and the operations (plan task 4.5). */

const ref = (unique: string, parent: string | null, mediaType = 'image-type', folder = false): UmbraDesktopMediaRef => ({
  unique,
  name: unique,
  parent,
  mediaType,
  isFolder: folder,
});

describe('the clipboard', () => {
  const cut: UmbraDesktopMediaClipboard = { mode: 'cut', items: [ref('a', 'p'), ref('b', 'p')] };
  const copy: UmbraDesktopMediaClipboard = { mode: 'copy', items: [ref('a', 'p')] };

  it('pastes a cut as a move and a copy as a copy', () => {
    expect(pasteKind(cut)).to.equal('move');
    expect(pasteKind(copy)).to.equal('copy');
    expect(pasteKind(undefined)).to.equal(undefined);
  });

  it('empties a cut once pasted, and keeps a copy for pasting again', () => {
    expect(afterPaste(cut)).to.equal(undefined);
    expect(afterPaste(copy)).to.deep.equal(copy);
  });

  it('pastes a copied folder onto itself beside it, as a file manager makes a copy of it', () => {
    const products = ref('products', 'media', 'folder-type', true);
    expect(pasteInto({ mode: 'copy', items: [products] }, 'products'), 'beside it').to.equal('media');
    expect(pasteInto({ mode: 'copy', items: [ref('top', null, 'folder-type', true)] }, 'top'), 'at the top').to.equal(null);
    expect(pasteInto({ mode: 'copy', items: [products] }, 'design'), 'anywhere else').to.equal('design');
    expect(pasteInto({ mode: 'cut', items: [products] }, 'products'), 'a cut is refused there').to.equal('products');
  });

  it('pastes a copied place that is no folder onto itself beside it, as a folder (#158)', () => {
    expect(pasteInto({ mode: 'copy', items: [ref('banjo', 'products')] }, 'banjo')).to.equal('products');
  });

  it('fades the items of a cut, and nothing for a copy', () => {
    expect(cutKeys(cut)).to.deep.equal(['a', 'b']);
    expect(cutKeys(copy)).to.deep.equal([]);
  });
});

describe('the context', () => {
  let hosts: UmbElementControllerHost[] = [];
  afterEach(() => {
    for (const host of hosts) host.destroy();
    hosts = [];
  });

  /**
   * The context on a stand-in server with a folder `people` that allows images only, inside `media`.
   * @returns The context and what it did.
   */
  function context(access?: { root: boolean; starts: Set<string> }) {
    const log: string[] = [];
    const notes: string[] = [];
    const reloads: Array<string | null> = [];
    const items = new Map<string, UmbraDesktopMediaRef>([
      ['people', ref('people', 'media', 'folder-type', true)],
      ['media', ref('media', null, 'folder-type', true)],
    ]);
    const api = {
      item: async (unique: string) => (items.has(unique) ? { data: items.get(unique)! } : { error: 'Not found' }),
      items: async () => ({ data: [] }),
      allowedTypes: async () => ({ data: ['image-type'] }),
      move: async (unique: string, target: string | null) => {
        log.push(`move ${unique} to ${target}`);
        return {};
      },
      trash: async (unique: string) => {
        log.push(`trash ${unique}`);
        return {};
      },
      restore: async (unique: string, target: string | null) => {
        log.push(`restore ${unique} to ${target}`);
        return {};
      },
      detail: async () => ({ data: { mediaType: 'image-type', variants: [{ name: 'x' }], values: [] } }),
      create: async (model: { name: string; parent: string | null; mediaType?: string }) => {
        log.push(`create ${model.name} in ${model.parent}`);
        return {};
      },
      folderTypes: async () => (log.push('read folder types'), { data: ['folder-type'] }),
      children: async () => ({ data: [] }),
      update: async () => ({}),
      upload: async () => ({ data: 'tmp' }),
      download: async () => ({ data: new Blob() }),
    } as unknown as UmbraDesktopMediaApi;
    const host = new UmbElementControllerHost(document.createElement('div'));
    hosts.push(host);
    const ctx = new UmbraDesktopMediaManagerContext(host, {
      api,
      notify: (message) => notes.push(message),
      reload: (unique) => reloads.push(unique),
      access: access && (() => access),
    });
    let clipboard: UmbraDesktopMediaClipboard | undefined;
    ctx.clipboard.subscribe((value) => (clipboard = value));
    return { ctx, log, notes, reloads, clipboard: () => clipboard };
  }

  it('holds what was cut or copied, for every window', () => {
    const { ctx, clipboard } = context();
    ctx.hold('cut', [ref('banjo', 'products')]);
    expect(clipboard()).to.deep.equal({ mode: 'cut', items: [ref('banjo', 'products')] });
    ctx.empty();
    expect(clipboard()).to.equal(undefined);
  });

  it('pastes a cut as a move into the folder, empties the clipboard, and reloads both folders', async () => {
    const { ctx, log, reloads, clipboard } = context();
    ctx.hold('cut', [ref('banjo', 'products')]);
    await ctx.paste('people');
    expect(log).to.deep.equal(['move banjo to people']);
    expect(clipboard()).to.equal(undefined);
    expect(reloads).to.have.members(['products', 'people']);
  });

  it('pastes a copy as a copy and keeps holding it', async () => {
    const { ctx, log, clipboard } = context();
    ctx.hold('copy', [ref('banjo', 'products')]);
    await ctx.paste('people');
    expect(log).to.deep.equal(['create x in people']);
    expect(clipboard()?.mode).to.equal('copy');
  });

  it('pastes nothing into a folder out of the person’s reach, and says why', async () => {
    const { ctx, log, notes } = context({ root: false, starts: new Set(['people']) });
    ctx.hold('copy', [ref('banjo', 'people')]);
    await ctx.paste(null);
    expect([log, notes.length, notes[0]]).to.deep.equal([[], 1, notes[0]]);
    expect(notes[0]).to.contain('umbraDesktopMedia_refusedAccess');
  });

  it('pastes into a start folder as before', async () => {
    const { ctx, log } = context({ root: false, starts: new Set(['people']) });
    ctx.hold('copy', [ref('banjo', 'people')]);
    await ctx.paste('people');
    expect(log).to.deep.equal(['create x in people']);
  });

  it('creates a folder by name in a folder, and reloads that folder', async () => {
    const { ctx, log, reloads } = context();
    const key = await ctx.createFolder('people', 'folder-type', 'Archive');
    expect([typeof key, log, reloads]).to.deep.equal(['string', ['create Archive in people'], ['people']]);
  });

  it('knows the folder media types, reading them once', async () => {
    const { ctx, log } = context();
    const answers = [await ctx.isFolderType('folder-type'), await ctx.isFolderType('image-type')];
    expect([answers, log]).to.deep.equal([[true, false], ['read folder types']]);
  });

  it('pastes a copy into the folder it came from, as a duplicate beside the original', async () => {
    const { ctx, log } = context();
    ctx.hold('copy', [ref('banjo', 'people')]);
    await ctx.paste('people');
    expect(log).to.deep.equal(['create x in people']);
  });

  it('leaves out what the folder does not allow, moves the rest, and says what did not go', async () => {
    const { ctx, log, notes } = context();
    ctx.hold('cut', [ref('banjo', 'products'), ref('clip', 'products', 'video-type')]);
    await ctx.paste('people');
    expect(log).to.deep.equal(['move banjo to people']);
    expect(notes.length).to.equal(1);
    expect(notes[0]).to.contain('clip');
  });

  it('will not paste a folder into itself or below it', async () => {
    const { ctx, log, notes } = context();
    ctx.hold('cut', [ref('media', null, 'folder-type', true)]);
    await ctx.paste('people');
    expect(log).to.deep.equal([]);
    expect(notes.length).to.equal(1);
  });

  it('follows each operation as a transfer while it runs, for the Transfers window', async () => {
    const { ctx } = context();
    const seen: string[] = [];
    ctx.transfers.subscribe((list) => {
      for (const each of list) seen.push(`${each.kind} ${each.rows.map((row) => `${row.name} ${row.status}`).join(',')}`);
    });
    ctx.hold('cut', [ref('banjo', 'products')]);
    await ctx.paste('people');
    expect(seen).to.include('move banjo running');
  });

  it('copies to a folder without touching the clipboard', async () => {
    const { ctx, log, clipboard } = context();
    await ctx.copyTo([ref('banjo', 'products')], 'people');
    expect(log).to.deep.equal(['create x in people']);
    expect(clipboard()).to.equal(undefined);
  });

  it('lists the manager windows a drag can land in, as they open and close', () => {
    const { ctx } = context();
    const handle = { element: document.createElement('div') } as unknown as UmbraDesktopDragWindowHandle;
    const leave = ctx.registerDragWindow(handle);
    expect(ctx.dragWindows().length).to.equal(1);
    leave();
    expect(ctx.dragWindows().length).to.equal(0);
  });
});

describe('copying a picture to the OS clipboard', () => {
  let hosts: UmbElementControllerHost[] = [];
  afterEach(() => {
    for (const host of hosts) host.destroy();
    hosts = [];
  });

  /**
   * A small JPEG.
   * @returns The picture.
   */
  async function jpeg(): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext('2d')!.fillRect(0, 0, 8, 8);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg'));
  }

  /**
   * The context on a server whose items hold the file named after their key, and a stand-in OS clipboard.
   * @returns The context and what was written.
   */
  async function context() {
    const written: ClipboardItem[] = [];
    const asked: ClipboardItem[][] = [];
    const picture = await jpeg();
    const api = {
      detail: async (unique: string) => ({ data: { mediaType: 'image-type', variants: [{ name: unique }], values: [{ alias: 'umbracoFile', editorAlias: 'Umbraco.ImageCropper', value: { src: `/media/x/${unique}` } }] } }),
      download: async () => ({ data: picture }),
      items: async () => ({ data: [] }),
    } as unknown as UmbraDesktopMediaApi;
    const host = new UmbElementControllerHost(document.createElement('div'));
    hosts.push(host);
    // As the browser's clipboard: asked at once, written only once every picture it was handed is there.
    const write = (items: ClipboardItem[]) => {
      asked.push(items);
      return (async () => {
        for (const item of items) await item.getType('image/png');
        written.push(...items);
      })();
    };
    const ctx = new UmbraDesktopMediaManagerContext(host, { api, osClipboard: { write }, pageFocused: () => false });
    return { ctx, written, asked };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

  it('puts the picture of one copied image on the OS clipboard as PNG, and knows it again', async () => {
    const { ctx, written } = await context();
    ctx.hold('copy', [ref('banjo.jpg', 'p')]);
    await settle();
    expect(written.map((item) => item.types)).to.deep.equal([['image/png']]);
    const print = await ctx.osPicture();
    expect(print?.width).to.equal(8);
  });

  it('asks the OS clipboard in the same moment as the copy, before the picture is read', async () => {
    const { ctx, asked } = await context();
    ctx.hold('copy', [ref('banjo.jpg', 'p')]);
    // Not awaited: the browser refuses a write that starts after the page lost the keyboard, which the
    // item opening beside the window can take while the picture is fetched.
    expect(asked.length).to.equal(1);
  });

  it('starts the picture from the key, before the item is read, and asks only once', async () => {
    const { ctx, asked, written } = await context();
    ctx.startPicture('banjo.jpg');
    expect(asked.length, 'asked in the key’s moment').to.equal(1);
    ctx.hold('copy', [ref('banjo.jpg', 'p')]);
    await settle();
    expect([asked.length, written.length]).to.deep.equal([1, 1]);
    expect((await ctx.osPicture())?.width).to.equal(8);
    ctx.hold('copy', [ref('clip.jpg', 'p')]);
    expect(asked.length, 'another item is asked for itself').to.equal(2);
  });

  it('counts what the manager holds as newer than the OS clipboard until the page is left', async () => {
    const { ctx } = await context();
    expect(ctx.heldIsNewer(), 'nothing held').to.equal(false);
    ctx.hold('cut', [ref('banjo.jpg', 'p')]);
    expect(ctx.heldIsNewer(), 'just held').to.equal(true);
    window.dispatchEvent(new Event('blur'));
    await settle();
    expect(ctx.heldIsNewer(), 'after leaving the page').to.equal(false);
    ctx.hold('cut', [ref('banjo.jpg', 'p')]);
    expect(ctx.heldIsNewer(), 'held again').to.equal(true);
  });

  it('leaves the OS clipboard alone for a cut, several items, or a file that is no picture', async () => {
    const { ctx, written } = await context();
    ctx.hold('cut', [ref('banjo.jpg', 'p')]);
    ctx.hold('copy', [ref('banjo.jpg', 'p'), ref('clip.jpg', 'p')]);
    ctx.hold('copy', [ref('manual.pdf', 'p')]);
    await settle();
    expect(written.length).to.equal(0);
    expect(await ctx.osPicture()).to.equal(undefined);
  });
});

describe('undo', () => {
  let hosts: UmbElementControllerHost[] = [];
  afterEach(() => {
    for (const host of hosts) host.destroy();
    hosts = [];
  });

  /**
   * The context on a server that keeps where each item is and what it is called.
   * @returns The context, the server's state and what was said.
   */
  function context() {
    const log: string[] = [];
    const notes: string[] = [];
    const state = new Map<string, UmbraDesktopMediaRef & { isTrashed?: boolean }>([
      ['banjo', ref('banjo', 'products')],
      ['people', ref('people', null, 'folder-type', true)],
      ['products', ref('products', null, 'folder-type', true)],
    ]);
    const api = {
      item: async (unique: string) => (state.has(unique) ? { data: { ...state.get(unique)! } } : { error: 'Not found' }),
      items: async (uniques: string[]) => ({ data: uniques.filter((each) => state.has(each)).map((each) => ({ ...state.get(each)! })) }),
      allowedTypes: async () => ({ data: ['image-type', 'folder-type'] }),
      move: async (unique: string, target: string | null) => {
        log.push(`move ${unique} to ${target}`);
        state.set(unique, { ...state.get(unique)!, parent: target });
        return {};
      },
      trash: async (unique: string) => {
        log.push(`trash ${unique}`);
        state.set(unique, { ...state.get(unique)!, isTrashed: true });
        return {};
      },
      restore: async (unique: string, target: string | null) => {
        log.push(`restore ${unique} to ${target}`);
        state.set(unique, { ...state.get(unique)!, parent: target, isTrashed: false });
        return {};
      },
      detail: async (unique: string) => ({ data: { mediaType: 'image-type', variants: [{ name: state.get(unique)?.name ?? unique }], values: [] } }),
      update: async (unique: string, model: { name?: string; variants?: Array<{ name: string }> }) => {
        const name = model.variants?.[0]?.name ?? model.name ?? '';
        log.push(`rename ${unique} to ${name}`);
        state.set(unique, { ...state.get(unique)!, name });
        return {};
      },
    } as unknown as UmbraDesktopMediaApi;
    const host = new UmbElementControllerHost(document.createElement('div'));
    hosts.push(host);
    const ctx = new UmbraDesktopMediaManagerContext(host, { api, notify: (message, headline) => notes.push(`${headline} | ${message}`), reload: () => undefined });
    return { ctx, log, notes, state };
  }

  it('moves items back, saying nothing, and brings the window on that folder forward with them selected', async () => {
    const { ctx, log, notes } = context();
    const shown: string[] = [];
    ctx.registerDragWindow({
      element: document.createElement('div'),
      place: () => ({ kind: 'folder', unique: 'products' }),
      folder: () => undefined,
      tree: () => undefined,
      setDrop: () => undefined,
      setLabel: () => undefined,
      raise: () => shown.push('raise'),
      selectWhenShown: (keys) => shown.push(`select ${keys.join(',')}`),
    });
    await ctx.move([ref('banjo', 'products')], 'people');
    await ctx.undo();
    expect(log).to.deep.equal(['move banjo to people', 'move banjo to products']);
    expect(notes).to.deep.equal([]);
    expect(shown).to.deep.equal(['raise', 'select banjo']);
  });

  /**
   * Media Health's Clean up reports "n of m" on the taskbar while hundreds of items go to the bin
   * (plan Task 1.3), so whoever starts an operation can follow it, not only the Transfers window.
   */
  it('tells the caller how far an operation is, as it goes', async () => {
    const { ctx } = context();
    const seen: string[] = [];
    await ctx.trash([ref('banjo', 'products'), ref('people', null, 'folder-type', true)], { onProgress: ({ done, total }) => seen.push(`${done}/${total}`) });
    expect(seen[0]).to.equal('0/2');
    expect(seen[seen.length - 1]).to.equal('2/2');
  });

  it('restores what was trashed, and renames back', async () => {
    const { ctx, log } = context();
    await ctx.trash([ref('banjo', 'products')]);
    await ctx.undo();
    await ctx.rename(ref('banjo', 'products'), 'Banjo two');
    await ctx.undo();
    expect(log).to.deep.equal(['trash banjo', 'restore banjo to products', 'rename banjo to Banjo two', 'rename banjo to banjo']);
  });

  it('undoes nothing when someone moved the item since, and says why', async () => {
    const { ctx, log, notes, state } = context();
    await ctx.move([ref('banjo', 'products')], 'people');
    state.set('banjo', { ...state.get('banjo')!, parent: 'elsewhere' });
    await ctx.undo();
    expect(log).to.deep.equal(['move banjo to people']);
    expect(notes).to.deep.equal(['umbraDesktopMedia_undoCannotMove | umbraDesktopMedia_undoChangedMove']);
  });

  it('does not record an undo, so a second Ctrl+Z goes one step further back', async () => {
    const { ctx, log } = context();
    await ctx.move([ref('banjo', 'products')], 'people');
    await ctx.trash([ref('people', null, 'folder-type', true)]);
    await ctx.undo();
    await ctx.undo();
    await ctx.undo();
    expect(log).to.deep.equal(['move banjo to people', 'trash people', 'restore people to null', 'move banjo to products']);
  });
});

/**
 * Replace file (#176) runs as an operation of the context, so it is a row in the Transfers window like a
 * move, and says what did not go as one does. It is not undoable: Umbraco deletes the old file.
 */
describe('replacing a file', () => {
  let hosts: UmbElementControllerHost[] = [];
  afterEach(() => {
    for (const host of hosts) host.destroy();
    hosts = [];
  });

  /**
   * The context with one image, Banjo, in Products.
   * @param answer What the media service's save answers.
   * @returns The context, what was saved, said and reloaded.
   */
  function context(answer: { ok: boolean; message?: string } = { ok: true }) {
    const saved: unknown[] = [];
    const notes: string[] = [];
    const reloads: Array<string | null> = [];
    const banjo = ref('banjo', 'products');
    const api = {
      item: async (unique: string) => (unique === 'banjo' ? { data: banjo } : { error: 'Not found' }),
    } as unknown as UmbraDesktopMediaApi;
    const host = new UmbElementControllerHost(document.createElement('div'));
    hosts.push(host);
    const ctx = new UmbraDesktopMediaManagerContext(host, {
      api,
      notify: (message) => notes.push(message),
      reload: (unique) => reloads.push(unique),
      replace: {
        accepts: async () => ['image-type'],
        save: async (request) => (saved.push(request), answer),
        refusal: (extension) => `refused ${extension}`,
      },
    });
    return { ctx, saved, notes, reloads };
  }

  it('saves the file into the item, reloads its folder, and follows it as a replace transfer', async () => {
    const { ctx, saved, reloads } = context();
    const kinds: string[] = [];
    ctx.transfers.subscribe((list) => kinds.push(...list.map((each) => each.kind)));
    const result = await ctx.replaceFile('banjo', new File(['x'], 'new.jpg'));
    expect(result.succeeded.length).to.equal(1);
    expect(saved.length).to.equal(1);
    expect(reloads).to.include('products');
    expect(kinds).to.include('replace');
  });

  it('says what did not go, with the reason', async () => {
    const { ctx, notes } = context({ ok: false, message: 'Too large' });
    const result = await ctx.replaceFile('banjo', new File(['x'], 'new.jpg'));
    expect(result.failed.map((each) => each.reason)).to.deep.equal(['Too large']);
    expect(notes.join()).to.contain('Too large');
  });

  it('says so when the item is gone', async () => {
    const { ctx, saved, notes } = context();
    const result = await ctx.replaceFile('gone', new File(['x'], 'new.jpg'));
    expect(result.succeeded).to.deep.equal([]);
    expect(saved).to.deep.equal([]);
    expect(notes.length).to.equal(1);
  });

  it('is not put in the undo history', async () => {
    const { ctx, notes, reloads } = context();
    await ctx.replaceFile('banjo', new File(['x'], 'new.jpg'));
    const before = { notes: notes.length, reloads: reloads.length };
    // An empty history undoes nothing and says nothing; a recorded step would have been undone or refused.
    await ctx.undo();
    expect({ notes: notes.length, reloads: reloads.length }).to.deep.equal(before);
  });
});
