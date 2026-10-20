import { expect } from '@open-wc/testing';
import { runSave, saveAsDefaults } from './save-flow.js';
import { contentHash } from './formats.js';
import type { SaveChoice } from './save-flow.js';
import type { FileMenuDeps } from './deps.js';
import type { FileMenuDocument, FileSavedDetail, SaveFormat } from './types.js';
import type { MediaSaveRequest, MediaSaveResult } from '../files/media-save.js';

/**
 * What a file menu save sends to the media context, and what it hands back to the app. Pure apart
 * from the context, so every path is driven with a fake. Issue #136, design §6.
 */

/** A document to save. */
const DOC: FileMenuDocument = {
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
  const context: FileMenuDeps['context'] = {
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
const keep = (document: FileMenuDocument): SaveChoice => saveAsDefaults(document, '%0% (copy)');

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

it('replaces with the item, its date and the focal-point reset', async () => {
  const { context, requests } = fakeContext([]);
  await runSave(context, DOC, keep(DOC), fakeEncoder().encode, true);
  expect(requests[0].existing).to.equal('k1');
  expect(requests[0].expectedUpdateDate).to.equal('d1');
  expect(requests[0].resetFocalPoint).to.equal(true);
  expect(requests[0].copyOf).to.equal(undefined);
});

/**
 * A copy is a full copy of the item the document came from (edit-image design §11.6): it names that
 * item as `copyOf`, so the new item takes its media type and properties, and it carries the
 * focal-point reset, since the focal point it copies was set on the picture before the reframe.
 */
it('copies with the item it is a copy of and the focal-point reset, and never overwrites it', async () => {
  const { context, requests } = fakeContext([]);
  const copy: SaveChoice = { ...keep(DOC), mode: 'copy', folder: 'f9', name: 'beach (copy)' };
  await runSave(context, DOC, copy, fakeEncoder().encode, true);
  expect(requests[0].copyOf).to.equal('k1');
  expect(requests[0].resetFocalPoint).to.equal(true);
  expect(requests[0].existing).to.equal(undefined);
  expect(requests[0].expectedUpdateDate).to.equal(undefined);
  expect(requests[0].folder).to.equal('f9');
  expect(requests[0].name).to.equal('beach (copy)');

  await runSave(context, DOC, copy, fakeEncoder().encode, false);
  expect(requests[1].resetFocalPoint).to.equal(false);
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
  expect(requests[0].file.name).to.match(/^beach-ud[0-9a-f]{8}\.jpg$/);
  expect(requests[0].file.type).to.equal('image/jpeg');
  expect(calls[0]).to.deep.equal(['jpeg', 90]);

  await runSave(context, DOC, { ...keep(DOC), format: 'webp', quality: 70 }, encode, false);
  expect(requests[1].file.name).to.match(/^beach-ud[0-9a-f]{8}\.webp$/);
  expect(calls[1]).to.deep.equal(['webp', 70]);

  const outcome = await runSave(context, { ...DOC, name: 'sunset' }, keep({ ...DOC, name: 'sunset' }), encode, false);
  expect(requests[2].file.name).to.match(/^sunset-ud[0-9a-f]{8}\.jpg$/);
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
  const onCopy: FileMenuDocument = { ...DOC, ...saved };
  await runSave(context, onCopy, keep(onCopy), encode, false);
  expect(requests[1].existing, 'the copy, never the original').to.equal('copy1');
  expect(requests[1].expectedUpdateDate).to.equal('c1');
});

it('creates an item for a document that was never saved, in its folder', async () => {
  const { context, requests } = fakeContext([]);
  const never: FileMenuDocument = { ...DOC, unique: null, updateDate: undefined };
  const outcome = await runSave(context, never, keep(never), fakeEncoder().encode, true);
  expect(requests[0].existing).to.equal(undefined);
  expect(requests[0].folder).to.equal('f1');
  expect(requests[0].resetFocalPoint).to.equal(undefined);
  expect(requests[0].copyOf, 'there is nothing to copy').to.equal(undefined);
  expect(outcome.status === 'saved' && outcome.saved.copy).to.equal(false);
});

/**
 * #137: a save over an item names the file after its own name with a hash of the new contents, as
 * core gives a replaced file the name of the file uploaded. Umbraco keeps the folder per item, so the
 * name is what moves the address, and a new address is what stops every browser cache, thumbnails
 * included, from showing the old picture. Measured in a real backoffice: under the same name, core's
 * own workspace went on showing the old file.
 */
describe('the file name of a save over an item', () => {
  /** The hash of what the fake encoder writes at a quality. */
  const hashAt = async (quality: number) => contentHash(new Uint8Array(await (await fakeEncoder().encode('jpeg', quality)).arrayBuffer()));

  it("is the file's own name with a hash of the new contents", async () => {
    const { context, requests } = fakeContext([]);
    const named: FileMenuDocument = { ...DOC, fileName: '16403439029_f500be349b_o.jpg' };
    const saved = await runSave(context, named, keep(named), fakeEncoder().encode, false);
    const expected = `16403439029_f500be349b_o-ud${await hashAt(90)}.jpg`;
    expect(requests[0].file.name).to.equal(expected);
    expect(saved.status === 'saved' && saved.saved.fileName).to.equal(expected);
  });

  it('keeps the name for the same contents, and changes it for others', async () => {
    const { context, requests } = fakeContext([]);
    const named: FileMenuDocument = { ...DOC, fileName: `beach-ud${await hashAt(90)}.jpg` };
    await runSave(context, named, keep(named), fakeEncoder().encode, false);
    expect(requests[0].file.name, 'the same bytes').to.equal(named.fileName);
    await runSave(context, named, { ...keep(named), quality: 80 }, fakeEncoder().encode, false);
    expect(requests[1].file.name, 'other bytes, one hash, never two').to.equal(`beach-ud${await hashAt(80)}.jpg`);
  });

  it('takes the extension of a new format, and the item name when the file name is not known', async () => {
    const { context, requests } = fakeContext([]);
    const named: FileMenuDocument = { ...DOC, fileName: 'beach.jpg' };
    await runSave(context, named, { ...keep(named), format: 'webp' }, fakeEncoder().encode, false);
    expect(requests[0].file.name).to.match(/^beach-ud[0-9a-f]{8}\.webp$/);
    await runSave(context, DOC, keep(DOC), fakeEncoder().encode, false);
    expect(requests[1].file.name).to.match(/^beach-ud[0-9a-f]{8}\.jpg$/);
  });

  it('is not given to a copy or a first save, which are new items at new addresses anyway', async () => {
    const { context, requests } = fakeContext([]);
    const named: FileMenuDocument = { ...DOC, fileName: 'beach.jpg' };
    await runSave(context, named, { ...keep(named), mode: 'copy', name: 'beach (copy)' }, fakeEncoder().encode, false);
    expect(requests[0].file.name).to.equal('beach (copy).jpg');
    const never: FileMenuDocument = { ...DOC, unique: null };
    await runSave(context, never, keep(never), fakeEncoder().encode, false);
    expect(requests[1].file.name).to.equal('beach.jpg');
  });
});

/**
 * Saving over an item used elsewhere asks first (#137, edit-image design §5). The question is the
 * file menu's, which knows whether it has already been asked for the open file; `runSave` asks it
 * before every save over an item, and never for a copy, which changes nothing else.
 */
describe('the used-elsewhere question', () => {
  it('is asked before a save over the item, and a no saves and encodes nothing', async () => {
    const { context, requests } = fakeContext([]);
    const { encode, calls } = fakeEncoder();
    let asked = 0;
    const outcome = await runSave(context, DOC, keep(DOC), encode, false, async () => (asked++, false));
    expect(asked).to.equal(1);
    expect(outcome).to.deep.equal({ status: 'cancelled' });
    expect(requests.length).to.equal(0);
    expect(calls.length).to.equal(0);
  });

  it('lets the save through on a yes', async () => {
    const { context, requests } = fakeContext([]);
    const { encode } = fakeEncoder();
    const outcome = await runSave(context, DOC, keep(DOC), encode, false, async () => true);
    expect(outcome.status).to.equal('saved');
    expect(requests.length).to.equal(1);
  });

  it('is not asked for a copy, or for a document never saved', async () => {
    const { context } = fakeContext([]);
    const { encode } = fakeEncoder();
    let asked = 0;
    const ask = async () => (asked++, true);
    await runSave(context, DOC, { ...keep(DOC), mode: 'copy' }, encode, false, ask);
    await runSave(context, { ...DOC, unique: null }, keep(DOC), encode, false, ask);
    expect(asked).to.equal(0);
  });
});

/**
 * What a copy's save tells the app (#137): whether it is a full copy, so an app drops what a plain
 * new item does not have (the Image Editor's focal point), and anything the person should know, such
 * as a property the copy was made without.
 */
it("tells the app whether a copy is full, and what the person should know about it", async () => {
  const { context } = fakeContext([{ ok: true, unique: 'c1', updateDate: 'c', copied: 'full', notice: 'Saved without Licence.' }]);
  const copied = await runSave(context, DOC, { ...keep(DOC), mode: 'copy', name: 'beach (copy)' }, fakeEncoder().encode, false);
  expect(copied.status === 'saved' && copied.saved).to.deep.include({ copy: true, fullCopy: true, notice: 'Saved without Licence.' });
  const plain = fakeContext([{ ok: true, unique: 'c2', copied: 'plain' }]);
  const made = await runSave(plain.context, DOC, { ...keep(DOC), mode: 'copy', name: 'beach (copy)' }, fakeEncoder().encode, false);
  expect(made.status === 'saved' && made.saved.fullCopy).to.equal(false);
});
