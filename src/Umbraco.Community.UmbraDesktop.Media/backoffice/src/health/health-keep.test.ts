import { expect } from '@open-wc/testing';
import { keepingOf, keepEndsOn, entryIdOfKeep } from './health-keep.js';
import { cleanupOf, listsOf } from './health-model.js';
import type { HealthKeep } from './health.client.js';
import { MB, item, orphan } from './health.test-helper.js';

/** Keeps in the browser (design §16.6, plan Decision 5): what they take out of the lists, and what stays. */

/**
 * A keep as the server lists it.
 * @param over What differs from an active keep on the item `old`, kept from Unused, always.
 * @returns The keep.
 */
const keep = (over: Partial<HealthKeep> = {}): HealthKeep => ({
  id: 1,
  kind: 'Unused',
  target: 'old',
  note: 'Press page',
  untilUtc: null,
  keptBy: 'u',
  keptByName: 'Edith',
  keptUtc: '2026-10-29T10:00:00Z',
  ended: null,
  ...over,
});

const big = item({ key: 'big', name: 'Hero', sizeBytes: 3 * MB });
const old = item({ key: 'old', name: 'Old banner', used: false, usageCount: 0, sizeBytes: 500 });
const files = [orphan('1/x.jpg', 30), orphan('2/y.png', 10)];

describe('keeps in the browser', () => {
  it('takes an image kept from Oversized out of the oversized list, and counts it there', () => {
    const keeping = keepingOf(listsOf([big, old], files), [big, old], [keep({ kind: 'Oversized', target: 'big' })]);
    expect(keeping.lists.oversized).to.deep.equal([]);
    expect(keeping.keptCount).to.deep.equal({ unused: 0, orphaned: 0, oversized: 1 });
  });

  it('keeps it out of every list: once the image is unused, it is out of that list too (plan Decision 6)', () => {
    const unusedBig = { ...big, used: false, usageCount: 0 };
    const keeping = keepingOf(listsOf([unusedBig, old], files), [unusedBig, old], [keep({ kind: 'Oversized', target: 'big' })]);
    expect(keeping.lists.unused.map((each) => each.key)).to.deep.equal(['old']);
    expect(keeping.keptCount.unused).to.equal(1);
  });

  it('takes a kept orphaned file out of its list, and lists it as kept with its keep', () => {
    const keeping = keepingOf(listsOf([big, old], files), [big, old], [keep({ kind: 'Orphaned', target: '1/x.jpg' })]);
    expect(keeping.lists.orphaned.map((each) => each.relativePath)).to.deep.equal(['2/y.png']);
    const [kept] = keeping.kept;
    expect([kept.id, kept.kind, kept.name, kept.keep?.note]).to.deep.equal(['orphan:1/x.jpg', 'orphaned', 'x.jpg', 'Press page']);
  });

  it('leaves a thing whose keep ended in its list, its keep found by the entry for the badge', () => {
    const ended = keep({ ended: 'Expired', untilUtc: '2026-10-27T12:00:00Z' });
    const keeping = keepingOf(listsOf([big, old], files), [big, old], [ended]);
    expect(keeping.lists.unused.map((each) => each.key)).to.deep.equal(['old']);
    expect(keeping.ended.get('old')).to.equal(ended);
    expect(keeping.kept).to.deep.equal([]);
    expect(keeping.keptCount.unused).to.equal(0);
  });

  it('lists a kept item that is no longer in any list under Kept, since the keep still holds', () => {
    const keeping = keepingOf(listsOf([big, old], files), [big, old], [keep({ target: 'big' })]);
    expect(keeping.kept.map((each) => each.id)).to.deep.equal(['big']);
    expect(keeping.keptCount.unused).to.equal(0);
  });

  it('lists nothing for a keep of something the result does not have', () => {
    expect(keepingOf(listsOf([big], files), [big], [keep({ target: 'gone' })]).kept).to.deep.equal([]);
  });

  it('leaves kept things out of Clean up and what it frees', () => {
    const lists = listsOf([big, old], files);
    const before = cleanupOf(lists, new Set(['unused']), true).bytes;
    const after = cleanupOf(keepingOf(lists, [big, old], [keep()]).lists, new Set(['unused']), true).bytes;
    expect(before - after).to.equal(500);
  });

  it('names a keep by the id its entry has', () => {
    expect(entryIdOfKeep(keep({ target: 'ABC' }))).to.equal('abc');
    expect(entryIdOfKeep(keep({ kind: 'Orphaned', target: '1/x.jpg' }))).to.equal('orphan:1/x.jpg');
  });

  it('says when a keep ends, or that it is always', () => {
    expect(keepEndsOn(keep())).to.equal(null);
    expect(keepEndsOn(keep({ untilUtc: '2027-10-29T10:00:00Z' }))?.toISOString()).to.equal('2027-10-29T10:00:00.000Z');
  });
});
