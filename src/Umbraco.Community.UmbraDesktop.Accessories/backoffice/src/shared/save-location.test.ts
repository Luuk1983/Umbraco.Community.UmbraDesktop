import { expect } from '@open-wc/testing';
import { createSaveFolderPicker, isSaveFolder } from './save-location.js';
import type { SaveFolderMemory } from './save-location.js';

/**
 * Save As for a new Notepad or Paint file: Umbraco's folder picker, opened on the folder chosen last
 * time, or on the media library root the first time, so choosing at once saves to the root.
 */

/** A picker whose dialog answers `answer`, recording what it was opened on. */
function picker(answers: Array<Array<string | null> | undefined>) {
  const memory: SaveFolderMemory = {};
  const opened: Array<Array<string | null>> = [];
  const pick = createSaveFolderPicker(null as never, {
    memory,
    open: async (preselected) => {
      opened.push(preselected);
      return answers.shift();
    },
  });
  return { pick, opened };
}

it('opens on the root the first time, and saves there when it is chosen', async () => {
  const { pick, opened } = picker([[null]]);
  expect(await pick()).to.deep.equal({ status: 'chosen', folder: null });
  expect(opened).to.deep.equal([[null]]);
});

it('opens on the folder chosen last time', async () => {
  const { pick, opened } = picker([['f1'], ['f1']]);
  await pick();
  await pick();
  expect(opened).to.deep.equal([[null], ['f1']]);
});

/** Closing the dialog, or choosing nothing, is cancelling: nothing is saved and nothing remembered. */
it('reports a cancel, and remembers nothing from it', async () => {
  const { pick, opened } = picker([['f1'], undefined, [], ['f2']]);
  await pick();
  expect(await pick()).to.deep.equal({ status: 'cancelled' });
  expect(await pick()).to.deep.equal({ status: 'cancelled' });
  await pick();
  expect(opened).to.deep.equal([[null], ['f1'], ['f1'], ['f1']]);
});

/**
 * The media tree picker lists files too, whatever `foldersOnly` says, and Umbraco sets `isFolder` on
 * none of them. What marks something a file can go into is a media type with a collection (the
 * built-in Folder and any list-view type), or children already there; and the root.
 */
it('lets only the root and folders be picked', () => {
  const file = { unique: 'f', hasChildren: false, mediaType: { unique: 'file', collection: null } };
  const folder = { unique: 'd', hasChildren: false, mediaType: { unique: 'folder', collection: { unique: 'c' } } };
  const parent = { unique: 'p', hasChildren: true, mediaType: { unique: 'custom', collection: null } };
  const root = { unique: null, hasChildren: true };
  expect([file, folder, parent, root].map((item) => isSaveFolder(item))).to.deep.equal([false, true, true, true]);
});
