import { expect } from '@open-wc/testing';
import { UmbRequestReloadChildrenOfEntityEvent, UmbRequestReloadStructureForEntityEvent } from '@umbraco-cms/backoffice/entity-action';
import { BIN_RECOUNT_MS, binRootName, watchBinChanges } from './bin-count.js';

/** How much is in the recycle bin, on its row in the tree (owner's test, 2026-10-18). */

describe('the recycle bin’s name', () => {
  it('says how many items are in it, and nothing when it is empty', () => {
    expect(binRootName('#treeHeaders_contentRecycleBin', 3)).to.equal('#treeHeaders_contentRecycleBin (3)');
    expect(binRootName('#treeHeaders_contentRecycleBin', 0)).to.equal('#treeHeaders_contentRecycleBin');
  });
});

describe('recounting the recycle bin', () => {
  const wait = () => new Promise((resolve) => setTimeout(resolve, BIN_RECOUNT_MS + 50));

  /**
   * The action events, recording the bin root reloads asked for.
   * @returns The events and the record.
   */
  function events() {
    const target = new EventTarget();
    const reloads: string[] = [];
    target.addEventListener(UmbRequestReloadStructureForEntityEvent.TYPE, (event) => {
      const reload = event as UmbRequestReloadStructureForEntityEvent;
      if (reload.getEntityType() === 'media-recycle-bin-root') reloads.push('bin');
    });
    return { target, reloads };
  }

  it('asks the bin to reload once after media changes, however many changes come together', async () => {
    const { target, reloads } = events();
    const stop = watchBinChanges(target);
    target.dispatchEvent(new UmbRequestReloadStructureForEntityEvent({ entityType: 'media', unique: 'a' }));
    target.dispatchEvent(new UmbRequestReloadChildrenOfEntityEvent({ entityType: 'media-root', unique: null }));
    target.dispatchEvent(new UmbRequestReloadChildrenOfEntityEvent({ entityType: 'media-recycle-bin-root', unique: null }));
    await wait();
    stop();
    expect(reloads).to.deep.equal(['bin']);
  });

  it('does not answer its own reload, nor changes to anything but media', async () => {
    const { target, reloads } = events();
    const stop = watchBinChanges(target);
    target.dispatchEvent(new UmbRequestReloadChildrenOfEntityEvent({ entityType: 'document', unique: 'd' }));
    await wait();
    target.dispatchEvent(new UmbRequestReloadChildrenOfEntityEvent({ entityType: 'media', unique: 'a' }));
    await wait();
    await wait();
    stop();
    expect(reloads).to.deep.equal(['bin']);
  });
});
