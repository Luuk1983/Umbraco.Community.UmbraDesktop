import { expect } from '@open-wc/testing';
import { otherDestination, saveFile } from './save-file.js';
import type { SaveTargets } from './save-file.js';

/** Targets whose calls are recorded, with a media library that answers `answer`. */
function targets(answer: Awaited<ReturnType<SaveTargets['saveToMedia']>> | Error, existing?: string) {
  const calls = { downloads: [] as string[], media: [] as Array<[string, string | null, string | undefined]> };
  const value: SaveTargets = {
    download: (_blob, name) => void calls.downloads.push(name),
    saveToMedia: async (file, folder, previous) => {
      calls.media.push([file.name, folder, previous]);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    settings: { destination: 'media', folder: { unique: 'folder-1', name: 'Notes' } },
    existing,
  };
  return { calls, value };
}

const file = new File(['hello'], 'Untitled.txt');

it('downloads when the destination is this computer, and asks nothing of the media library', async () => {
  const { calls, value } = targets({ ok: true, unique: 'm-1' });
  expect(await saveFile(file, 'computer', value)).to.deep.equal({ ok: true, destination: 'computer' });
  expect(calls.downloads).to.deep.equal(['Untitled.txt']);
  expect(calls.media).to.deep.equal([]);
});

it('saves into the chosen folder, overwriting the item it saved before', async () => {
  const { calls, value } = targets({ ok: true, unique: 'm-1' }, 'm-1');
  expect(await saveFile(file, 'media', value)).to.deep.equal({ ok: true, destination: 'media', mediaUnique: 'm-1' });
  expect(calls.media).to.deep.equal([['Untitled.txt', 'folder-1', 'm-1']]);
});

it('reports the media library’s refusal, and a thrown error as one', async () => {
  expect(await saveFile(file, 'media', targets({ ok: false, message: 'not allowed' }).value)).to.deep.equal({
    ok: false,
    destination: 'media',
    message: 'not allowed',
  });
  expect(await saveFile(file, 'media', targets(new Error('offline')).value)).to.deep.equal({
    ok: false,
    destination: 'media',
    message: 'offline',
  });
});

it('offers the other destination on the second button', () => {
  expect(otherDestination('computer')).to.equal('media');
  expect(otherDestination('media')).to.equal('computer');
});
