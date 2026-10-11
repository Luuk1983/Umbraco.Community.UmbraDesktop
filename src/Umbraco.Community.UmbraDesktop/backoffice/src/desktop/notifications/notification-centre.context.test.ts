import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbraDesktopNotificationCentreContext } from './notification-centre.context.js';
import type { UmbraDesktopNotificationWindows } from './notification-centre.context.js';
import { UMBRADESKTOP_SCROLLBACK_STORAGE_KEY } from './scrollback.js';
import {
  UMBRADESKTOP_DESKTOP_SOURCE_ID,
  type UmbraDesktopNotification,
  type UmbraDesktopScrollbackEntry,
  type UmbraDesktopToast,
} from './types.js';

/**
 * The centre is where the multiplication stops: whatever arrives from however many documents, one
 * toast and one entry come out. These drive it the way the watchers do, with plain notifications,
 * and read back what the toast stack and the scrollback would draw.
 */

/** The window manager, reduced to what the centre asks of it. */
class StandInWindows implements UmbraDesktopNotificationWindows {
  /** The ids of the windows currently open. */
  open = new Set<string>(['w-a', 'w-b']);
  /** Every id focused, in order. */
  focused: string[] = [];

  /** @param id The window to focus. */
  focus(id: string) {
    this.focused.push(id);
  }

  /** @returns The open windows. */
  getWindows() {
    return [...this.open].map((id) => ({ id }));
  }
}

/**
 * A notification as a watcher hands it over.
 * @param message Its text.
 * @param extra Anything else.
 * @returns The notification.
 */
function note(message: string, extra: Partial<UmbraDesktopNotification> = {}): UmbraDesktopNotification {
  return { key: `${message}-${Math.random()}`, color: 'default', duration: 6000, message, ...extra };
}

/** A centre with a stand-in manager and a clean store, plus readers for what it holds. */
function centre(store: Storage = window.sessionStorage) {
  const host = new UmbElementControllerHost(document.createElement('div'));
  const windows = new StandInWindows();
  const context = new UmbraDesktopNotificationCentreContext(host, windows, { store, now: () => 1000 });
  let toasts: UmbraDesktopToast[] = [];
  let entries: UmbraDesktopScrollbackEntry[] = [];
  let attention = -1;
  context.toasts.subscribe((v) => (toasts = v));
  context.entries.subscribe((v) => (entries = v));
  context.attention.subscribe((v) => (attention = v));
  return {
    context,
    windows,
    toasts: () => toasts,
    entries: () => entries,
    attention: () => attention,
  };
}

const A = { sourceId: 'w-a', source: 'Content' };
const B = { sourceId: 'w-b', source: 'Media' };

beforeEach(() => window.sessionStorage.clear());
after(() => window.sessionStorage.clear());

it('shows a notification once and records it once', () => {
  const c = centre();
  c.context.raise(note('Saved', { color: 'positive' }), A);

  expect(c.toasts()).to.have.length(1);
  expect(c.toasts()[0].notification.message).to.equal('Saved');
  expect(c.entries()).to.have.length(1);
});

it('shows the same message from two windows once, pointing at the one that raised it last', () => {
  const c = centre();
  c.context.raise(note('License invalid', { color: 'warning' }), A);
  c.context.raise(note('License invalid', { color: 'warning' }), B);

  expect(c.toasts(), 'one toast, not one per window').to.have.length(1);
  expect(c.toasts()[0].count).to.equal(2);
  expect(c.toasts()[0].sourceId).to.equal('w-b');
  expect(c.entries()).to.have.length(1);
  expect(c.entries()[0].count).to.equal(2);
});

it('starts a repeated toast over rather than stacking another', () => {
  const c = centre();
  c.context.raise(note('Again'), A);
  const first = c.toasts()[0].generation;
  c.context.raise(note('Again'), A);
  expect(c.toasts()[0].generation, 'a new generation is what restarts its timer').to.not.equal(first);
});

it('counts the warnings and errors held', () => {
  const c = centre();
  expect(c.attention()).to.equal(0);
  c.context.raise(note('Careful', { color: 'warning' }), A);
  c.context.raise(note('Broken', { color: 'danger' }), A);
  c.context.raise(note('Fine', { color: 'positive' }), A);
  expect(c.attention()).to.equal(2);
});

