import { expect } from '@open-wc/testing';
import { describeDesk, type DeskView } from './desk-snapshot';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher';

/**
 * The desk snapshot is what the agent is told about the desktop, once per message. These tests are
 * over the sentence it produces, because the sentence *is* the feature: unlike Umbraco's own
 * contributors this one has no backend counterpart, so the structured `value` half of a context
 * item would be discarded and only the prose reaches the model.
 *
 * Assertions are on substrings rather than the whole string, so wording can be improved without
 * rewriting the suite, while the facts that have to be in there stay pinned.
 */

/** A window on the desk, with only the fields the snapshot reads. */
function win(over: Partial<UmbraDesktopWindow> & { id: string; appName: string }): UmbraDesktopWindow {
  // `appName` is the app's, not the window's, so it is lifted out before the rest is spread over
  // the defaults.
  const { appName, ...rest } = over;
  return {
    app: { alias: over.id, name: appName, icon: 'icon-umbraco' } as UmbraDesktopApp,
    rect: { x: 0, y: 0, w: 800, h: 600 },
    z: 1,
    active: false,
    state: 'normal',
    ...rest,
  } as UmbraDesktopWindow;
}

/** A subject, with only the two identity fields the snapshot reads. */
function subject(entityType: string, unique: string): UmbraDesktopWorkspaceSubject {
  return { entityType, unique } as UmbraDesktopWorkspaceSubject;
}

/**
 * A stand-in desk.
 * @param windows The open windows.
 * @param subjects What each window is showing, by window id.
 * @returns The two accessors the snapshot needs.
 */
function desk(
  windows: UmbraDesktopWindow[],
  subjects: Record<string, UmbraDesktopWorkspaceSubject[]> = {},
  appNames: string[] = [],
): DeskView {
  return {
    getWindows: () => windows,
    subjectsOf: (id: string) => subjects[id] ?? [],
    getApps: () => appNames.map((name) => ({ alias: name, name }) as UmbraDesktopApp),
  };
}

/**
 * Call the snapshot with a localiser.
 *
 * `describeDesk` takes one because a window's name is an app's `name`, and that is very often a
 * localisation token rather than a word: the Content editor's is `#umbraDesktop_appContentEditor`
 * and the Copilot Workspace's is `#uaiCopilotWorkspace_sectionLabel`. The element resolves those
 * when it paints a titlebar; nothing resolved them on the way to the agent until this existed, and
 * the bug was invisible to a test that only ever passed real words. Hence the default here is
 * pass-through, and the one case that is about tokens supplies its own.
 * @param view The desk, or undefined for no desktop.
 * @param localise How to resolve a name.
 * @returns The description, or undefined.
 */
const snapshot = (view: DeskView | undefined, localise: (text: string) => string = (text) => text) =>
  describeDesk(view, localise);

it('says nothing at all when there is no desktop', () => {
  // The plain backoffice. Umbraco has no per-surface conditions for these extension points yet, so
  // this contributor also runs beside the Copilot sidebar in an install with no desktop anywhere,
  // and there it must add nothing rather than describe an empty one.
  expect(snapshot(undefined)).to.equal(undefined);
});

it('reports an open desktop with nothing on it', () => {
  // Worth saying rather than staying silent: it tells the agent the desktop is there, which is what
  // makes offering to open a window a sensible thing for it to do.
  const text = snapshot(desk([]))!;

  expect(text, 'the desktop is named').to.contain('UmbraDesktop');
  expect(text.toLowerCase(), 'and reported as empty').to.contain('no windows');
});

it('names each window and what it is showing, with the key the agent can act on', () => {
  const text = snapshot(
    desk(
      [
        win({ id: 'w1', appName: 'Content' }),
        win({ id: 'w2', appName: 'Media' }),
      ],
      {
        w1: [subject('document', 'aaaaaaaa-1111-2222-3333-444444444444')],
        w2: [subject('media', 'bbbbbbbb-5555-6666-7777-888888888888')],
      },
    ),
  )!;

  expect(text).to.contain('Content');
  expect(text).to.contain('document');
  // The key is the point of contributing identity at all: the agent's server-side tools take it.
  expect(text).to.contain('aaaaaaaa-1111-2222-3333-444444444444');
  expect(text).to.contain('Media');
  expect(text).to.contain('bbbbbbbb-5555-6666-7777-888888888888');
});

