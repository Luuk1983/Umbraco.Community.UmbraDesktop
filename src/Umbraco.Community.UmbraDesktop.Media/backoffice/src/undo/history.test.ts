import { expect } from '@open-wc/testing';
import { UmbraDesktopUndoHistory } from './history.js';
import type { UmbraDesktopUndoAction } from './inverse.js';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef } from '../operations/media-api.js';

/** One undo history for the desktop (design §10, plan task 8.2). */

const ref = (unique: string, parent: string | null): UmbraDesktopMediaRef => ({ unique, name: unique, parent, mediaType: 'image', isFolder: false });

/**
 * A server holding items where the steps below left them, unless told otherwise.
 * @param moved Items someone moved since.
 * @returns The API.
 */
const server = (moved: string[] = []) =>
  ({
    item: async (unique: string) => ({ data: { ...ref(unique, moved.includes(unique) ? 'elsewhere' : 'design') } }),
  }) as unknown as UmbraDesktopMediaApi;

describe('the undo history', () => {
  it('undoes the last step first, running what undoes it, and drops it', async () => {
    const history = new UmbraDesktopUndoHistory();
    history.push({ kind: 'move', items: [{ item: ref('a', 'people'), to: 'design' }] });
    history.push({ kind: 'move', items: [{ item: ref('b', 'products'), to: 'design' }] });
    const ran: UmbraDesktopUndoAction[] = [];
    const outcome = await history.undo(server(), async (action) => void ran.push(action));
    expect(outcome.kind).to.equal('undone');
    expect(ran).to.deep.equal([{ kind: 'move', items: [ref('b', 'design')], target: 'products' }]);
    expect(history.size).to.equal(1);
  });

  it('undoes nothing when someone changed an item since, says which, and drops the step', async () => {
    const history = new UmbraDesktopUndoHistory();
    history.push({ kind: 'move', items: [{ item: ref('a', 'people'), to: 'design' }, { item: ref('b', 'people'), to: 'design' }] });
    const ran: UmbraDesktopUndoAction[] = [];
    const outcome = await history.undo(server(['b']), async (action) => void ran.push(action));
    expect(outcome).to.deep.include({ kind: 'changed', name: 'b' });
    expect(ran).to.deep.equal([]);
    expect(history.size).to.equal(0);
  });

  it('has nothing to undo when empty, and ignores an operation that recorded nothing', async () => {
    const history = new UmbraDesktopUndoHistory();
    history.push(undefined);
    expect((await history.undo(server(), async () => undefined)).kind).to.equal('nothing');
  });
});