it('takes a toast down when dismissed, and leaves its entry', () => {
  const c = centre();
  c.context.raise(note('Bye'), A);
  c.context.dismiss(c.toasts()[0].id);
  expect(c.toasts()).to.deep.equal([]);
  expect(c.entries()).to.have.length(1);
});

it('closes a staying toast when its sender closes it, and leaves a timed one alone', () => {
  const c = centre();
  const staying = note('Publishing', { duration: null });
  const timed = note('Saved');
  c.context.raise(staying, A);
  c.context.raise(timed, A);

  c.context.closed('w-a', timed.key);
  expect(c.toasts(), 'a timed toast runs its own clock, design D4').to.have.length(2);
  c.context.closed('w-b', staying.key);
  expect(c.toasts(), 'only the source that raised it can close it').to.have.length(2);
  c.context.closed('w-a', staying.key);
  expect(c.toasts().map((t) => t.notification.message)).to.deep.equal(['Saved']);
});

it('focuses the window that raised a notification when it is clicked', () => {
  const c = centre();
  c.context.raise(note('Saved'), A);
  c.context.activate(c.toasts()[0]);
  expect(c.windows.focused).to.deep.equal(['w-a']);
  expect(c.toasts(), 'a toast that has been acted on goes').to.deep.equal([]);
});

it('focuses the window from a scrollback entry too', () => {
  const c = centre();
  c.context.raise(note('Saved'), B);
  c.context.activate(c.entries()[0]);
  expect(c.windows.focused).to.deep.equal(['w-b']);
});

it('raises a notification carrying its own element again in its source window', () => {
  const c = centre();
  const raisedAgain: UmbraDesktopNotification[] = [];
  c.context.registerSource('w-a', { reraise: (n) => raisedAgain.push(n) });
  const element = { name: 'umb-peek-error-notification', data: { message: 'Could not save' } };
  c.context.raise(note('Could not save', { color: 'danger', element }), A);

  c.context.activate(c.entries()[0]);

  expect(c.windows.focused).to.deep.equal(['w-a']);
  expect(raisedAgain).to.have.length(1);
  expect(raisedAgain[0].element).to.deep.equal(element);
  expect(raisedAgain[0].color).to.equal('danger');
});

it('does not raise a plain notification again', () => {
  const c = centre();
  const raisedAgain: UmbraDesktopNotification[] = [];
  c.context.registerSource('w-a', { reraise: (n) => raisedAgain.push(n) });
  c.context.raise(note('Saved'), A);
  c.context.activate(c.entries()[0]);
  expect(raisedAgain).to.deep.equal([]);
});

it('raises through whichever source registered last, so a reloaded window is reached again', () => {
  const c = centre();
  const first: string[] = [];
  const second: string[] = [];
  const unregister = c.context.registerSource('w-a', { reraise: (n) => first.push(n.message) });
  unregister();
  c.context.registerSource('w-a', { reraise: (n) => second.push(n.message) });
  c.context.raise(note('Err', { element: { name: 'x-el', data: {} } }), A);
  c.context.activate(c.entries()[0]);
  expect(first).to.deep.equal([]);
  expect(second).to.deep.equal(['Err']);
});

it('does nothing for an entry whose window has closed', () => {
  const c = centre();
  const raisedAgain: string[] = [];
  c.context.registerSource('w-a', { reraise: (n) => raisedAgain.push(n.message) });
  c.context.raise(note('Err', { element: { name: 'x-el', data: {} } }), A);
  c.windows.open.delete('w-a');
  c.context.activate(c.entries()[0]);
  expect(c.windows.focused).to.deep.equal([]);
  expect(raisedAgain).to.deep.equal([]);
});

