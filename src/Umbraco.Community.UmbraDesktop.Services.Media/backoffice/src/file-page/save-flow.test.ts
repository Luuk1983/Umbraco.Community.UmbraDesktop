import { expect } from '@open-wc/testing';
import { runSave, saveAsDefaults } from './save-flow.js';
import type { SaveChoice } from './save-flow.js';
import type { FilePageDeps } from './deps.js';
import type { FilePageDocument, FileSavedDetail, SaveFormat } from './types.js';
import type { MediaSaveRequest, MediaSaveResult } from '../files/media-save.js';

/**
 * What a File page save sends to the media context, and what it hands back to the app. Pure apart
 * from the context, so every path is driven with a fake. Issue #136, design §6.
 */

/** A document to save. */
const DOC: FilePageDocument = {
  unique: 'k1',
  name: 'beach',
  folder: 'f1',
  folderName: 'Holidays',
  updateDate: 'd1',
  extension: 'jpg',
  width: 1600,
  height: 1200,
  bytes: 2_000_000,
};

/** A context that records requests and answers from a queue. */
function fakeContext(answers: MediaSaveResult[], overwrite = true) {
  const requests: MediaSaveRequest[] = [];
  let asked = 0;
  const context: FilePageDeps['context'] = {
    open: async () => ({ status: 'cancelled' }),
    recent: async () => [],
    forgetRecent: () => undefined,
    save: async (request) => {
      requests.push(request);
      return answers.shift() ?? { ok: true, unique: request.existing ?? 'new', updateDate: 'd2' };
    },
    pickSaveFolder: async () => ({ status: 'cancelled' }),
    confirmOverwrite: async () => {
      asked++;
      return overwrite;
    },
  };
  return { context, requests, asked: () => asked };
}

/** An encoder that records what it was asked for. */
function fakeEncoder() {
  const calls: Array<[SaveFormat, number]> = [];
  const encode = async (format: SaveFormat, quality: number) => {
    calls.push([format, quality]);
    return new Blob(['x'.repeat(quality)], { type: `image/${format}` });
  };
  return { encode, calls };
}

/** Keep, as Save would choose it. */
const keep = (document: FilePageDocument): SaveChoice => saveAsDefaults(document, '%0% (copy)');

it('starts Save as on replace, in the kept format at quality 90, with a copy named from the pattern', () => {
  expect(saveAsDefaults(DOC, '%0% (copy)')).to.deep.equal({
    mode: 'replace',
    name: 'beach (copy)',
    folder: 'f1',
    folderName: 'Holidays',
    format: 'jpeg',
    quality: 90,
  });
  expect(saveAsDefaults({ ...DOC, extension: 'gif' }, '%0% (copy)').format, 'a GIF cannot be kept').to.equal('png');
  expect(saveAsDefaults(DOC, '%0% (copy)', 'webp').format).to.equal('webp');
});

it('replaces with the item, its date and the focal-point reset; a copy sends none of them', async () => {
  const { context, requests } = fakeContext([]);
  const { encode } = fakeEncoder();
  await runSave(context, DOC, keep(DOC), encode, true);
  expect(requests[0].existing).to.equal('k1');
  expect(requests[0].expectedUpdateDate).to.equal('d1');
  expect(requests[0].resetFocalPoint).to.equal(true);

  await runSave(context, DOC, { ...keep(DOC), mode: 'copy', folder: 'f9', name: 'beach (copy)' }, encode, true);
  expect(requests[1].existing).to.equal(undefined);
  expect(requests[1].expectedUpdateDate).to.equal(undefined);
  expect(requests[1].resetFocalPoint).to.equal(undefined);
  expect(requests[1].folder).to.equal('f9');
  expect(requests[1].name).to.equal('beach (copy)');
});

it('asks on a conflict, and saves again with force on yes', async () => {
  const { context, requests, asked } = fakeContext([{ ok: false, conflict: true }]);
  const outcome = await runSave(context, DOC, keep(DOC), fakeEncoder().encode, false);
  expect(asked()).to.equal(1);
  expect(requests).to.have.length(2);
  expect(requests[1].force).to.equal(true);
  expect(outcome.status).to.equal('saved');
});

