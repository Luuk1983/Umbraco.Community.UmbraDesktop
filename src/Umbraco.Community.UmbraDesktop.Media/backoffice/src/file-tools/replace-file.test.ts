import { expect } from '@open-wc/testing';
import { pickFile, replaceFromWorkspace } from './replace-file.js';
import type { ReplaceDeps } from './replace-file.js';

/**
 * Replace file from the media item (#176). The item's page may hold unsaved changes, and its next Save
 * would send the old file back over the new one, so those are saved first or nothing happens.
 */
describe('replaceFromWorkspace', () => {
  const ITEM = { unique: 'k1', name: 'Beach' };
  const FILE = new File(['x'], 'new.png');

  /**
   * Fake steps that record what ran.
   * @param over What differs from a clean item, a Save answer and a picked file.
   * @returns The steps and what ran.
   */
  function fakes(over: Partial<{ dirty: boolean; dirtyAfterSave: boolean; answer: boolean; picked: File | undefined }> = {}) {
    const ran: string[] = [];
    let dirty = over.dirty ?? false;
    const deps: ReplaceDeps = {
      hasUnsavedChanges: () => dirty,
      askToSaveFirst: async (name) => (ran.push(`ask ${name}`), over.answer ?? true),
      save: async () => {
        ran.push('save');
        dirty = over.dirtyAfterSave ?? false;
      },
      pick: async () => (ran.push('pick'), 'picked' in over ? over.picked : FILE),
      replace: async (item, file) => void ran.push(`replace ${item.unique} ${file.name}`),
    };
    return { deps, ran };
  }

  it('picks a file and replaces it when the item is saved', async () => {
    const { deps, ran } = fakes();
    await replaceFromWorkspace(ITEM, deps);
    expect(ran).to.deep.equal(['pick', 'replace k1 new.png']);
  });

  it('does nothing when the picker is cancelled', async () => {
    const { deps, ran } = fakes({ picked: undefined });
    await replaceFromWorkspace(ITEM, deps);
    expect(ran).to.deep.equal(['pick']);
  });

  it('asks to save first when the item has unsaved changes', async () => {
    const { deps, ran } = fakes({ dirty: true });
    await replaceFromWorkspace(ITEM, deps);
    expect(ran).to.deep.equal(['ask Beach', 'save', 'pick', 'replace k1 new.png']);
  });

  it('stops when the person cancels the question', async () => {
    const { deps, ran } = fakes({ dirty: true, answer: false });
    await replaceFromWorkspace(ITEM, deps);
    expect(ran).to.deep.equal(['ask Beach']);
  });

  it('stops when the save leaves the item unsaved, as a refused save does', async () => {
    const { deps, ran } = fakes({ dirty: true, dirtyAfterSave: true });
    await replaceFromWorkspace(ITEM, deps);
    expect(ran).to.deep.equal(['ask Beach', 'save']);
  });
});

describe('pickFile', () => {
  it('answers with the file picked', async () => {
    let input!: HTMLInputElement;
    const picked = pickFile(document, (made) => {
      input = made;
      const data = new DataTransfer();
      data.items.add(new File(['x'], 'a.png'));
      input.files = data.files;
      input.dispatchEvent(new Event('change'));
    });
    expect((await picked)?.name).to.equal('a.png');
    expect(input.type).to.equal('file');
    expect(input.multiple).to.equal(false);
  });

  it('answers undefined when the picker is cancelled', async () => {
    const picked = pickFile(document, (input) => input.dispatchEvent(new Event('cancel')));
    expect(await picked).to.equal(undefined);
  });
});