it("shows the desktop's own notification again as a plain desktop toast when its element is not defined", () => {
  // Was a re-raise in the desktop's document. With the element undefined (its module never loaded,
  // say after a reload with the package's tray item switched off), Umbraco's own toast draws an
  // empty box, so the desktop shows the headline and message itself instead.
  const c = centre();
  const raisedAgain: string[] = [];
  c.context.registerSource(UMBRADESKTOP_DESKTOP_SOURCE_ID, { reraise: (n) => raisedAgain.push(n.message) });
  c.context.raise(note('Err', { headline: 'Reminder', element: { name: 'x-el', data: {} } }), {
    sourceId: UMBRADESKTOP_DESKTOP_SOURCE_ID,
    source: 'Desktop',
  });
  c.context.dismiss(c.toasts()[0].id);

  c.context.activate(c.entries()[0]);

  expect(c.windows.focused).to.deep.equal([]);
  expect(raisedAgain, 'nothing raised in the document, where it would draw empty').to.deep.equal([]);
  expect(c.toasts()).to.have.length(1);
  expect(c.toasts()[0].notification.message).to.equal('Err');
  expect(c.toasts()[0].notification.headline).to.equal('Reminder');
  expect(c.entries()[0].count, 'showing it again is not another arrival').to.equal(1);
});

it("only takes a clicked plain desktop toast down, rather than bringing it straight back", () => {
  const c = centre();
  const raisedAgain: string[] = [];
  c.context.registerSource(UMBRADESKTOP_DESKTOP_SOURCE_ID, { reraise: (n) => raisedAgain.push(n.message) });
  c.context.raise(note('Err', { element: { name: 'x-el', data: {} } }), {
    sourceId: UMBRADESKTOP_DESKTOP_SOURCE_ID,
    source: 'Desktop',
  });

  c.context.activate(c.toasts()[0]);

  expect(c.toasts(), 'it was already showing everything it could').to.deep.equal([]);
  expect(raisedAgain).to.deep.equal([]);
});

/**
 * A layout the desktop can draw itself, defined so the centre knows a desktop toast would draw it.
 * Design D15.
 */
customElements.define('test-centre-note', class extends HTMLElement {});

const DESKTOP = { sourceId: UMBRADESKTOP_DESKTOP_SOURCE_ID, source: 'Desktop' };

it("shows the desktop's own notification with a drawable element again as a desktop toast", () => {
  const c = centre();
  const raisedAgain: string[] = [];
  c.context.registerSource(UMBRADESKTOP_DESKTOP_SOURCE_ID, { reraise: (n) => raisedAgain.push(n.message) });
  const element = { name: 'test-centre-note', data: { episode: 1 } };
  c.context.raise(note('Starting soon', { element }), DESKTOP);
  const firstGeneration = c.toasts()[0].generation;
  c.context.dismiss(c.toasts()[0].id);

  c.context.activate(c.entries()[0]);

  expect(raisedAgain, 'the desktop draws it now, so nothing is raised in the document').to.deep.equal([]);
  expect(c.windows.focused).to.deep.equal([]);
  expect(c.toasts()).to.have.length(1);
  expect(c.toasts()[0].notification.element).to.deep.equal(element);
  expect(c.toasts()[0].sourceId).to.equal(UMBRADESKTOP_DESKTOP_SOURCE_ID);
  expect(c.toasts()[0].source).to.equal('Desktop');
  expect(c.toasts()[0].notification.duration, 'shown again to be used, so it stays').to.equal(null);
  expect(c.toasts()[0].generation, 'a new generation, so its timer starts fresh').to.not.equal(firstGeneration);
  expect(c.entries(), 'showing it again is not another arrival').to.have.length(1);
  expect(c.entries()[0].count).to.equal(1);
});

it('does not count showing a desktop toast again as a repeat when it is still up, nor swap what it carries', () => {
  const c = centre();
  const closedIn: string[] = [];
  c.context.registerSource(UMBRADESKTOP_DESKTOP_SOURCE_ID, { reraise: () => {}, close: (key) => closedIn.push(key) });
  const raised = note('Starting soon', { duration: 6000, element: { name: 'test-centre-note', data: {} } });
  c.context.raise(raised, DESKTOP);
  const before = c.toasts()[0];

  c.context.activate(c.entries()[0]);

  expect(c.toasts()).to.have.length(1);
  expect(c.toasts()[0].count).to.equal(1);
  expect(c.entries()[0].count).to.equal(1);
  expect(c.toasts()[0].notification.key, 'still the original, so its dismissal can close it').to.equal(raised.key);
  expect(c.toasts()[0].notification.duration).to.equal(6000);
  expect(c.toasts()[0].generation, 'only its timer starts over').to.not.equal(before.generation);
  c.context.dismiss(c.toasts()[0].id);
  expect(closedIn).to.deep.equal([raised.key]);
});