it('writes nothing and answers cancelled when the conflict is answered no', async () => {
  const { context, requests } = fakeContext([{ ok: false, conflict: true }], false);
  const outcome = await runSave(context, DOC, keep(DOC), fakeEncoder().encode, false);
  expect(requests).to.have.length(1);
  expect(outcome).to.deep.equal({ status: 'cancelled' });
});

it("answers failed with the backoffice's reason", async () => {
  const { context } = fakeContext([{ ok: false, message: 'Not allowed here' }]);
  const outcome = await runSave(context, DOC, keep(DOC), fakeEncoder().encode, false);
  expect(outcome).to.deep.equal({ status: 'failed', message: 'Not allowed here' });
});

it('names the file from the document and the format', async () => {
  const { context, requests } = fakeContext([]);
  const { encode, calls } = fakeEncoder();
  await runSave(context, DOC, keep(DOC), encode, false);
  expect(requests[0].file.name).to.equal('beach.jpg');
  expect(requests[0].file.type).to.equal('image/jpeg');
  expect(calls[0]).to.deep.equal(['jpeg', 90]);

  await runSave(context, DOC, { ...keep(DOC), format: 'webp', quality: 70 }, encode, false);
  expect(requests[1].file.name).to.equal('beach.webp');
  expect(calls[1]).to.deep.equal(['webp', 70]);

  const outcome = await runSave(context, { ...DOC, name: 'sunset' }, keep({ ...DOC, name: 'sunset' }), encode, false);
  expect(requests[2].file.name).to.equal('sunset.jpg');
  expect(requests[2].name).to.equal('sunset');
  expect(outcome.status === 'saved' && outcome.saved.name).to.equal('sunset');
});

it('saves over the copy, with its date, once a copy was saved and the document moved onto it', async () => {
  const { context, requests } = fakeContext([{ ok: true, unique: 'copy1', updateDate: 'c1' }]);
  const { encode } = fakeEncoder();
  const first = await runSave(context, DOC, { ...keep(DOC), mode: 'copy', name: 'beach (copy)' }, encode, false);
  expect(first.status).to.equal('saved');
  const saved = (first as { saved: FileSavedDetail }).saved;
  expect(saved).to.deep.equal({
    unique: 'copy1',
    updateDate: 'c1',
    name: 'beach (copy)',
    extension: 'jpg',
    folder: 'f1',
    folderName: 'Holidays',
    copy: true,
    bytes: 90,
    fileName: 'beach (copy).jpg',
  });

  // The app takes the saved facts as its document's, then presses Save.
  const onCopy: FilePageDocument = { ...DOC, ...saved };
  await runSave(context, onCopy, keep(onCopy), encode, false);
  expect(requests[1].existing, 'the copy, never the original').to.equal('copy1');
  expect(requests[1].expectedUpdateDate).to.equal('c1');
});

it('creates an item for a document that was never saved, in its folder', async () => {
  const { context, requests } = fakeContext([]);
  const never: FilePageDocument = { ...DOC, unique: null, updateDate: undefined };
  const outcome = await runSave(context, never, keep(never), fakeEncoder().encode, true);
  expect(requests[0].existing).to.equal(undefined);
  expect(requests[0].folder).to.equal('f1');
  expect(requests[0].resetFocalPoint).to.equal(undefined);
  expect(outcome.status === 'saved' && outcome.saved.copy).to.equal(false);
});

it("keeps the file's own name on a replace, so its address stays the same in its own format", async () => {
  const { context, requests } = fakeContext([]);
  const { encode } = fakeEncoder();
  const named: FilePageDocument = { ...DOC, fileName: '16403439029_f500be349b_o.jpg' };
  const kept = await runSave(context, named, keep(named), encode, false);
  expect(requests[0].file.name).to.equal('16403439029_f500be349b_o.jpg');
  expect(kept.status === 'saved' && kept.saved.fileName).to.equal('16403439029_f500be349b_o.jpg');
  await runSave(context, named, { ...keep(named), format: 'webp' }, encode, false);
  expect(requests[1].file.name, 'a new format changes only the extension').to.equal('16403439029_f500be349b_o.webp');
  await runSave(context, named, { ...keep(named), mode: 'copy', name: 'beach (copy)' }, encode, false);
  expect(requests[2].file.name, 'a copy is named after itself').to.equal('beach (copy).jpg');
});