it('says which window is in front', () => {
  const text = snapshot(
    desk([win({ id: 'w1', appName: 'Content' }), win({ id: 'w2', appName: 'Log Viewer', active: true })]),
  )!;

  const focusLine = text.split('\n').find((line) => line.includes('Log Viewer'))!;
  expect(focusLine, '"the window I am looking at" has to resolve to one window').to.match(/front|focus/i);
});

it('flags a window holding unsaved changes', () => {
  // The one fact here that nothing else in the room knows. An agent about to write to this node can
  // say so on the approval card it is already pausing on.
  const text = snapshot(
    desk([win({ id: 'w1', appName: 'Content', dirty: true })], {
      w1: [subject('document', 'cccccccc-9999-0000-1111-222222222222')],
    }),
  )!;

  expect(text.toLowerCase()).to.contain('unsaved');
});

it('does not claim unsaved changes on a clean window', () => {
  // The control. A snapshot that said "unsaved" about everything would make the flag worthless, and
  // worse, would talk an agent out of writes that were perfectly safe.
  const text = snapshot(
    desk([win({ id: 'w1', appName: 'Content' })], {
      w1: [subject('document', 'dddddddd-3333-4444-5555-666666666666')],
    }),
  )!;

  expect(text.toLowerCase()).to.not.contain('unsaved');
});

it('describes a window that is showing nothing in particular', () => {
  // Log Viewer, any dashboard: no workspace, so no subject. It is still on the desk and still worth
  // naming, and the line must not read as a document with a missing key.
  const text = snapshot(desk([win({ id: 'w1', appName: 'Log Viewer' })]))!;

  expect(text).to.contain('Log Viewer');
  expect(text, 'no dangling identity for a window that has none').to.not.contain('undefined');
});

it('reports a window showing more than one document', () => {
  // A split view, which the dirty watcher already tracks as two subjects on one window.
  const text = snapshot(
    desk([win({ id: 'w1', appName: 'Content' })], {
      w1: [
        subject('document', 'eeeeeeee-1111-1111-1111-111111111111'),
        subject('document', 'ffffffff-2222-2222-2222-222222222222'),
      ],
    }),
  )!;

  expect(text).to.contain('eeeeeeee-1111-1111-1111-111111111111');
  expect(text).to.contain('ffffffff-2222-2222-2222-222222222222');
});

it('does not count a minimized window as gone', () => {
  // It is still open, still possibly dirty, and still the thing the user means by "the other one".
  const text = snapshot(
    desk([win({ id: 'w1', appName: 'Content', state: 'minimized', dirty: true })]),
  )!;

  expect(text).to.contain('Content');
  expect(text.toLowerCase()).to.contain('unsaved');
});

it('localises a window name that is a token, because most of them are', () => {
  // Found in a real backoffice, not by a test: the agent was being told the user had
  // "#umbraDesktop_appContentEditor" open. Every curated app inherits its name from a manifest
  // label, so the token is the common case and a readable name is the exception.
  const text = snapshot(desk([win({ id: 'w1', appName: '#umbraDesktop_appContentEditor' })]), (name) =>
    name === '#umbraDesktop_appContentEditor' ? 'Content editor' : name,
  )!;

  expect(text, 'the model reads this, so it has to be words').to.contain('Content editor');
  expect(text).to.not.contain('#umbraDesktop_appContentEditor');
});

it('lists what the user could open, not only what they have open', () => {
  // The half of "what can you do for me" that the window list cannot answer. Without it the agent
  // knows the desk but not the desktop, so it cannot offer to open the Log Viewer and cannot
  // resolve a name the user says out loud.
  const text = snapshot(desk([], {}, ['Content editor', 'Log Viewer', 'Background Jobs']))!;

  expect(text).to.contain('Log Viewer');
  expect(text).to.contain('Background Jobs');
});

it('localises app names in that list too', () => {
  // Same trap as the window names: a catalogue entry inherits its name from a manifest label, so
  // most of these are tokens.
  const text = snapshot(desk([], {}, ['#umbraDesktop_appLogViewer']), (name) =>
    name === '#umbraDesktop_appLogViewer' ? 'Log Viewer' : name,
  )!;

  expect(text).to.contain('Log Viewer');
  expect(text).to.not.contain('#umbraDesktop_appLogViewer');
});

it('says so plainly when the desk is empty but apps exist', () => {
  // The commonest first question, asked before anything is open. It has to read as "here is what I
  // can do" rather than as an error.
  const text = snapshot(desk([], {}, ['Content editor']))!;

  expect(text.toLowerCase()).to.contain('no windows');
  expect(text).to.contain('Content editor');
});