it('closes every original a toast stands for, repeats included, in each source', () => {
  const c = centre();
  const closedIn: string[] = [];
  c.context.registerSource('w-a', { reraise: () => {}, close: (key) => closedIn.push(`w-a:${key}`) });
  c.context.registerSource('w-b', { reraise: () => {}, close: (key) => closedIn.push(`w-b:${key}`) });
  const first = note('Again', { duration: null });
  const second = note('Again', { duration: null });
  const third = note('Again', { duration: null });
  c.context.raise(first, A);
  c.context.raise(second, A);
  c.context.raise(third, B);

  c.context.dismiss(c.toasts()[0].id);

  expect(closedIn).to.deep.equal([`w-a:${first.key}`, `w-a:${second.key}`, `w-b:${third.key}`]);
});

it("closes a window toast's original before raising it again, and never the one raised again", () => {
  const c = centre();
  const calls: string[] = [];
  c.context.registerSource('w-a', {
    reraise: () => calls.push('reraise'),
    close: (key) => calls.push(`close:${key}`),
  });
  const raised = note('Could not save', { element: { name: 'umb-peek-error-notification', data: {} } });
  c.context.raise(raised, A);

  c.context.activate(c.toasts()[0]);

  expect(calls).to.deep.equal([`close:${raised.key}`, 'reraise']);
});

it("closes the original in its source when a toast is taken down, so it cannot turn up there later", () => {
  const c = centre();
  const closedIn: Array<[string, string]> = [];
  c.context.registerSource('w-a', { reraise: () => {}, close: (key) => closedIn.push(['w-a', key]) });
  c.context.registerSource(UMBRADESKTOP_DESKTOP_SOURCE_ID, {
    reraise: () => {},
    close: (key) => closedIn.push([UMBRADESKTOP_DESKTOP_SOURCE_ID, key]),
  });
  const fromWindow = note('From a window', { duration: null });
  const fromDesktop = note('From the desktop', { duration: null });
  const cleared = note('Cleared', { duration: null });
  c.context.raise(fromWindow, A);
  c.context.raise(fromDesktop, DESKTOP);

  c.context.dismiss(c.toasts()[0].id);
  c.context.dismiss(c.toasts()[0].id);
  c.context.raise(cleared, DESKTOP);
  c.context.clear();
  c.context.dismiss('not-showing');

  expect(closedIn).to.deep.equal([
    ['w-a', fromWindow.key],
    [UMBRADESKTOP_DESKTOP_SOURCE_ID, fromDesktop.key],
    [UMBRADESKTOP_DESKTOP_SOURCE_ID, cleared.key],
  ]);
});

it('clears the list and the toasts showing, and keeps the empty list', () => {
  const c = centre();
  c.context.raise(note('Careful', { color: 'warning' }), A);
  c.context.raise(note('Fine', { color: 'positive' }), B);

  c.context.clear();

  expect(c.entries()).to.deep.equal([]);
  expect(c.attention()).to.equal(0);
  expect(c.toasts(), 'a toast is the same notification as its line, so it goes too').to.deep.equal([]);
  expect(centre().entries(), 'a reload does not bring it back').to.deep.equal([]);
});

it('keeps the scrollback in storage, so a reloaded desktop still has it', () => {
  const first = centre();
  first.context.raise(note('Survives', { color: 'warning' }), A);
  expect(window.sessionStorage.getItem(UMBRADESKTOP_SCROLLBACK_STORAGE_KEY)).to.contain('Survives');

  const second = centre();
  expect(second.entries().map((e) => e.message)).to.deep.equal(['Survives']);
  expect(second.attention()).to.equal(1);
  expect(second.toasts(), 'a reload brings back the history, not the toasts').to.deep.equal([]);
});

it('keeps two stores apart, which is what keeps two tabs apart', () => {
  const other = new Map<string, string>();
  const otherStore = {
    getItem: (k: string) => other.get(k) ?? null,
    setItem: (k: string, v: string) => void other.set(k, v),
  } as unknown as Storage;
  const tabOne = centre();
  const tabTwo = centre(otherStore);
  tabOne.context.raise(note('Only here'), A);
  expect(tabTwo.entries()).to.deep.equal([]);
  expect(centre(otherStore).entries()).to.deep.equal([]);
});
