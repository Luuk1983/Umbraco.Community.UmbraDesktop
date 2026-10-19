import { expect } from '@open-wc/testing';
import { readEntries, takeDropped } from './folder-entries.js';
import type { UmbraDesktopEntry } from './folder-entries.js';

/** Files and folders dropped from the OS (design §6, plan task 6.6). */

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

/**
 * A dropped file, as the browser's entry.
 * @param name Its name.
 * @returns The entry.
 */
const fileEntry = (name: string): UmbraDesktopEntry => ({
  name,
  isFile: true,
  isDirectory: false,
  file: (resolve: (file: File) => void) => resolve(file(name)),
});

/**
 * A dropped folder, as the browser's entry, handing over what is in it in batches of two.
 * @param name Its name.
 * @param children What is in it.
 * @returns The entry.
 */
const folderEntry = (name: string, children: UmbraDesktopEntry[]): UmbraDesktopEntry => ({
  name,
  isFile: false,
  isDirectory: true,
  createReader: () => {
    let at = 0;
    return {
      readEntries: (resolve: (batch: UmbraDesktopEntry[]) => void) => {
        const batch = children.slice(at, at + 2);
        at += batch.length;
        resolve(batch);
      },
    };
  },
});

/**
 * What came out, by name only.
 * @param items The dropped items.
 * @returns Their names, nested.
 */
function names(items: { files: File[]; folders: Array<{ folderName: string; files: File[]; folders: unknown[] }> }): unknown {
  return {
    files: items.files.map((each) => each.name),
    folders: items.folders.map((folder) => ({ name: folder.folderName, ...(names(folder as never) as object) })),
  };
}

describe('dropped files and folders', () => {
  it('keeps a dropped folder\'s structure, every file read however many batches it takes', async () => {
    const dropped = await readEntries([
      fileEntry('c.jpg'),
      folderEntry('Holiday', [fileEntry('a.jpg'), fileEntry('a2.jpg'), fileEntry('a3.jpg'), folderEntry('Day 1', [fileEntry('b.jpg')])]),
    ]);
    expect(names(dropped)).to.deep.equal({
      files: ['c.jpg'],
      folders: [{ name: 'Holiday', files: ['a.jpg', 'a2.jpg', 'a3.jpg'], folders: [{ name: 'Day 1', files: ['b.jpg'], folders: [] }] }],
    });
  });

  it('takes the plain files when the browser hands over no entries', async () => {
    const data = new DataTransfer();
    data.items.add(file('one.jpg'));
    data.items.add(file('two.jpg'));
    const dropped = await takeDropped(data)();
    expect(names(dropped)).to.deep.equal({ files: ['one.jpg', 'two.jpg'], folders: [] });
  });
});
