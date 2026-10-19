import { expect } from '@open-wc/testing';
import { changedSince, stepFrom, undoOf } from './inverse.js';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef } from '../operations/media-api.js';
import type { UmbraDesktopOperationResult } from '../operations/engine.js';

/** What undoes what (design §10, plan task 8.1). */

const ref = (unique: string, parent: string | null, name = unique): UmbraDesktopMediaRef => ({ unique, name, parent, mediaType: 'image', isFolder: false });

/**
 * How an operation ended.
 * @param succeeded What worked, with what it created.
 * @param failed What did not.
 * @returns The result.
 */
const result = (succeeded: Array<[UmbraDesktopMediaRef, string[]?]>, failed: UmbraDesktopMediaRef[] = []): UmbraDesktopOperationResult => ({
  succeeded: succeeded.map(([item, created]) => ({ item, created, affects: [] })),
  failed: failed.map((item) => ({ item, reason: 'no' })),
  cancelled: false,
});

/**
 * A stand-in server holding items as they are now.
 * @param now The items, as the server has them.
 * @returns The API.
 */
const server = (now: Array<UmbraDesktopMediaRef & { isTrashed?: boolean }>) =>
  ({
    item: async (unique: string) => {
      const found = now.find((each) => each.unique === unique);
      return found ? { data: found } : { error: 'Not found' };
    },
  }) as unknown as UmbraDesktopMediaApi;

describe('undo', () => {
  it('records only what worked, and nothing when nothing did', () => {
    expect(stepFrom('move', 'design', result([[ref('banjo', 'people')]], [ref('clip', 'people')]))).to.deep.equal({
      kind: 'move',
      items: [{ item: ref('banjo', 'people'), to: 'design' }],
    });
    expect(stepFrom('move', 'design', result([], [ref('clip', 'people')]))).to.equal(undefined);
  });

  it('moves items back to the folders they came from', () => {
    const step = stepFrom('move', 'design', result([[ref('banjo', 'people')], [ref('drum', 'products')]]))!;
    // Moved as they are now, in the folder they went to, so the move is not refused as already there.
    expect(undoOf(step)).to.deep.equal([
      { kind: 'move', items: [ref('banjo', 'design')], target: 'people' },
      { kind: 'move', items: [ref('drum', 'design')], target: 'products' },
    ]);
  });

  it('puts the copies in the recycle bin', () => {
    const step = stepFrom('copy', 'design', result([[ref('banjo', 'people'), ['banjo-copy']]]))!;
    expect(undoOf(step)).to.deep.equal([{ kind: 'trash', items: [{ ...ref('banjo-copy', 'design'), name: 'banjo' }] }]);
  });

  it('renames back', () => {
    const step = stepFrom('rename', 'people', result([[ref('banjo', 'people', 'Banjo')]]), { name: 'Banjo two' })!;
    expect(undoOf(step)).to.deep.equal([{ kind: 'rename', item: ref('banjo', 'people', 'Banjo two'), name: 'Banjo' }]);
  });

  it('restores what was trashed to where it was', () => {
    const step = stepFrom('trash', undefined, result([[ref('banjo', 'people')]]))!;
    expect(undoOf(step)).to.deep.equal([{ kind: 'restore', items: [ref('banjo', 'people')], target: 'people' }]);
  });

  it('records nothing for an upload or a restore', () => {
    expect(stepFrom('restore', 'people', result([[ref('banjo', null)]]))).to.equal(undefined);
  });

  it('finds an item someone changed since, and nothing when all is as it was left', async () => {
    const moved = stepFrom('move', 'design', result([[ref('banjo', 'people')]]))!;
    expect(await changedSince(moved, server([ref('banjo', 'design')]))).to.equal(undefined);
    expect(await changedSince(moved, server([ref('banjo', 'products')]))).to.equal('banjo');
    const renamed = stepFrom('rename', 'people', result([[ref('banjo', 'people', 'Banjo')]]), { name: 'Banjo two' })!;
    expect(await changedSince(renamed, server([ref('banjo', 'people', 'Banjo three')]))).to.equal('Banjo two');
    const trashed = stepFrom('trash', undefined, result([[ref('banjo', 'people')]]))!;
    expect(await changedSince(trashed, server([{ ...ref('banjo', 'people'), isTrashed: true }]))).to.equal(undefined);
    expect(await changedSince(trashed, server([{ ...ref('banjo', 'people'), isTrashed: false }]))).to.equal('banjo');
    const copied = stepFrom('copy', 'design', result([[ref('banjo', 'people'), ['banjo-copy']]]))!;
    expect(await changedSince(copied, server([]))).to.equal('banjo');
  });
});
