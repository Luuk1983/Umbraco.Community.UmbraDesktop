import { expect } from '@open-wc/testing';
import { windowNotices, worstSeverity } from './notices.js';
import type { UmbraDesktopWindow } from '../types.js';

/**
 * Design §3. Four facts, not four alternatives: a document can be in the recycle bin *and* have
 * been changed by somebody else *and* hold unsaved changes, and each is its own notice with its own
 * wording and its own actions. Everything visible reads this one list, so these are the tests that
 * pin the behaviour of the marker, the banners and the taskbar badge at once.
 */

/** A window carrying only the state these functions read. */
function win(over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  return {
    id: 'w1',
    app: { alias: 'a', name: 'A', icon: 'icon-umbraco', content: { kind: 'iframe', url: 'about:blank' } },
    rect: { x: 0, y: 0, w: 10, h: 10 },
    z: 1,
    active: true,
    state: 'normal',
    ...over,
  } as UmbraDesktopWindow;
}

it('says nothing about a clean untouched window', () => {
  expect(windowNotices(win())).to.eql([]);
  expect(worstSeverity(windowNotices(win()))).to.equal(undefined);
});

it('gives unsaved changes an info notice with no banner', () => {
  const notices = windowNotices(win({ dirty: true }));
  expect(notices.map((n) => n.id)).to.eql(['unsaved']);
  expect(notices[0].severity).to.equal('info');
  expect(notices[0].banner).to.equal(false);
  expect(worstSeverity(notices)).to.equal('info');
});

it('gives a conflict a warning notice with a banner and two actions', () => {
  const notices = windowNotices(win({ dirty: true, changedElsewhere: true }));
  expect(notices.map((n) => n.id)).to.eql(['changed-elsewhere', 'unsaved']);
  expect(notices[0].severity).to.equal('warning');
  expect(notices[0].banner).to.equal(true);
  expect(notices[0].actions).to.eql(['acknowledge', 'discard-and-load']);
  expect(worstSeverity(notices)).to.equal('warning');
});

it('drops the conflict banner once acknowledged but keeps the notice', () => {
  const notices = windowNotices(win({ dirty: true, changedElsewhere: true, acknowledged: true }));
  expect(notices.map((n) => n.id)).to.eql(['changed-elsewhere', 'unsaved']);
  expect(notices[0].banner).to.equal(false);
  expect(notices[0].actions).to.eql([]);
  // The marker and the badge read this, so the window must not go back to looking safe.
  expect(worstSeverity(notices)).to.equal('warning');
});

it('trims an acknowledged conflict down to the short heading, since it is no longer news', () => {
  // The titlebar marker and the taskbar badge both take their label straight from `notices[0].title`
  // (see `window.element.ts` and `taskbar.element.ts`), so this one change is what makes both
  // surfaces read "Changed by someone else" instead of the full "Someone else changed this while
  // you were editing it" once the editor has confirmed they mean to keep their own version.
  const unacknowledged = windowNotices(win({ dirty: true, changedElsewhere: true }));
  expect(unacknowledged[0].title).to.equal('umbraDesktop_noticeChangedTitle');

  const acknowledged = windowNotices(win({ dirty: true, changedElsewhere: true, acknowledged: true }));
  expect(acknowledged[0].title).to.equal('umbraDesktop_noticeAcknowledged');
});

it('gives a trashed window with unsaved work an error and no actions', () => {
  // `error` and not `warning`, for the same reason `deleted` is one: an item in the recycle bin is
  // read-only, so the moment this window catches up with the bin there is no way to save the work
  // in it. A warning says "this could go badly"; both of these say "your changes have nowhere to
  // go". No actions all the same — the bin is somebody's to undo, not this window's.
  const notices = windowNotices(win({ dirty: true, trashed: true }));
  expect(notices.map((n) => n.id)).to.eql(['trashed', 'unsaved']);
  expect(notices[0].severity).to.equal('error');
  expect(notices[0].actions).to.eql([]);
  expect(notices[0].banner).to.equal(true);
});

it('says nothing about a trashed window with nothing unsaved', () => {
  // Design D8: it reloaded in place and Umbraco's own UI shows the bin state.
  expect(windowNotices(win({ trashed: true }))).to.eql([]);
});

it('says nothing about a changed window with nothing unsaved', () => {
  // The symmetric case to the trashed one above: nothing is at risk, so the window has already
  // taken the server's version in place rather than arguing about it.
  expect(windowNotices(win({ changedElsewhere: true }))).to.eql([]);
});

it('raises two notices when a document was trashed and changed', () => {
  const notices = windowNotices(win({ dirty: true, trashed: true, changedElsewhere: true }));
  expect(notices.map((n) => n.id)).to.eql(['trashed', 'changed-elsewhere', 'unsaved']);
  expect(notices.filter((n) => n.banner).length).to.equal(2);
});

it('gives a deleted window an error notice, dirty or not', () => {
  const dirty = windowNotices(win({ dirty: true, deleted: true }));
  expect(dirty.map((n) => n.id)).to.eql(['deleted', 'unsaved']);
  expect(dirty[0].severity).to.equal('error');
  expect(dirty[0].actions).to.eql([]);
  expect(worstSeverity(dirty)).to.equal('error');

  const clean = windowNotices(win({ deleted: true }));
  expect(clean.map((n) => n.id)).to.eql(['deleted']);
  expect(clean[0].severity).to.equal('error');
});

it('says different things about a deleted window depending on unsaved work', () => {
  const dirty = windowNotices(win({ dirty: true, deleted: true }))[0];
  const clean = windowNotices(win({ deleted: true }))[0];
  expect(dirty.body).to.not.equal(clean.body);
});

it('drops the lesser notices once a document is gone', () => {
  // There is nothing to conflict with and nothing to restore from the bin.
  const notices = windowNotices(win({ dirty: true, deleted: true, trashed: true, changedElsewhere: true }));
  expect(notices.map((n) => n.id)).to.eql(['deleted', 'unsaved']);
});

it('orders notices worst first', () => {
  const notices = windowNotices(win({ dirty: true, deleted: true }));
  expect(notices.map((n) => n.severity)).to.eql(['error', 'info']);
});

it('returns the worst severity rather than the first', () => {
  // Every other case in this file feeds it an already-sorted list, so nothing here would notice an
  // implementation that just read the head of the array. This is the case that does.
  const notices = windowNotices(win({ dirty: true, deleted: true }));
  const infoFirst = [...notices].sort((a, _b) => (a.severity === 'info' ? -1 : 1));
  expect(infoFirst[0].severity).to.equal('info');
  expect(worstSeverity(infoFirst)).to.equal('error');
});
