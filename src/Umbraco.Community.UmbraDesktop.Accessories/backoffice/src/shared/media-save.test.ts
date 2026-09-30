import { expect } from '@open-wc/testing';
import { changedSince } from './media-save.js';

/**
 * Whether a media item was changed by somebody else since a Notepad or Paint window opened or last
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
