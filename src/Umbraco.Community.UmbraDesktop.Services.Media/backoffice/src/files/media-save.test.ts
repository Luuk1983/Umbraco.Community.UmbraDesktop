import { expect } from '@open-wc/testing';
import { changedSince, routeSave } from './media-save.js';
import type { MediaSaveRequest, SaveSteps } from './media-save.js';

/**
 * Whether a media item was changed by somebody else since an app window opened or last
 * saved it, judged by the item's update date. A save over a changed item asks first, so this is
 * what stands between a person's work and a file somebody replaced in the Media section.
 */

it('sees no change when the item was last changed when it was opened', () => {
  expect(changedSince('2026-09-01T10:00:00', '2026-09-01T10:00:00')).to.equal(false);
});

it('sees a change when the item was changed after it was opened', () => {
  expect(changedSince('2026-09-01T10:00:00', '2026-09-01T10:05:00')).to.equal(true);
});

/**
 * Nothing to compare with is not a conflict. Asking over every save of an item whose date was never
 * known would be a question with one answer, which teaches people to click through the one that
 * matters.
 */
it('sees no change when either date is unknown', () => {
  for (const [opened, current] of [
    [undefined, '2026-09-01T10:00:00'],
    [null, '2026-09-01T10:00:00'],
    ['2026-09-01T10:00:00', undefined],
    ['2026-09-01T10:00:00', null],
  ] as const) {
    expect(changedSince(opened, current), `${opened} then ${current}`).to.equal(false);
  }
});

/**
 * Which way a save goes (#137, found by the reviewer: the routing had no test). A save over an item
 * that is gone, and a copy of an item that is gone, both become a plain new item; a copy says so,
 * because the person asked for a copy with the original's properties and did not get one.
 */
describe('routing a save', () => {
  /**
   * Fake steps that record which ran.
   * @param answers What replace and copy answer; a result, or null to make way for a new item.
   * @returns The steps and the names of those that ran.
   */
  function steps(answers: { replace?: unknown; copy?: unknown } = {}) {
    const ran: string[] = [];
    const fake: SaveSteps = {
      replace: async () => (ran.push('replace'), ('replace' in answers ? answers.replace : { ok: true, unique: 'k1' }) as never),
      copy: async () => (ran.push('copy'), ('copy' in answers ? answers.copy : { ok: true, unique: 'c1', copied: 'full' }) as never),
      createNew: async () => (ran.push('new'), { ok: true, unique: 'n1' }),
      plainCopyNotice: () => 'plain',
    };
    return { fake, ran };
  }
  const base: MediaSaveRequest = { file: new File(['x'], 'beach.jpg'), name: 'beach', folder: 'f1' };

  it('overwrites the existing item, and creates a new one when it is gone', async () => {
    const over = steps();
    expect(await routeSave(over.fake, { ...base, existing: 'k1', copyOf: 'k0' })).to.deep.equal({ ok: true, unique: 'k1' });
    expect(over.ran).to.deep.equal(['replace']);
    const gone = steps({ replace: null });
    expect(await routeSave(gone.fake, { ...base, existing: 'k1' })).to.deep.equal({ ok: true, unique: 'n1' });
    expect(gone.ran).to.deep.equal(['replace', 'new']);
  });

  it('copies the item named, and says so when it had to make a plain new item instead', async () => {
    const full = steps();
    expect(await routeSave(full.fake, { ...base, copyOf: 'k0' })).to.deep.equal({ ok: true, unique: 'c1', copied: 'full' });
    expect(full.ran).to.deep.equal(['copy']);
    const plain = steps({ copy: null });
    expect(await routeSave(plain.fake, { ...base, copyOf: 'k0' })).to.deep.equal({ ok: true, unique: 'n1', copied: 'plain', notice: 'plain' });
    expect(plain.ran).to.deep.equal(['copy', 'new']);
  });

  it('passes on a refused copy, and makes no plain item behind its back', async () => {
    const refused = steps({ copy: { ok: false, message: 'no' } });
    expect(await routeSave(refused.fake, { ...base, copyOf: 'k0' })).to.deep.equal({ ok: false, message: 'no' });
    expect(refused.ran).to.deep.equal(['copy']);
  });

  it('creates a plain new item for anything else', async () => {
    const plain = steps();
    await routeSave(plain.fake, base);
    expect(plain.ran).to.deep.equal(['new']);
  });
});

/**
 * `versioned` (#176): Replace file in the Media add-on writes the hashed name the editor's save over
 * uses (edit-image design §11.4), so a replaced picture gets a new address and no cache shows the old.
 */
describe('a versioned save', () => {
  /**
   * The file a save hands to its step.
   * @param request What to save.
   * @returns The file the replace step received.
   */
  async function savedFile(request: MediaSaveRequest): Promise<File> {
    let seen: File | undefined;
    await routeSave(
      {
        replace: async (r) => ((seen = r.file), { ok: true, unique: 'k1' }),
        copy: async () => null,
        createNew: async (r) => ((seen = r.file), { ok: true, unique: 'n1' }),
        plainCopyNotice: () => '',
      },
      request,
    );
    return seen!;
  }

  it('versioned names the file after its contents', async () => {
    const file = await savedFile({ file: new File(['pixels'], 'beach.jpg', { type: 'image/jpeg' }), name: 'Beach', folder: null, existing: 'k1', versioned: true });
    expect(file.name).to.match(/^beach-ud[0-9a-f]{8}\.jpg$/);
    expect(file.type).to.equal('image/jpeg');
  });

  it('versioned replaces an earlier marker', async () => {
    const file = await savedFile({ file: new File(['other'], 'beach-ud3f9a1c07.jpg'), name: 'Beach', folder: null, existing: 'k1', versioned: true });
    expect(file.name).to.match(/^beach-ud[0-9a-f]{8}\.jpg$/);
    expect(file.name).not.to.equal('beach-ud3f9a1c07.jpg');
  });

  it('same bytes, same name', async () => {
    const a = await savedFile({ file: new File(['same'], 'a.png'), name: 'A', folder: null, existing: 'k1', versioned: true });
    const b = await savedFile({ file: new File(['same'], 'a.png'), name: 'A', folder: null, existing: 'k1', versioned: true });
    expect(a.name).to.equal(b.name);
  });

  it('without versioned the name is untouched', async () => {
    const file = await savedFile({ file: new File(['pixels'], 'beach.jpg'), name: 'Beach', folder: null, existing: 'k1' });
    expect(file.name).to.equal('beach.jpg');
  });
});
